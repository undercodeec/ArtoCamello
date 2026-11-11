import React, { useState, useEffect } from 'react';
import { ChevronDown, MessageSquare, Heart, Star, MapPin, Clock, BriefcaseBusiness } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { getPublicProfessionals, PublicProfessional } from '@/services/professionalService';
import { trackMetaEvent } from '@/shared/lib/metaPixel';
import { matchesProfessionalSearch, matchesServiceCategory, serviceLabel } from '@/app/constants/serviceSearch';
import { listPublicServiceRequests } from '@/services/requestService';
import { PublicServiceRequestPreview } from '@/domain/types';
import { getCurrentAuth } from '@/services/authService';

// Default images for fallback
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1622812947502-0a643f17387e?crop=entropy&cs=tinysrgb&fit=facearea&facepad=2&w=256&h=256&q=80";
const DEFAULT_PORTFOLIO = "https://images.unsplash.com/photo-1581561515456-426c11b151fa?crop=entropy&cs=tinysrgb&fit=max&q=80&w=1080";

export function SearchResultsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const categoryFilter = searchParams.get('c');
  const searchQuery = searchParams.get('q');
  const [activeView, setActiveView] = useState<'professionals' | 'clients'>(searchParams.get('view') === 'clients' ? 'clients' : 'professionals');

  const [professionals, setProfessionals] = useState<PublicProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [requests, setRequests] = useState<PublicServiceRequestPreview[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState(false);

  useEffect(() => {
    const term = searchQuery || categoryFilter;
    trackMetaEvent('Search', term ? { search_string: term } : undefined);
  }, [categoryFilter, searchQuery]);

  useEffect(() => {
    getPublicProfessionals()
      .then(data => {
        setProfessionals(data);
        setLoadError(false);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching professionals:", err);
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    listPublicServiceRequests()
      .then(data => {
        setRequests(data);
        setRequestsError(false);
      })
      .catch(error => {
        console.error('Error fetching public requests:', error);
        setRequestsError(true);
      })
      .finally(() => setRequestsLoading(false));
  }, []);

  const filteredProfessionals = React.useMemo(() => {
    return professionals.filter(pro =>
      (!categoryFilter || matchesServiceCategory(pro.profile?.categories || [], categoryFilter)) &&
      (!searchQuery || matchesProfessionalSearch(pro, searchQuery))
    );
  }, [professionals, categoryFilter, searchQuery]);

  const filteredRequests = React.useMemo(() => requests.filter(request =>
    (!categoryFilter || matchesServiceCategory([request.categorySlug], categoryFilter)) &&
    (!searchQuery || `${request.categorySlug} ${request.city || ''}`.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [requests, categoryFilter, searchQuery]);

  const openClientOpportunities = () => {
    const auth = getCurrentAuth();
    if (auth.isAuthenticated && auth.role === 'pro') {
      navigate('/dashboard/contacts');
      return;
    }
    if (auth.isAuthenticated) {
      navigate(auth.role === 'guest' ? '/onboarding' : '/pro');
      return;
    }
    window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { view: 'login' } }));
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-4">



      {/* Results Header */}
      <div className="flex justify-between items-center mb-6">
        <p className="text-[#62646A] text-sm font-medium">
          {activeView === 'professionals'
            ? (loading ? 'Buscando...' : loadError ? 'No se pudieron cargar los resultados' : `${filteredProfessionals.length} resultados`)
            : (requestsLoading ? 'Buscando...' : requestsError ? 'No se pudieron cargar los resultados' : `${filteredRequests.length} resultados`)}
        </p>
        <div className="flex items-center text-sm font-medium text-[#62646A] cursor-pointer">
          <span className="mr-1">Ordenar por:</span>
          <span className="font-bold text-[#404145] flex items-center">
            Relevancia <ChevronDown className="w-4 h-4 ml-1" />
          </span>
        </div>
      </div>

      <div className="mb-6 inline-flex w-full rounded-xl border border-gray-200 bg-white p-1 sm:w-auto" role="tablist" aria-label="Tipo de resultados">
        <button type="button" role="tab" aria-selected={activeView === 'professionals'} onClick={() => setActiveView('professionals')}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:flex-none ${activeView === 'professionals' ? 'bg-[#101828] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          Profesionales
        </button>
        <button type="button" role="tab" aria-selected={activeView === 'clients'} onClick={() => setActiveView('clients')}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:flex-none ${activeView === 'clients' ? 'bg-[#101828] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          Clientes buscan servicios
        </button>
      </div>

      {/* Main Content Area: Banner + Grid */}
      {activeView === 'professionals' && <div className="bg-[#FAF8F5] rounded-xl p-8 mb-8">
        <div className="flex items-start gap-4 mb-8">
          <MessageSquare className="w-8 h-8 text-[#404145] mt-1" />
          <div>
            <h2 className="text-xl font-bold text-[#404145] mb-1">
              Comunícate fácilmente con profesionales recomendados en tu sector
            </h2>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#FFCA0C] rounded-full animate-spin"></div>
          </div>
        ) : loadError ? (
          <div className="text-center py-12" role="alert">
            <p className="text-gray-500 font-medium">No se pudieron cargar los profesionales. Intenta de nuevo más tarde.</p>
          </div>
        ) : filteredProfessionals.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 font-medium">No se encontraron profesionales para esta búsqueda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredProfessionals.map((pro) => {
              // Extract info with fallbacks
              const title = pro.profile?.businessName || (pro.profile?.categories?.[0] ? `Servicios de ${serviceLabel(pro.profile.categories[0])}` : "Profesional en servicios");
              const bio = pro.profile?.bio || `Profesional verificado en ArtoCamello con ${pro.profile?.experienceYears || 0} años de experiencia.`;
              const rating = pro.profile?.rating || 5.0;
              const reviews = pro.profile?.reviewCount || 0;
              const avatar = pro.avatarUrl || DEFAULT_AVATAR;
              const portfolioImg = pro.profile?.portfolioImages?.[0] || DEFAULT_PORTFOLIO;
              const level = "Nivel " + (pro.profile?.experienceYears ? (pro.profile.experienceYears > 5 ? "2" : "1") : "1");

              return (
                <div
                  key={pro.id}
                  onClick={() => navigate(`/profile/${pro.id}`)}
                  className="bg-white rounded-md overflow-hidden shadow-sm hover:shadow-md transition-shadow group cursor-pointer border border-gray-100 flex flex-col"
                >
                  {/* Image Container */}
                  <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
                    <img
                      src={portfolioImg}
                      alt={title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <button className="absolute top-3 right-3 p-1.5 rounded-full bg-black/10 hover:bg-black/30 text-white transition-colors" onClick={(e) => e.stopPropagation()}>
                      <Heart className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 flex flex-col flex-grow">
                    {/* Pro Info */}
                    <div className="flex items-center gap-3 mb-3">
                      <img src={avatar} alt={pro.fullName} className="w-8 h-8 rounded-full object-cover bg-gray-200" />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#404145] text-sm">{pro.fullName.split(' ')[0]}</span>
                        {pro.profile?.verified && (
                          <span className="text-[10px] text-white bg-blue-500 px-1.5 py-0.5 rounded flex items-center">
                            Verificado
                          </span>
                        )}
                        <span className="text-xs font-semibold text-[#404145] flex items-center">
                          {level}
                          <span className="flex ml-1 text-gray-300 gap-0.5">
                            <span className="w-1.5 h-1.5 bg-[#404145] rotate-45 inline-block"></span>
                            <span className="w-1.5 h-1.5 bg-[#404145] rotate-45 inline-block"></span>
                            <span className="w-1.5 h-1.5 bg-gray-300 rotate-45 inline-block"></span>
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Title & Bio */}
                    <h3 className="text-[#404145] text-sm leading-snug line-clamp-2 hover:underline mb-2 font-semibold">
                      {title}
                    </h3>
                    <p className="text-gray-500 text-xs line-clamp-2 mb-2 flex-grow">
                      {bio}
                    </p>

                    {/* Zone / Languages */}
                    {pro.profile?.serviceZones && pro.profile.serviceZones.length > 0 && (
                      <div className="text-xs font-semibold text-[#404145] mb-2 truncate">
                        Zonas: <span className="font-normal text-gray-500">{pro.profile.serviceZones.slice(0, 2).join(', ')}</span>
                      </div>
                    )}

                    {/* Rating */}
                    <div className="flex items-center gap-1 mb-4">
                      <Star className="w-4 h-4 fill-black text-black" />
                      <span className="font-bold text-[#404145] text-sm">{rating.toFixed(1)}</span>
                      <span className="text-gray-400 text-sm">({reviews})</span>
                    </div>

                    {/* Price Footer */}
                    <div className="mt-auto border-t border-gray-100 pt-3 flex items-center justify-between">
                      <span className="text-sm font-bold text-[#404145]">
                        <span className="text-gray-500 font-medium text-xs mr-1">Tarifa</span>
                        A convenir
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {activeView === 'clients' && (
        <section className="mb-8 rounded-xl bg-[#FAF8F5] p-6 sm:p-8" aria-labelledby="client-requests-title">
          <div className="mb-7 flex items-start gap-4">
            <BriefcaseBusiness className="mt-1 h-8 w-8 shrink-0 text-[#404145]" />
            <div>
              <h2 id="client-requests-title" className="mb-1 text-xl font-bold text-[#404145]">Clientes que buscan un profesional</h2>
              <p className="text-sm text-gray-600">Consulta oportunidades por categoría y ciudad. Los datos personales se protegen hasta el desbloqueo.</p>
            </div>
          </div>

          {requestsLoading ? (
            <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#FFCA0C]" /></div>
          ) : requestsError ? (
            <div className="py-12 text-center" role="alert"><p className="font-medium text-gray-500">No se pudieron cargar las solicitudes de clientes. Intenta de nuevo mÃ¡s tarde.</p></div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-12 text-center"><p className="font-medium text-gray-500">No hay solicitudes de clientes para esta búsqueda.</p></div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRequests.map(request => (
                <article key={request.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <span className="rounded-full bg-[#101828] px-2.5 py-1 text-xs font-bold text-white">{serviceLabel(request.categorySlug)}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500"><Clock className="h-3.5 w-3.5" />{new Date(request.createdAt).toLocaleDateString('es-EC')}</span>
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-[#101828]">{request.title}</h3>
                  <div className="mb-5 space-y-2 text-sm text-gray-600">
                    <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" />{request.city || 'Ciudad no indicada'}</p>
                    <p>Presupuesto estimado: <span className="font-semibold text-[#101828]">${request.estimatedBudget.toFixed(2)} USD</span></p>
                  </div>
                  <p className="mb-4 text-xs leading-relaxed text-gray-500">Los datos de contacto y la ubicación exacta se protegen hasta que un profesional desbloquea la oportunidad.</p>
                  <button type="button" onClick={openClientOpportunities} className="mt-auto rounded-lg bg-[#FFCA0C] px-4 py-2.5 text-sm font-bold text-[#101828] transition-colors hover:bg-[#e6b60b]">
                    Soy profesional: ver oportunidades
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
