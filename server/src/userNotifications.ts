import { PrismaClient } from '@prisma/client';
import { createSmtpTransport, smtpFrom } from './mail';
import { publicBaseUrl } from './payments';

/** Only direct, verified targets receive a one-to-one alert; never include request/contact details. */
export async function notifyDirectRequest(db: PrismaClient, tenantId: string, professionalUserId: string, hostname: string): Promise<void> {
  const user = await db.user.findFirst({ where: { id: professionalUserId, tenantId, role: 'pro', active: true, emailVerified: true, professionalProfile: { verified: true } }, select: { id: true, email: true } });
  if (!user) return;
  const preference = await db.notificationPreference.findUnique({ where: { userId_key: { userId: user.id, key: 'notif-new-jobs' } } });
  if (preference?.enabled === false) return;
  const url = `${await publicBaseUrl(db, tenantId, hostname)}/dashboard/contacts`;
  await createSmtpTransport().sendMail({
    from: smtpFrom(), to: user.email, subject: 'Tienes una nueva solicitud directa - ArtoCamello',
    text: `Un cliente envió una solicitud directamente a tu perfil. Inicia sesión para ver la información disponible: ${url}\n\nEl contacto solo se desbloquea cuando se confirma el pago. Puedes cambiar tus preferencias en Configuración.`,
  });
}

/** Notify a client of the first quote for a purchase, without including the quote or contact data. */
export async function notifyNewQuote(db: PrismaClient, tenantId: string, clientId: string, hostname: string): Promise<void> {
  const user = await db.user.findFirst({ where: { id: clientId, tenantId, role: 'client', active: true, emailVerified: true }, select: { id: true, email: true } });
  if (!user) return;
  const preference = await db.notificationPreference.findUnique({ where: { userId_key: { userId: user.id, key: 'emailQuotes' } } });
  if (preference?.enabled === false) return;
  const url = `${await publicBaseUrl(db, tenantId, hostname)}/mis-solicitudes`;
  await createSmtpTransport().sendMail({
    from: smtpFrom(), to: user.email, subject: 'Recibiste una cotización - ArtoCamello',
    text: `Un profesional respondió a una de tus solicitudes. Inicia sesión para revisar la cotización: ${url}\n\nPuedes cambiar tus preferencias en Mi perfil.`,
  });
}

/** Security notice sent to the former address after a successful, irreversible closure. */
export async function notifyAccountClosed(email: string, role: 'client' | 'pro'): Promise<void> {
  await createSmtpTransport().sendMail({
    from: smtpFrom(), to: email, subject: 'Tu cuenta de ArtoCamello se cerró',
    text: `Se cerró tu cuenta de ${role === 'pro' ? 'profesional' : 'cliente'} en ArtoCamello. Si no solicitaste este cierre, contacta a soporte por el canal habitual. No envíes contraseñas por correo.`,
  });
}

/** Transactional payment notice: never include proof images or bank account details. */
export async function notifyRejectedTransfer(db: PrismaClient, tenantId: string, payerUserId: string, reference: string, hostname: string): Promise<void> {
  const payer = await db.user.findFirst({ where: { id: payerUserId, tenantId, role: 'pro', active: true, emailVerified: true }, select: { email: true } });
  if (!payer) return;
  const url = `${await publicBaseUrl(db, tenantId, hostname)}/dashboard/contacts`;
  await createSmtpTransport().sendMail({
    from: smtpFrom(), to: payer.email, subject: 'Revisa tu comprobante de transferencia - ArtoCamello',
    text: `El comprobante de la transferencia ${reference} no fue aprobado. Entra en ${url} y revisa el motivo en el estado del pago antes de reenviarlo. Si ya se debitó el importe, contacta a soporte.`,
  });
}
