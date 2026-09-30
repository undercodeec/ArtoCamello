import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { CreatePaymentIntent, PaymentProvider, ProviderIntent, ProviderPaymentStatus, VerifiedPaymentEvent, WebhookRequest } from './paymentProvider';

export type KushkiConfig = { merchantId: string; privateMerchantId: string; webhookSecret: string; environment: 'uat' | 'production'; webhookAmountUnit: 'cents' | 'major' };

export function kushkiConfigFor(tenantId: string): KushkiConfig | null {
  if (process.env.KUSHKI_CARD_ENABLED !== 'true') return null;
  try {
    const entry = (JSON.parse(process.env.KUSHKI_CONFIG_JSON || '{}') as Record<string, Partial<KushkiConfig>>)[tenantId];
    if (!entry?.merchantId || !entry.privateMerchantId || !entry.webhookSecret || !['uat', 'production'].includes(entry.environment || '') || !['cents', 'major'].includes(entry.webhookAmountUnit || '')) return null;
    if (process.env.NODE_ENV === 'production' && entry.environment !== 'production') return null;
    return entry as KushkiConfig;
  } catch { return null; }
}

const equalHex = (left: string, right: string) => /^[0-9a-f]{64}$/i.test(left) && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));

export class KushkiCardProvider implements PaymentProvider {
  constructor(private config: KushkiConfig) {}

  async createIntent(input: CreatePaymentIntent): Promise<ProviderIntent> {
    if (input.currency !== 'USD' || !input.responseUrl || !input.payerEmail || !input.payerName) throw new Error('Intento Kushki incompleto');
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !/^\d+\.\d{2}$/.test(input.amount)) throw new Error('Monto Kushki inválido');
    const baseUrl = this.config.environment === 'production' ? 'https://api.kushkipagos.com' : 'https://api-uat.kushkipagos.com';
    const response = await fetch(`${baseUrl}/smartlink/v1/webcheckout`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Private-Merchant-Id': this.config.privateMerchantId }, body: JSON.stringify({
      kind: 'webcheckout',
      contactDetail: { email: input.payerEmail, name: input.payerName },
      redirectURL: input.responseUrl,
      products: [{ name: 'Desbloqueo de contacto', description: `Solicitud ${(input.requestId || '').slice(0, 36)}`, quantity: 1, unitPrice: amount }],
      paymentConfig: { amount: { subtotalIva0: amount, subtotalIva: 0, iva: 0, currency: 'USD' }, paymentMethod: ['credit-card'] },
      additionalInformation: { artocamelloPayment: input.reference },
    }) });
    if (!response.ok) throw new Error(`Kushki no pudo crear el checkout (${response.status})`);
    const body = await response.json() as { webcheckoutId?: string; webcheckoutUrl?: string };
    if (!body.webcheckoutId || !body.webcheckoutUrl) throw new Error('Kushki no devolvió checkout');
    const url = new URL(body.webcheckoutUrl);
    const checkoutHost = this.config.environment === 'production' ? 'webcheckout.kushkipagos.com' : 'uat-webcheckout.kushkipagos.com';
    if (url.protocol !== 'https:' || url.hostname !== checkoutHost) throw new Error('URL de checkout inválida');
    return { reference: input.reference, providerIntentId: body.webcheckoutId, checkoutUrl: url.toString() };
  }

  async verifyWebhook(input: WebhookRequest): Promise<VerifiedPaymentEvent> {
    const timestamp = input.headers['x-kushki-id'] || '';
    const signature = input.headers['x-kushki-signature'] || '';
    const merchant = input.headers['x-kushki-key'] || '';
    const timeValue = Number(timestamp);
    const timeMs = timeValue > 1e12 ? timeValue : timeValue * 1000;
    if (merchant !== this.config.merchantId || !Number.isFinite(timeMs) || Math.abs(Date.now() - timeMs) > 5 * 60000) throw new Error('Webhook Kushki no autenticado');
    let payload: Record<string, any>;
    try { payload = JSON.parse(input.body.toString('utf8')); } catch { throw new Error('Webhook Kushki inválido'); }
    const raw = input.body.toString('utf8');
    const candidates = [raw, JSON.stringify(payload)];
    if (!candidates.some(body => equalHex(signature, createHmac('sha256', this.config.webhookSecret).update(`${body}.${timestamp}`).digest('hex')))) throw new Error('Firma Kushki inválida');
    const reference = payload.metadata?.artocamelloPayment;
    const approved = payload.status === 'approvedTransaction';
    if (payload.merchantId !== this.config.merchantId || payload.paymentMethod !== 'creditCard' || !['approvedTransaction', 'declinedTransaction'].includes(payload.status) || typeof reference !== 'string' || !/^AC-K-[0-9A-F]{32}$/.test(reference) || typeof payload.id !== 'string' || typeof payload.smartLink !== 'string' || payload.amount?.currency !== 'USD') throw new Error('Datos de webhook Kushki inválidos');
    const components = [payload.amount?.subtotalIva0, payload.amount?.subtotalIva, payload.amount?.iva];
    const breakdown = components.every(value => typeof value === 'number' && Number.isFinite(value)) ? components.reduce((sum, value) => sum + value, 0) : undefined;
    const rawAmount = approved ? (payload.approvedTransactionAmount ?? payload.requestAmount ?? breakdown) : (payload.requestAmount ?? breakdown);
    if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount) || rawAmount < 0) throw new Error('Monto Kushki inválido');
    const amountCentsDecimal = new Prisma.Decimal(rawAmount).mul(this.config.webhookAmountUnit === 'major' ? 100 : 1);
    if (!amountCentsDecimal.isInteger()) throw new Error('Monto Kushki inválido');
    const amountCents = amountCentsDecimal.toNumber();
    return { reference, status: approved ? 'approved' : 'failed', eventId: payload.id, providerPaymentId: String(payload.transactionReference || payload.ticketNumber || payload.id), providerIntentId: payload.smartLink, amountCents, currency: 'USD' };
  }

  async getPayment(reference: string): Promise<ProviderPaymentStatus> {
    const baseUrl = this.config.environment === 'production' ? 'https://api.kushkipagos.com' : 'https://api-uat.kushkipagos.com';
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 19);
    const to = new Date().toISOString().slice(0, 19);
    for (let offset = 0; offset < 1000; offset += 100) {
      const query = new URLSearchParams({ from, to, payment_method: 'card', offset: String(offset), limit: '100' });
      const response = await fetch(`${baseUrl}/analytics/v2/transactions-list?${query}`, { headers: { 'Private-Merchant-Id': this.config.privateMerchantId, 'Content-Type': 'application/json' } });
      if (!response.ok) throw new Error(`Kushki Analytics no disponible (${response.status})`);
      const result = await response.json() as { total?: number; data?: Array<{ metadata?: Record<string, unknown>; external_reference_id?: string; transaction_status?: string; approved_transaction_amount?: number; currency_code?: string; transaction_id?: string; transaction_reference?: string }> };
      if (!Array.isArray(result.data)) throw new Error('Respuesta Kushki Analytics inválida');
      const item = result.data.find(row => row.metadata?.artocamelloPayment === reference || row.external_reference_id === reference);
      if (item) {
        const amount = new Prisma.Decimal(item.approved_transaction_amount ?? 0).mul(100);
        return { reference, status: item.transaction_status === 'APPROVAL' ? 'approved' : item.transaction_status === 'DECLINED' ? 'failed' : 'pending', amountCents: amount.isInteger() ? amount.toNumber() : undefined, currency: item.currency_code, providerPaymentId: item.transaction_reference || item.transaction_id };
      }
      if (result.data.length < 100 || offset + 100 >= (result.total ?? 0)) break;
    }
    return { reference, status: 'pending' };
  }
}
