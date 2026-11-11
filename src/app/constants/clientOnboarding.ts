export interface ClientOnboardingData {
  fullName: string;
  phone: string;
}

export function validateClientOnboarding({ fullName, phone }: ClientOnboardingData): string | null {
  const name = fullName.trim();
  if (name.length < 3 || name.length > 100) return 'Indica tu nombre completo.';
  const contact = phone.trim();
  const digits = contact.replace(/\D/g, '');
  if (contact.length > 25 || !/^\+?[0-9()\s-]+$/.test(contact) || digits.length < 7 || digits.length > 15) {
    return 'Indica un teléfono válido para que puedan contactarte.';
  }
  return null;
}
