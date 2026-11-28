export type BillingDetails = {
  idType: 'ruc' | 'cedula' | 'pasaporte';
  idNumber: string;
  legalName: string;
  address: string;
  email: string;
  phone: string;
};

export function validateBillingDetails(input: unknown): BillingDetails | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !['idType', 'idNumber', 'legalName', 'address', 'email', 'phone'].includes(key))) return null;
  if (!['ruc', 'cedula', 'pasaporte'].includes(String(data.idType))) return null;
  if (['idNumber', 'legalName', 'address', 'email', 'phone'].some(key => typeof data[key] !== 'string')) return null;
  const idNumber = (data.idNumber as string).trim();
  const legalName = (data.legalName as string).trim();
  const address = (data.address as string).trim();
  const email = (data.email as string).trim().toLowerCase();
  const phone = (data.phone as string).trim();
  if (data.idType === 'ruc' && !/^\d{13}$/.test(idNumber)) return null;
  if (data.idType === 'cedula' && !/^\d{10}$/.test(idNumber)) return null;
  if (data.idType === 'pasaporte' && !/^[A-Za-z0-9-]{3,32}$/.test(idNumber)) return null;
  if (!legalName || legalName.length > 160 || !address || address.length > 255
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
    || !/^[+\d\s().-]{7,40}$/.test(phone)) return null;
  return { idType: data.idType as BillingDetails['idType'], idNumber, legalName, address, email, phone };
}
