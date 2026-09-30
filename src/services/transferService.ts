const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const token = () => sessionStorage.getItem('authToken') || '';

export type TransferPayment = { id: string; reference: string; amount: string; currency: string; status: string; expiresAt?: string; transfers?: Array<{ reviewNote?: string }>; bankAccounts?: BankAccount[] };
export type BankAccount = { bankName: string; accountName: string; accountNumber: string; accountType?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}/payments${path}`, { ...init, headers: { Authorization: `Bearer ${token()}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo procesar el pago');
  return data as T;
}

export const createTransferIntent = (requestId: string) => request<{ payment: TransferPayment; bankAccounts: BankAccount[] }>('/transfer-intents', { method: 'POST', body: JSON.stringify({ requestId }) });
export const getTransferPayment = (id: string) => request<TransferPayment>(`/${id}`);
export const listMyTransfers = () => request<Array<TransferPayment & { metadata: { requestId?: string } }>>('/mine');
export const getPaymentMethods = () => request<{ transfer: boolean; payphone: boolean; card: boolean }>('/methods');
export const listMyCards = () => request<Array<TransferPayment & { metadata: { requestId?: string } }>>('/cards/mine');
export async function createCardIntent(requestId: string) {
  const keyName = `card-intent:${requestId}`;
  let key = sessionStorage.getItem(keyName);
  if (!key) { key = crypto.randomUUID(); sessionStorage.setItem(keyName, key); }
  try {
    return await request<{ payment: TransferPayment; checkoutUrl?: string }>('/card-intents', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ requestId }) });
  } catch (error) {
    if ((error as Error).message.includes('nueva clave')) sessionStorage.removeItem(keyName);
    throw error;
  }
}
export async function submitTransferProof(id: string, data: { bankName: string; accountLast4?: string; transferReference: string; transferredAt: string; declaredAmount: string; file: File }) {
  const fileBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('No se pudo leer el archivo')); reader.readAsDataURL(data.file);
  });
  return request<{ status: string }>(`/${id}/transfer-proof`, { method: 'POST', body: JSON.stringify({ bankName: data.bankName, accountLast4: data.accountLast4, transferReference: data.transferReference, transferredAt: data.transferredAt, declaredAmount: data.declaredAmount, fileBase64 }) });
}
