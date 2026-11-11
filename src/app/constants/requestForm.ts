import type { CreateRequestPayload } from '@/services/requestService';
import type { UrgencyLevel } from '@/domain/types';

export interface RequestFormValues {
  categorySlug: string;
  title: string;
  description: string;
  city: string;
  location: string;
  urgency: UrgencyLevel;
  preferredDate: string;
  estimatedBudget: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

export function validateRequestForm(values: RequestFormValues): string | null {
  if (!values.categorySlug.trim()) return 'Selecciona una categoría.';
  if (!values.title.trim() || !values.description.trim()) return 'Escribe el título y la descripción.';
  if (!values.city.trim()) return 'Indica la ciudad.';
  if (!values.location.trim()) return 'Indica la dirección privada del servicio.';
  const budget = Number(values.estimatedBudget);
  if (!Number.isFinite(budget) || budget <= 0) return 'Indica un presupuesto mayor a cero.';
  if (!values.contactName.trim()) return 'Indica tu nombre de contacto.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail.trim())) return 'Indica un correo válido.';
  if (values.contactPhone.replace(/\D/g, '').length < 7) return 'Indica un teléfono válido.';
  return null;
}

export function toRequestPayload(values: RequestFormValues): CreateRequestPayload {
  return {
    visibility: 'marketplace', categorySlug: values.categorySlug.trim(), title: values.title.trim(),
    description: values.description.trim(), city: values.city.trim(), location: values.location.trim(),
    urgency: values.urgency, estimatedBudget: Number(values.estimatedBudget),
    contactName: values.contactName.trim(), contactEmail: values.contactEmail.trim(),
    contactPhone: values.contactPhone.trim(),
    ...(values.preferredDate ? { preferredDate: new Date(`${values.preferredDate}T12:00:00`).toISOString() } : {}),
  };
}
