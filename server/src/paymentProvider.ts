import { TenantSettings } from './payments';

export interface CreatePaymentIntent { reference: string; amount: string; currency: string; requestId?: string; responseUrl?: string; cancellationUrl?: string; payerEmail?: string; payerName?: string }
export interface ProviderIntent { reference: string; instructions?: TenantSettings['bankAccounts']; checkoutUrl?: string; providerIntentId?: string }
export interface WebhookRequest { body: Buffer; headers: Record<string, string | undefined> }
export interface VerifiedPaymentEvent { reference: string; status: 'approved' | 'failed'; providerPaymentId: string; eventId: string; amountCents?: number; currency?: string; providerIntentId?: string }
export interface ProviderPaymentStatus { reference: string; status: 'pending' | 'approved' | 'failed'; amountCents?: number; currency?: string; providerPaymentId?: string }

export interface PaymentProvider {
  createIntent(input: CreatePaymentIntent): Promise<ProviderIntent>;
  verifyWebhook(input: WebhookRequest): Promise<VerifiedPaymentEvent>;
  getPayment(reference: string): Promise<ProviderPaymentStatus>;
}

export class TransferProvider implements PaymentProvider {
  constructor(private settings: TenantSettings) {}
  async createIntent(input: CreatePaymentIntent): Promise<ProviderIntent> {
    if (!this.settings.bankAccounts.length) throw new Error('Cuenta bancaria no configurada');
    return { reference: input.reference, instructions: this.settings.bankAccounts };
  }
  async verifyWebhook(): Promise<VerifiedPaymentEvent> { throw new Error('La transferencia requiere revisión manual'); }
  async getPayment(reference: string): Promise<ProviderPaymentStatus> { return { reference, status: 'pending' }; }
}
