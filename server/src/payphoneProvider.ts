import { CreatePaymentIntent, PaymentProvider, ProviderIntent, ProviderPaymentStatus, VerifiedPaymentEvent, WebhookRequest } from './paymentProvider';

export class PayPhoneProvider implements PaymentProvider {
  constructor(private token: string, private storeId: string, private baseUrl: string, private appBaseUrl: string) {}
  async createIntent(input: CreatePaymentIntent): Promise<ProviderIntent> {
    if (!this.token || this.token === 'TU_PAYPHONE_TOKEN_AQUI' || !this.storeId) {
      if (process.env.NODE_ENV === 'production' || process.env.PAYPHONE_MOCK !== 'true') throw new Error('PayPhone no configurado');
      return { reference: input.reference, checkoutUrl: `${this.appBaseUrl}/dashboard/payment-success?clientTxId=${input.reference}&id=MOCK_TX_ID&transactionStatus=Approved` };
    }
    const cents = Math.round(Number(input.amount) * 100);
    const response = await fetch(`${this.baseUrl}/api/button/Prepare`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify({
      amount: cents, amountWithoutTax: cents, amountWithTax: 0, tax: 0, service: 0, tip: 0,
      currency: 'USD', storeId: this.storeId, reference: `lead-${(input.requestId || '').slice(0,8)}`,
      clientTransactionId: input.reference, responseUrl: input.responseUrl, cancellationUrl: input.cancellationUrl, lang: 'es',
    }) });
    if (!response.ok) throw new Error('PayPhone no pudo crear el enlace');
    const body = await response.json() as { payWithPayPhone?: string };
    if (!body.payWithPayPhone) throw new Error('PayPhone no devolvió enlace');
    const checkoutUrl = new URL(body.payWithPayPhone);
    if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== new URL(this.baseUrl).hostname) throw new Error('URL PayPhone inválida');
    return { reference: input.reference, checkoutUrl: checkoutUrl.toString() };
  }
  async verifyWebhook(_input: WebhookRequest): Promise<VerifiedPaymentEvent> {
    throw new Error('Webhook PayPhone no habilitado; usar verificación de servidor');
  }
  async getPayment(reference: string, transactionId?: string): Promise<ProviderPaymentStatus & { providerPaymentId?: string }> {
    if (!this.token || this.token === 'TU_PAYPHONE_TOKEN_AQUI') throw new Error('PayPhone no configurado');
    let response: Response;
    if (reference.length > 16) {
      // Compatibilidad con intenciones creadas por el adaptador anterior.
      response = await fetch(`${this.baseUrl}/v2/link?clientTransactionId=${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${this.token}` } });
    } else {
      const id = Number(transactionId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('ID PayPhone inválido');
      response = await fetch(`${this.baseUrl}/api/button/V2/Confirm`, { method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, clientTxId: reference }) });
    }
    if (!response.ok) throw new Error('PayPhone no pudo verificar el pago');
    const body = await response.json() as { transactionStatus?: string; transactionId?: number; clientTransactionId?: string; amount?: number; currency?: string };
    if (body.clientTransactionId !== reference) throw new Error('Referencia PayPhone no coincide');
    if (reference.length <= 16 && body.transactionStatus === 'Approved' && String(body.transactionId) !== String(Number(transactionId))) throw new Error('ID PayPhone no coincide');
    return { reference, status: body.transactionStatus === 'Approved' ? 'approved' : ['Rejected','Canceled','Cancelled','Failed','Expired'].includes(body.transactionStatus || '') ? 'failed' : 'pending', providerPaymentId: body.transactionId?.toString(), amountCents: Number.isInteger(body.amount) ? body.amount : undefined, currency: body.currency };
  }
}
