import nodemailer from 'nodemailer';

export function createSmtpTransport() {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    ...(process.env.SMTP_HOST
      ? { host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465 }
      : { service: 'gmail' }),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export const smtpFrom = () => process.env.SMTP_FROM || process.env.SMTP_USER || '';
