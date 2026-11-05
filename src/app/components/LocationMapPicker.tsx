import { useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { X } from 'lucide-react';

export type MapLocation = {
  city: string;
  address: string;
  latitude: number;
  longitude: number;
};

type Props = {
  initialQuery?: string;
  onClose: () => void;
  onSelect: (location: MapLocation) => void;
};

type AddressPart = {
  types: string[];
  long_name?: string;
  short_name?: string;
  longText?: string;
  shortText?: string;
};

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
let loaderConfigured = false;

function getPart(components: readonly AddressPart[], types: string[]): AddressPart | undefined {
  return components.find(part => types.some(type => part.types.includes(type)));
}

function getCity(components: readonly AddressPart[]): string {
  const part = getPart(components, ['locality', 'postal_town', 'administrative_area_level_3', 'administrative_area_level_2', 'sublocality']);
  return part?.long_name || part?.longText || '';
}

function isEcuador(components: readonly AddressPart[]): boolean {
  const country = getPart(components, ['country']);
  return (country?.short_name || country?.shortText) === 'EC';
}

export function LocationMapPicker({ initialQuery = '', onClose, onSelect }: Props) {
  const mapElement = useRef<HTMLDivElement>(null);
  const autocompleteElement = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const [selected, setSelected] = useState<MapLocation | null>(null);
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(Boolean(apiKey));
  const [error, setError] = useState(apiKey ? '' : 'Google Maps aún no está configurado. Solicita al administrador la clave de Google Maps.');

  useEffect(() => {
    if (!apiKey || !mapElement.current || !autocompleteElement.current) return;
    let active = true;
    let map: google.maps.Map | null = null;
    let circle: google.maps.Circle | null = null;
    let autocomplete: google.maps.places.PlaceAutocompleteElement | null = null;
    let selectListener: ((event: google.maps.places.PlacePredictionSelectEvent) => Promise<void>) | null = null;

    const init = async () => {
      try {
        if (!loaderConfigured) {
          setOptions({ key: apiKey, v: 'weekly', language: 'es', region: 'EC' });
          loaderConfigured = true;
        }
        const [{ Map }, { PlaceAutocompleteElement }, { Geocoder }] = await Promise.all([
          importLibrary('maps'), importLibrary('places'), importLibrary('geocoding'),
        ]);
        if (!active || !mapElement.current || !autocompleteElement.current) return;

        map = new Map(mapElement.current, {
          center: { lat: -0.1807, lng: -78.4678 }, zoom: 12,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        });
        const activeMap = map;
        circle = new google.maps.Circle({
          map: activeMap, radius: 18, strokeColor: '#101828', strokeWeight: 3,
          fillColor: '#FFCA0C', fillOpacity: 1, visible: false,
        });
        const activeCircle = circle;
        const geocoder = new Geocoder();

        const selectLocation = (location: MapLocation) => {
          if (!active) return;
          setSelected(location);
          setCity(location.city);
          setAddress(location.address);
          activeMap.setCenter({ lat: location.latitude, lng: location.longitude });
          activeMap.setZoom(16);
          activeCircle.setCenter({ lat: location.latitude, lng: location.longitude });
          activeCircle.setVisible(true);
          setError('');
        };

        autocomplete = new PlaceAutocompleteElement();
        autocomplete.includedRegionCodes = ['ec'];
        autocomplete.placeholder = initialQuery
          ? `Busca una dirección cerca de ${initialQuery}`
          : 'Busca una dirección en Ecuador';
        autocomplete.style.width = '100%';
        autocompleteElement.current.appendChild(autocomplete);

        selectListener = async (event: google.maps.places.PlacePredictionSelectEvent) => {
          const currentRequest = ++requestId.current;
          try {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({ fields: ['location', 'formattedAddress', 'addressComponents'] });
            if (!active || currentRequest !== requestId.current) return;
            if (!place.location) throw new Error('Sin coordenadas');
            const components = place.addressComponents || [];
            if (!isEcuador(components)) {
              setSelected(null);
              setError('Selecciona una ubicación dentro de Ecuador.');
              return;
            }
            selectLocation({
              city: getCity(components), address: place.formattedAddress || '',
              latitude: place.location.lat(), longitude: place.location.lng(),
            });
          } catch {
            if (active && currentRequest === requestId.current) setError('No se pudo obtener la dirección seleccionada. Intenta nuevamente.');
          }
        };
        autocomplete.addEventListener('gmp-select', selectListener);

        activeMap.addListener('click', async (event: google.maps.MapMouseEvent) => {
          if (!event.latLng) return;
          const currentRequest = ++requestId.current;
          const latitude = event.latLng.lat();
          const longitude = event.latLng.lng();
          selectLocation({ city: '', address: '', latitude, longitude });
          try {
            const response = await geocoder.geocode({ location: { lat: latitude, lng: longitude } });
            if (!active || currentRequest !== requestId.current) return;
            const result = response.results[0];
            if (!result) throw new Error('Sin dirección');
            if (!isEcuador(result.address_components)) {
              setSelected(null);
              setError('Selecciona una ubicación dentro de Ecuador.');
              return;
            }
            selectLocation({
              city: getCity(result.address_components), address: result.formatted_address,
              latitude, longitude,
            });
          } catch {
            if (active && currentRequest === requestId.current) setError('No se pudo obtener la dirección de este punto. Puedes completarla manualmente.');
          }
        });
        setLoading(false);
      } catch {
        if (active) {
          setLoading(false);
          setError('No se pudo cargar Google Maps. Comprueba la clave, los servicios habilitados y las restricciones del dominio.');
        }
      }
    };

    void init();
    return () => {
      active = false;
      requestId.current += 1;
      if (autocomplete && selectListener) autocomplete.removeEventListener('gmp-select', selectListener);
      autocomplete?.remove();
      if (map) google.maps.event.clearInstanceListeners(map);
      circle?.setMap(null);
    };
  }, [initialQuery]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#101828]/65 p-3 sm:p-6" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="map-picker-title" className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
          <h2 id="map-picker-title" className="text-lg font-bold text-[#101828]">Seleccionar ubicación en Google Maps</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar mapa" className="rounded p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-6">
          {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {apiKey && <>
            <div ref={autocompleteElement} className="mb-3 min-h-12" aria-label="Buscar dirección en Google Maps" />
            <p className="mb-2 text-xs text-gray-600">Busca y elige una dirección, o marca un punto en el mapa.</p>
            <div ref={mapElement} className="h-64 w-full rounded-lg border border-gray-200 sm:h-72" aria-label="Mapa interactivo de Google Maps" />
            {loading && <p role="status" className="mt-2 text-sm text-gray-600">Cargando Google Maps...</p>}
            {selected && <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-[#101828]">Ciudad o localidad
                <input value={city} onChange={event => setCity(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="text-sm font-medium text-[#101828]">Dirección
                <input value={address} onChange={event => setAddress(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
            </div>}
            <button type="button" disabled={!selected || !city.trim() || !address.trim()} onClick={() => selected && onSelect({ ...selected, city: city.trim(), address: address.trim() })} className="mt-4 w-full rounded-lg bg-[#101828] px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Usar esta ubicación</button>
          </>}
        </div>
      </div>
    </div>
  );
}
