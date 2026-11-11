// ====================================================================
// ArtoCamello — Request Service (Real API Integration)
// ====================================================================
import {
  ServiceRequest, RequestStatus, UrgencyLevel, PublicServiceRequestPreview,
} from '../domain/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function getAuthToken(): string | null {
  return sessionStorage.getItem('authToken');
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.text();
  try {
    const message = JSON.parse(body).error;
    if (typeof message === 'string' && message) return new Error(message);
  } catch { /* HTML or empty response */ }
  return new Error(fallback);
}

// --- Payloads ---
export interface CreateRequestPayload {
  visibility: 'direct' | 'marketplace';
  targetProfessionalUserId?: string;
  categorySlug: string;
  title: string;
  description: string;
  location: string;
  city: string;
  urgency: UrgencyLevel;
  preferredDate?: string;
  contactPhone: string;
  contactEmail: string;
  contactName?: string;
  estimatedBudget: number; // Presupuesto estimado del trabajo en USD (requerido)
  captchaToken?: string;
}


// --- Service Functions ---

/**
 * Create a new service request from a client.
 */
export async function createServiceRequest(payload: CreateRequestPayload, idempotencyKey?: string): Promise<ServiceRequest> {
  const token = getAuthToken();
  if (!token) throw new Error('No autorizado');

  const response = await fetch(`${API_URL}/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw await responseError(response, 'No se pudo enviar la solicitud. Comprueba la conexión e intenta nuevamente.');
  }

  return response.json();
}

/**
 * List all requests created by the authenticated client.
 */
export async function listRequestsByClient(clientId: string): Promise<ServiceRequest[]> {
  const token = getAuthToken();
  if (!token) return [];

  const response = await fetch(`${API_URL}/requests/client`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw await responseError(response, 'No se pudieron cargar tus solicitudes. Intenta nuevamente.');
  return response.json();
}

/**
 * List requests available for the authenticated professional to purchase.
 */
export async function listMatchingRequestsForProfessional(professionalId: string): Promise<import('../domain/types').ProfessionalRequestPreview[]> {
  const token = getAuthToken();
  if (!token) return [];

  const response = await fetch(`${API_URL}/requests/available`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) throw await responseError(response, 'No se pudieron cargar las solicitudes disponibles. Intenta nuevamente.');
  return response.json();
}

/** Lists the anonymized marketplace opportunities visible without a session. */
export async function listPublicServiceRequests(): Promise<PublicServiceRequestPreview[]> {
  const response = await fetch(`${API_URL}/requests/public`);
  if (!response.ok) throw await responseError(response, 'No se pudieron cargar las solicitudes públicas.');
  return response.json();
}

export async function updateServiceRequest(requestId: string, payload: Partial<Omit<CreateRequestPayload, 'visibility' | 'targetProfessionalUserId' | 'categorySlug'>>): Promise<ServiceRequest> {
  const token = getAuthToken();
  if (!token) throw new Error('No autorizado');
  const response = await fetch(`${API_URL}/requests/${requestId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await responseError(response, 'No se pudo editar la solicitud.');
  return response.json();
}

/**
 * Get a single request by ID. (Not fully implemented yet)
 */
export async function getRequestById(requestId: string): Promise<ServiceRequest | null> {
  // Not yet implemented in Express API
  return null;
}

/**
 * Cancel a service request.
 */
export async function cancelRequest(requestId: string): Promise<ServiceRequest | null> {
  const token = getAuthToken();
  if (!token) throw new Error('No autorizado');

  const response = await fetch(`${API_URL}/requests/${requestId}/cancel`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) return null;
  return response.json();
}

/**
 * Mark a request as completed.
 */
export async function completeRequest(requestId: string): Promise<ServiceRequest | null> {
  const token = getAuthToken();
  if (!token) throw new Error('No autorizado');

  const response = await fetch(`${API_URL}/requests/${requestId}/complete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) return null;
  return response.json();
}

/**
 * Get all requests. (Not fully implemented yet)
 */
export async function listAllRequests(): Promise<ServiceRequest[]> {
  return [];
}
