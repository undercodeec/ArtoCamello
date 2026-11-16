import { ServiceRequest } from '@prisma/client';
import { hasServiceCategory } from './serviceCategories';
import type { TenantSettings } from './payments';

export const OPEN_REQUEST_STATUSES = ['matching', 'contact_limit_open', 'contact_limit_reached', 'quotes_received'] as const;
const SERVICE_CATEGORIES = new Set('albanileria jardineria mantenimiento pintura fontaneria electricidad limpieza carpinteria adiestrador-canino entrenador-personal mudanzas alquiler-furgonetas psicologia reformas cuidado-ninos cuidado-mayores cuidado-mascotas reparacion-electrodomesticos asesoria-fiscal servicios-legales fumigacion instalacion-pisos diseno-interiores cerrajeria climatizacion'.split(' '));
export const isOpenRequest = (status: string) => OPEN_REQUEST_STATUSES.some(value => value === status);
export const isPurchasableRequest = (status: string) => status === 'matching' || status === 'contact_limit_open';

export function canProfessionalAccessRequest(request: ServiceRequest, professionalUserId: string, professionalCategories: string[], tenantId: string): boolean {
  if (request.tenantId !== tenantId || !hasServiceCategory(professionalCategories, request.categorySlug)) return false;
  return request.visibility === 'marketplace' || (request.visibility === 'direct' && request.targetProfessionalUserId === professionalUserId);
}

export function purchaseLimitForRequest(request: Pick<ServiceRequest, 'visibility'>, settings: TenantSettings): number {
  return request.visibility === 'direct' ? 1 : request.visibility === 'marketplace' ? settings.maxProfessionalsPerLead : 0;
}

export function toProfessionalPreview(request: ServiceRequest, costUSD: number, maxProfessionalsPerLead: number) {
  return {
    id: request.id,
    visibility: request.visibility,
    city: null,
    categorySlug: request.categorySlug,
    title: `Servicio de ${request.categorySlug}`,
    urgency: request.urgency,
    estimatedBudget: request.estimatedBudget,
    purchaseCount: request.purchaseCount,
    status: request.status,
    createdAt: request.createdAt,
    costUSD,
    maxProfessionalsPerLead,
  };
}

export function validRequestFields(body: any): boolean {
  const bounded = (value: unknown, max: number, required = true) => typeof value === 'string' && value.trim().length >= (required ? 1 : 0) && value.trim().length <= max;
  const budget = Number(body.estimatedBudget);
  const date = body.preferredDate == null || body.preferredDate === '' ? null : new Date(body.preferredDate);
  return bounded(body.categorySlug, 80) && SERVICE_CATEGORIES.has(body.categorySlug)
    && bounded(body.title, 160) && bounded(body.description, 5000)
    && bounded(body.city, 100) && bounded(body.location, 255)
    && ['low', 'medium', 'high'].includes(body.urgency)
    && bounded(body.contactPhone, 40) && bounded(body.contactEmail, 254)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactEmail)
    && (body.contactName == null || bounded(body.contactName, 100, false))
    && Number.isFinite(budget) && budget > 0 && budget <= 1_000_000
    && (date === null || (Number.isFinite(date.getTime()) && date.getTime() > Date.now() - 86400000));
}
