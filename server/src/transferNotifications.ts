import { PrismaClient } from '@prisma/client';
import { createSmtpTransport, smtpFrom } from './mail';

export async function notifyTransferReview(db: PrismaClient, tenantId: string, reference: string): Promise<void> {
  const reviewers = await db.tenantMembership.findMany({
    where: {
      tenantId,
      status: 'active',
      user: { active: true },
      role: { permissions: { some: { permission: { code: 'payments.review' } } } },
    },
    select: { user: { select: { email: true } } },
  });
  if (!reviewers.length) {
    console.warn('No hay revisores activos para una transferencia pendiente.', { tenantId });
    return;
  }

  const mail = createSmtpTransport();
  const results = await Promise.allSettled([...new Set(reviewers.map(reviewer => reviewer.user.email))].map(to => mail.sendMail({
    from: smtpFrom(),
    to,
    subject: 'Comprobante de transferencia pendiente de revisión',
    text: `Se ha recibido un comprobante de transferencia para revisión.\n\nReferencia: ${reference}\n\nIngresa al panel administrativo y consulta Transferencias para verificar el pago.`,
  })));
  const failures = results.filter(result => result.status === 'rejected').length;
  if (failures) console.error('No se pudieron enviar avisos de transferencia.', { tenantId, failures });
}

/** Revalidate the review permission for a single outbox recipient at delivery time. */
export async function notifyTransferReviewRecipient(db: PrismaClient, tenantId: string, userId: string, reference: string): Promise<boolean> {
  const member = await db.tenantMembership.findFirst({ where: {
    tenantId, userId, status: 'active', user: { active: true, emailVerified: true },
    role: { permissions: { some: { permission: { code: 'payments.review' } } } },
  }, select: { user: { select: { email: true } } } });
  if (!member) return false;
  const result = await createSmtpTransport().sendMail({
    from: smtpFrom(), to: member.user.email, subject: 'Comprobante de transferencia pendiente de revisión',
    text: `Se ha recibido un comprobante de transferencia para revisión.\n\nReferencia: ${reference}\n\nIngresa al panel administrativo y consulta Transferencias para verificar el pago.`,
  });
  if (!result.accepted?.includes(member.user.email)) throw new Error('SMTP did not accept reviewer');
  return true;
}
