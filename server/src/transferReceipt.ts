import { PrismaClient } from '@prisma/client';
import path from 'path';
import { escapeHtml } from './htmlEscape';
import { createSmtpTransport, smtpFrom } from './mail';

export function renderTransferReceipt(name: string, rows: string[][], logoSrc: string): string {
  const htmlRows = rows.map(([label, value]) => `<tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#667085">${escapeHtml(label)}</td><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#101828;font-weight:600">${escapeHtml(value)}</td></tr>`).join('');
  return `<div style="margin:0;background:#f3f4f6;padding:24px 12px;font-family:Arial,sans-serif;color:#101828"><div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;overflow:hidden"><div style="background:#ffca0c;padding:20px 28px"><img src="${escapeHtml(logoSrc)}" alt="ArtoCamello" style="display:block;max-width:190px;height:auto"></div><div style="padding:28px"><p style="color:#15803d;font-weight:bold;margin:0">PAGO APROBADO</p><h1 style="font-size:26px;margin:12px 0">Recibo de pago</h1><p>Hola ${escapeHtml(name)}, tu transferencia fue validada y el contacto ya está disponible en Mis Contactos.</p><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${htmlRows}</table><p style="font-size:12px;color:#667085;margin-top:24px">Este recibo es una confirmación de pago, no una factura tributaria.</p></div></div></div>`;
}

/** A single delivery attempt per approved payment; delivery errors never undo allocation. */
export async function sendTransferReceipt(db: PrismaClient, tenantId: string, paymentId: string): Promise<void> {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, tenantId, method: 'transfer', status: 'allocated' },
    include: { payer: { select: { fullName: true, email: true, professionalProfile: { select: { businessName: true, city: true } } } }, allocations: { include: { leadPurchase: { include: { request: { select: { title: true } } } } } } },
  });
  if (!payment || !payment.allocations.length || !payment.confirmedAt) throw new Error('Pago asignado sin datos para recibo');

  try {
    await db.paymentEvent.create({ data: { tenantId, paymentId, type: 'receipt_email_attempted', source: 'system', idempotencyKey: `receipt-email:${paymentId}`, payload: {} } });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return;
    throw error;
  }

  const name = payment.payer.fullName;
  const title = payment.allocations[0].leadPurchase.request.title;
  const amount = `${payment.amount.toFixed(2)} ${payment.currency}`;
  const date = new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(payment.confirmedAt);
  const rows = [
    ['Profesional', name], ['Correo', payment.payer.email],
    ...(payment.payer.professionalProfile?.businessName ? [['Negocio', payment.payer.professionalProfile.businessName]] : []),
    ...(payment.payer.professionalProfile?.city ? [['Ciudad', payment.payer.professionalProfile.city]] : []),
    ['Referencia', payment.reference], ['Concepto', `Desbloqueo de contacto: ${title}`], ['Método de pago', 'Transferencia bancaria'], ['Fecha de aprobación', `${date} (hora de Ecuador)`], ['Total pagado', amount],
  ];
  await createSmtpTransport().sendMail({
    from: smtpFrom(),
    to: payment.payer.email,
    subject: 'Recibo de pago aprobado - ArtoCamello',
    text: `Hola ${name},\n\nTu pago fue aprobado y el contacto está disponible en Mis Contactos.\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nEste recibo es una confirmación de pago, no una factura tributaria.`,
    html: renderTransferReceipt(name, rows, 'cid:artocamello-logo'),
    attachments: [{ filename: 'logoartocamello-white.png', path: path.join(__dirname, '..', 'assets', 'logoartocamello-white.png'), cid: 'artocamello-logo' }],
  });
}
