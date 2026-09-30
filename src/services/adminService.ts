const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem('authToken');
  const adminSession = sessionStorage.getItem('adminSession');
  const response = await fetch(`${API}/admin${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token || ''}`, ...(adminSession ? { 'X-Admin-Session': adminSession } : {}), ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Error ${response.status}`) as Error & { code?: string };
    error.code = body.code;
    if (body.code === 'MFA_REQUIRED' || body.code === 'MFA_SETUP_REQUIRED') window.dispatchEvent(new CustomEvent('admin-mfa-required', { detail: body.code }));
    throw error;
  }
  return response.json() as Promise<T>;
}

export type AdminMe = { tenantId: string; role: string; permissions: string[] };
export type Payment = {
  id: string; reference: string; amount: string; currency: string; method: string; status: string; createdAt: string;
  leadTitle?: string;
  payer: { id: string; fullName: string; email: string };
  transfers?: Array<{ id: string; bankName: string; declaredAmount: string | null; transferReference: string; transferredAt: string; createdAt: string; proofUrl: string; reviewNote?: string; reviewer?: { fullName: string } }>;
  possibleDuplicates?: number; bankAccounts?: Array<{ bankName: string; accountName: string; accountNumber: string }>;
  events?: Array<{ id: string; type: string; source: string; createdAt: string }>;
  allocations?: Array<{ id: string; subjectId: string; amount: string }>;
};
