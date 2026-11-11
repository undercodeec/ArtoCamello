// ====================================================================
// ArtoCamello — Quote Service
// ====================================================================
import { Quote } from '../domain/types';
import { getCurrentAuth } from './authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface SubmitQuotePayload {
  requestId: string;
  message: string;
  estimatedPrice: number;
  estimatedDays?: number;
}

function getAuthHeader() {
  const token = getCurrentAuth().token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

/**
 * Submit a quote for a request. The professional must have purchased the contact first.
 */
export async function submitQuote(payload: SubmitQuotePayload): Promise<Quote> {
  const response = await fetch(`${API_URL}/quotes`, {
    method: 'POST',
    headers: getAuthHeader(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to submit quote');
  }

  return await response.json();
}

/**
 * List all quotes for a specific request.
 * Enriches with professional profile info.
 */
export async function listQuotesByRequest(requestId: string): Promise<Array<{
  quote: Quote;
  professionalName: string;
  professionalRating: number;
  professionalReviewCount: number;
  professionalAvatar?: string;
}>> {
  const response = await fetch(`${API_URL}/quotes/request/${requestId}`, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch quotes');
  }

  return await response.json();
}

/**
 * Accept a quote (client action). Sets the request to HIRED status.
 */
export async function acceptQuote(quoteId: string): Promise<boolean> {
  const response = await fetch(`${API_URL}/quotes/${quoteId}/accept`, {
    method: 'POST',
    headers: getAuthHeader(),
  });

  return response.ok;
}

/**
 * List quotes sent by the authenticated professional.
 */
export async function listQuotesByProfessional(): Promise<Quote[]> {
  const response = await fetch(`${API_URL}/quotes/me`, {
    headers: getAuthHeader(),
  });

  if (!response.ok) {
    return [];
  }

  return await response.json();
}
