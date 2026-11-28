const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const token = () => sessionStorage.getItem('authToken') || '';

export type BillingDetails = {
  idType: 'ruc' | 'cedula' | 'pasaporte';
  idNumber: string;
  legalName: string;
  address: string;
  email: string;
  phone: string;
};

export const emptyBillingDetails: BillingDetails = { idType: 'ruc', idNumber: '', legalName: '', address: '', email: '', phone: '' };

export async function getBillingDetails(): Promise<BillingDetails | null> {
  const response = await fetch(`${API}/billing/profile`, { headers: { Authorization: `Bearer ${token()}` }, cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudieron cargar los datos de facturación.');
  return response.json();
}

export async function saveBillingDetails(details: BillingDetails): Promise<BillingDetails> {
  const response = await fetch(`${API}/billing/profile`, { method: 'PUT', headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(details) });
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'No se pudieron guardar los datos.'); }
  return response.json();
}

export async function downloadReceipt(paymentId: string): Promise<void> {
  const response = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}/receipt`, { headers: { Authorization: `Bearer ${token()}` }, cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo descargar el recibo. Comprueba que el pago esté aprobado.');
  const url = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `recibo-${paymentId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
