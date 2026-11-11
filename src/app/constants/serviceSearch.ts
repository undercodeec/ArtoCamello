/** Shared identifiers for links and category names already saved in profiles. */
const SERVICE_ALIASES: Record<string, string[]> = {
  albanileria: ['Albañiles', 'Albañil', 'Albañilería'],
  jardineria: ['Jardineros', 'Jardinería', 'Desbrozar parcela'],
  mantenimiento: ['Manitas a domicilio', 'Mantenimiento preventivo', 'Reparaciones'],
  pintura: ['Pintores', 'Pintura'],
  fontaneria: ['Fontaneros', 'Fontanería', 'Plomero', 'Plomería', 'Instalar o cambiar termo eléctrico'],
  electricidad: ['Electricistas', 'Electricidad'],
  limpieza: ['Limpieza', 'Limpieza a domicilio', 'Limpieza comercial'],
  carpinteria: ['Carpinteros', 'Carpintería', 'Montadores de muebles'],
  'adiestrador-canino': ['Adiestrador canino', 'Adiestramiento canino', 'Adiestrar perros'],
  'entrenador-personal': ['Entrenador personal', 'Entrenadores'],
  mudanzas: ['Mudanzas', 'Servicios de mudanza'],
  'alquiler-furgonetas': ['Alquiler de furgonetas con conductor'],
  psicologia: ['Psicólogos', 'Psicología'],
  reformas: ['Reformas', 'Remodelaciones', 'Empresas de reformas', 'Reforma integral de piso', 'Cambiar bañera por plato de ducha'],
  'cuidado-ninos': ['Cuidado de niños'],
  'cuidado-mayores': ['Cuidado de personas mayores'],
  'cuidado-mascotas': ['Cuidado de mascotas', 'Paseador de perros'],
  'reparacion-electrodomesticos': ['Reparación de electrodomésticos'],
  'asesoria-fiscal': ['Asesoría fiscal'],
  'servicios-legales': ['Servicios legales', 'Abogados'],
  fumigacion: ['Fumigación'],
  'instalacion-pisos': ['Instalación de pisos'],
  'diseno-interiores': ['Diseño de interiores'],
  cerrajeria: ['Cerrajeros', 'Cerrajería'],
  climatizacion: ['Climatización'],
};

export const SERVICE_OPTIONS = Object.entries(SERVICE_ALIASES)
  .map(([slug, aliases]) => ({ slug, label: aliases[0] }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es'));

export function normalizeServiceText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const aliasToService = new Map<string, string>();
for (const [service, aliases] of Object.entries(SERVICE_ALIASES)) {
  for (const alias of [service, ...aliases]) aliasToService.set(normalizeServiceText(alias), service);
}

export function serviceId(value: string): string | undefined {
  return aliasToService.get(normalizeServiceText(value));
}

export function serviceLabel(value: string): string {
  const id = serviceId(value);
  return SERVICE_OPTIONS.find(option => option.slug === id)?.label || value;
}

export function matchesServiceCategory(categories: string[], filter: string): boolean {
  const normalizedFilter = normalizeServiceText(filter);
  if (!normalizedFilter) return true;
  const requestedService = serviceId(filter);
  return categories.some(category => {
    const categoryService = serviceId(category);
    if (requestedService && categoryService) return requestedService === categoryService;
    const normalizedCategory = normalizeServiceText(category);
    return normalizedCategory === normalizedFilter || normalizedCategory.includes(normalizedFilter);
  });
}

export interface SearchableProfessional {
  fullName: string;
  profile: {
    businessName?: string | null;
    bio?: string | null;
    categories?: string[];
    skills?: string[];
  } | null;
}

export function matchesProfessionalSearch(professional: SearchableProfessional, query: string): boolean {
  const normalizedQuery = normalizeServiceText(query);
  if (!normalizedQuery) return true;
  const profile = professional.profile;
  if (matchesServiceCategory(profile?.categories || [], query)) return true;
  const searchable = [professional.fullName, profile?.businessName, profile?.bio, ...(profile?.skills || []), ...(profile?.categories || [])];
  return searchable.some(value => normalizeServiceText(value || '').includes(normalizedQuery));
}
