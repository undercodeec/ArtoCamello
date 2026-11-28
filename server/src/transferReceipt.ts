import { PrismaClient } from '@prisma/client';
import path from 'path';
import { escapeHtml } from './htmlEscape';
import { createSmtpTransport, smtpFrom } from './mail';
import { renderReceiptPdf } from './receiptPdf';

export function renderTransferReceipt(name: string, rows: string[][], logoSrc: string, walletUrl?: string): string {
  const htmlRows = rows.map(([label, value]) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#667085">${escapeHtml(label)}</td><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#101828;font-weight:600">${escapeHtml(value)}</td></tr>`).join('');
  return `<div style="margin:0;background:#f3f4f6;padding:24px 12px;font-family:Arial,sans-serif;color:#101828"><div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;overflow:hidden"><div style="background:#ffca0c;padding:20px 28px"><img src="${escapeHtml(logoSrc)}" alt="ArtoCamello" style="display:block;max-width:190px;height:auto"></div><div style="padding:28px"><p style="color:#15803d;font-weight:bold;margin:0">PAGO APROBADO</p><h1 style="font-size:26px;margin:12px 0">Recibo de pago</h1><p>Hola ${escapeHtml(name)}, tu transferencia fue validada y el contacto ya está disponible en Mis Contactos.</p><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${htmlRows}</table><p>El recibo en PDF está adjunto a este correo.${walletUrl ? ` También puedes <a href="${escapeHtml(walletUrl)}">descargarlo desde tu historial de pagos</a> al iniciar sesión.` : ''}</p><p style="font-size:12px;color:#667085;margin-top:24px">Este recibo es una confirmación de pago, no una factura tributaria ni una factura electrónica del SRI.</p></div></div></div>`;
}

/** The allocation snapshot is immutable even when the user edits billing details later. */
export async function loadReceipt(db: PrismaClient, tenantId: string, paymentId: string, payerUserId?: string) {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, tenantId, ...(payerUserId ? { payerUserId } : {}), status: 'allocated' },
    include: { payer: { select: { fullName: true, email: true, active: true } }, allocations: { select: { billingSnapshot: true } } },
  });
  if (!payment || !payment.allocations.length || !payment.confirmedAt) return null;
  const snapshot = payment.allocations[0].billingSnapshot;
  const billing = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot as Record<string, unknown> : {};
  const get = (key: string) => typeof billing[key] === 'string' ? billing[key] as string : '';
  const date = new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(payment.confirmedAt);
  const rows = [
    ['Profesional', get('legalName') || payment.payer.fullName],
    ...(get('idType') && get('idNumber') ? [['Identificación declarada', `${get('idType').toUpperCase()}: ${get('idNumber')}`]] : []),
    ...(get('address') ? [['Dirección declarada', get('address')]] : []),
    ['Correo de facturación', get('email') || payment.payer.email],
    ...(get('phone') ? [['Teléfono', get('phone')]] : []),
    ['Referencia', payment.reference], ['Concepto', 'Desbloqueo de contacto'],
    ['Método de pago', payment.method === 'transfer' ? 'Transferencia bancaria' : payment.method === 'card' ? 'Tarjeta' : 'PayPhone'],
    ['Fecha de aprobación', `${date} (hora de Ecuador)`], ['Total pagado', `${payment.amount.toFixed(2)} ${payment.currency}`],
  ];
  return { payment, rows, billingEmail: get('email') || payment.payer.email };
}

/** Delivery is leased and retried by the notification outbox, not by this renderer. */
export async function sendTransferReceipt(db: PrismaClient, tenantId: string, paymentId: string): Promise<boolean> {
  const receipt = await loadReceipt(db, tenantId, paymentId);
  if (!receipt) throw new Error('Pago asignado sin datos para recibo');
  const { payment, rows, billingEmail } = receipt;
  if (payment.method !== 'transfer') throw new Error('Método de pago no compatible con este aviso');
  if (!payment.payer.active) return false;
  const name = payment.payer.fullName;
  const domain = await db.tenantDomain?.findFirst({ where: { tenantId, isPrimary: true }, select: { hostname: true } });
  const walletUrl = domain ? `https://${domain.hostname}/dashboard/wallet?receipt=${encodeURIComponent(paymentId)}` : undefined;
  const pdf = await renderReceiptPdf(rows);
  const result = await createSmtpTransport().sendMail({
    from: smtpFrom(),
    to: payment.payer.email,
    ...(billingEmail !== payment.payer.email ? { cc: billingEmail } : {}),
    subject: 'Recibo de pago aprobado - ArtoCamello',
    text: `Hola ${name},\n\nTu pago fue aprobado y el contacto está disponible en Mis Contactos. Tu recibo PDF está adjunto.${walletUrl ? ` También puedes descargarlo al iniciar sesión: ${walletUrl}` : ''}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nEste recibo es una confirmación de pago, no una factura tributaria ni una factura electrónica del SRI.`,
    html: renderTransferReceipt(name, rows, 'cid:artocamello-logo', walletUrl),
    attachments: [{ filename: 'logoartocamello-white.png', path: path.join(__dirname, '..', 'assets', 'logoartocamello-white.png'), cid: 'artocamello-logo' },
      { filename: `recibo-${paymentId}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
  if (!result.accepted?.includes(payment.payer.email) || (billingEmail !== payment.payer.email && !result.accepted?.includes(billingEmail))) throw new Error('SMTP did not accept receipt recipient');
  return true;
}
