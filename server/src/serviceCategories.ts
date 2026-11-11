const aliases: Record<string, string[]> = {
  albanileria: ['Albañiles', 'Albañil', 'Albañilería'],
  jardineria: ['Jardineros', 'Jardinería', 'Desbrozar parcela'],
  mantenimiento: ['Manitas a domicilio', 'Mantenimiento preventivo', 'Reparaciones'],
  pintura: ['Pintores', 'Pintura'],
  fontaneria: ['Fontaneros', 'Fontanería', 'Plomero', 'Plomería', 'Instalar o cambiar termo eléctrico'],
  electricidad: ['Electricistas', 'Electricidad'],
  limpieza: ['Limpieza a domicilio', 'Limpieza comercial', 'Limpieza'],
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

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const aliasToSlug = new Map<string, string>();
for (const [slug, labels] of Object.entries(aliases)) {
  for (const label of [slug, ...labels]) aliasToSlug.set(normalized(label), slug);
}

export function canonicalServiceCategory(value: string): string {
  const key = normalized(value);
  return key ? aliasToSlug.get(key) || key.replace(/ /g, '-') : '';
}

export function canonicalServiceCategories(values: string[]): string[] {
  return [...new Set(values.map(canonicalServiceCategory).filter(Boolean))];
}

export function hasServiceCategory(categories: string[], requestCategory: string): boolean {
  const requested = canonicalServiceCategory(requestCategory);
  return Boolean(requested) && categories.some(category => canonicalServiceCategory(category) === requested);
}
