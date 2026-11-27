import sepsEntities from './seps-financial-entities.json';

// Superintendencia de Bancos: https://www.superbancos.gob.ec/bancos/catastro-publico/
// SEPS snapshot: https://www.seps.gob.ec/?sdm_process_download=1&download_id=36636
// SEPS source date: 2026-06-01. The snapshot is not a real-time authorization check.
export const BANKS = [
  'Banco Amazonas', 'Banco Austro', 'Banco Guayaquil', 'Banco Bolivariano',
  'Banco Manabí', 'Banco del Litoral', 'Banco General Rumiñahui', 'Banco Internacional',
  'Banco de Loja', 'Banco de Machala', 'Banco del Pacífico', 'Banco Pichincha',
  'Banco de la Producción (Produbanco)', 'Banco Solidario', 'Banco Sudamericano',
  'Banco Coopnacional', 'Banco ProCredit', 'Banco Capital', 'Banco Delbank',
  'Banco Atlántida', 'Banco Desarrollo de los Pueblos (Codesarrollo)',
  'Banco VisionFund Ecuador', 'Banco Diners Club del Ecuador', 'Citibank Ecuador',
  'BanEcuador', 'Banco de Desarrollo del Ecuador', 'Corporación Financiera Nacional',
  'Banco del Instituto Ecuatoriano de Seguridad Social (BIESS)',
].sort((a, b) => a.localeCompare(b, 'es'));

// Abbreviate the common legal prefix, keeping names distinct and within the API's 100-character limit.
export const SEPS_INSTITUTIONS = sepsEntities.map(({ ruc, name }) => ({
  ruc,
  name: name.replace(/^COOPERATIVA DE AHORRO Y CR[EÉ]DITO /, 'COAC ')
    .replace(/^ASOCIACION MUTUALISTA DE AHORRO Y CREDITO PARA LA VIVIENDA /, 'MUTUALISTA '),
})).sort((a, b) => a.name.localeCompare(b.name, 'es'));

export function normalizeInstitutionSearch(value: string): string {
  return value.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
