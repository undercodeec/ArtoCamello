export interface ServiceItem {
  label: string;
  slug?: string;
  active?: boolean;
  isLong?: boolean;
}

export const POPULAR_SERVICES: ServiceItem[] = [
  // Column 1
  { label: 'Albañiles', active: true, slug: 'albanileria' },
  { label: 'Jardineros', slug: 'jardineria' },
  { label: 'Manitas a domicilio', slug: 'mantenimiento' },
  { label: 'Pintores', slug: 'pintura' },
  { label: 'Fontaneros', slug: 'fontaneria' },
  { label: 'Adiestrador canino', slug: 'adiestrador-canino' },
  // Column 2
  { label: 'Electricistas', slug: 'electricidad' },
  { label: 'Entrenador personal', slug: 'entrenador-personal' },
  { label: 'Limpieza a domicilio', slug: 'limpieza' },
  { label: 'Alquiler de furgonetas con conductor', isLong: true, slug: 'alquiler-furgonetas' },
  { label: 'Carpinteros', slug: 'carpinteria' },
  { label: 'Psicólogos', slug: 'psicologia' },
  // Column 3
  { label: 'Desbrozar parcela', slug: 'jardineria' },
  { label: 'Cambiar bañera por plato de ducha', isLong: true, slug: 'reformas' },
  { label: 'Reforma integral de piso', slug: 'reformas' },
  { label: 'Instalar o cambiar termo eléctrico', isLong: true, slug: 'fontaneria' },
  { label: 'Montadores de muebles', slug: 'carpinteria' },
  { label: 'Empresas de reformas', slug: 'reformas' }
];
