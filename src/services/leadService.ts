// ====================================================================
// ArtoCamello — Lead Service (Pago Directo via PayPhone Redirect)
// ====================================================================
import { LeadPurchase, PaymentHistoryItem } from '../domain/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function getAuthToken(): string | null {
  return sessionStorage.getItem('authToken');
}

// ---- Tipos de respuesta ----

export interface PayIntentResult {
  success: boolean;
  redirectUrl?: string;
  costUSD?: number;
  clientTxId?: string;
  error?: string;
}

export interface PayConfirmResult {
  success: boolean;
  contactPhone?: string;
  contactEmail?: string;
  costUSD?: number;
  alreadyPaid?: boolean;
  error?: string;
}

export interface UnlockedContact {
  purchase: {
    id: string;
    requestId: string;
    costUSD: number;
    status: string;
    purchasedAt: string;
    payphoneTransactionId?: string;
  };
  requestTitle: string;
  description: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  location: string;
  estimatedBudget: number;
}

// ====================================================================
// 1. Iniciar Pago de un Lead (obtiene URL de PayPhone)
// ====================================================================

/**
 * Llama al backend para crear la intención de pago.
 * El backend devuelve la URL de redirect a PayPhone.
 * El navegador debe redirigir a esa URL.
 */
export async function initiateLeadPayment(requestId: string): Promise<PayIntentResult> {
  const token = getAuthToken();
  if (!token) return { success: false, error: 'Debes iniciar sesión para comprar un contacto.' };

  try {
    const response = await fetch(`${API_URL}/leads/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ requestId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Error al iniciar el pago.' };
    }

    return {
      success: true,
      redirectUrl: data.redirectUrl,
      costUSD: data.costUSD,
      clientTxId: data.clientTxId,
    };
  } catch (err) {
    console.error('initiateLeadPayment error:', err);
    return { success: false, error: 'Error de conexión. Inténtalo de nuevo.' };
  }
}

// ====================================================================
// 2. Confirmar Pago (llamado cuando PayPhone redirige de vuelta)
// ====================================================================

/**
 * Verifica con el backend que el pago fue aprobado por PayPhone.
 * Devuelve los datos de contacto del cliente si el pago fue exitoso.
 */
export async function confirmLeadPayment(
  clientTxId: string,
  payphoneTransactionId?: string
): Promise<PayConfirmResult> {
  const token = getAuthToken();
  if (!token) return { success: false, error: 'Sesión expirada.' };

  try {
    const response = await fetch(`${API_URL}/leads/pay/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ clientTxId, payphoneTransactionId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'No se pudo confirmar el pago.' };
    }

    return {
      success: true,
      contactPhone: data.contactPhone,
      contactEmail: data.contactEmail,
      costUSD: data.costUSD,
      alreadyPaid: data.alreadyPaid,
    };
  } catch (err) {
    console.error('confirmLeadPayment error:', err);
    return { success: false, error: 'Error de conexión al confirmar el pago.' };
  }
}

// ====================================================================
// 3. Listar contactos desbloqueados (pagados)
// ====================================================================

export async function listUnlockedContacts(professionalId: string): Promise<UnlockedContact[]> {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const response = await fetch(`${API_URL}/leads/unlocked`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error('Error fetching unlocked contacts:', await response.text());
      return [];
    }

    return await response.json();
  } catch (err) {
    console.error('listUnlockedContacts error:', err);
    return [];
  }
}

// ====================================================================
// 4. Historial de pagos (para Facturación)
// ====================================================================

export async function getPaymentHistory(): Promise<PaymentHistoryItem[]> {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const response = await fetch(`${API_URL}/payments/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return [];

    return await response.json();
  } catch (err) {
    console.error('getPaymentHistory error:', err);
    return [];
  }
}

// ====================================================================
// 5. Comprobar si ya se compró un lead (cache local para UI)
// ====================================================================

/** Verifica localmente si el profesional ya pagó por un request dado */
export async function hasPurchasedLead(requestId: string, professionalId: string): Promise<boolean> {
  const unlocked = await listUnlockedContacts(professionalId);
  return unlocked.some((item) => item.purchase.requestId === requestId);
}
