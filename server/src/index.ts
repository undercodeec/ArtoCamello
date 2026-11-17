import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { createSmtpTransport, smtpFrom } from './mail';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { adminRouter } from './admin';
import { adminEmailCodeRouter } from './adminEmailCodeRouter';
import { transferRouter } from './transfers';
import { allocateLead, leadAmount, settingsOf, PaymentConflict, expirePendingPayments, publicBaseUrl } from './payments';
import { platformRouter } from './platform';
import { PayPhoneProvider } from './payphoneProvider';
import { kushkiWebhookRouter } from './kushkiWebhook';
import { clearAuthAttempt, consumeAuthAttempt, pruneAuthAttempts } from './authThrottle';
import { canonicalServiceCategories, hasServiceCategory } from './serviceCategories';
import { OPEN_REQUEST_STATUSES, canProfessionalAccessRequest, isOpenRequest, isPurchasableRequest, publicCity, purchaseLimitForRequest, toProfessionalPreview, validRequestFields } from './requestPolicy';
import { CaptchaConfigurationError, verifyRecaptcha } from './captcha';
import { createEmailVerificationToken, verifyEmailVerificationToken } from './emailVerification';
import { escapeHtml } from './htmlEscape';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const trustedProxyCidrs = (process.env.TRUST_PROXY_CIDRS || '').split(',').map(value => value.trim()).filter(Boolean);
if (trustedProxyCidrs.length) app.set('trust proxy', trustedProxyCidrs);
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) throw new Error('JWT_SECRET de al menos 32 caracteres requerido');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-me';

// ---- PayPhone config ----
const PAYPHONE_TOKEN = process.env.PAYPHONE_TOKEN || '';
const PAYPHONE_STORE_ID = process.env.PAYPHONE_STORE_ID || '';
const PAYPHONE_BASE_URL = process.env.PAYPHONE_BASE_URL || 'https://pay.payphonetodoesposible.com';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
const adminHostnames = new Set((process.env.ADMIN_HOSTNAMES || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
if (process.env.NODE_ENV === 'production' && !adminHostnames.size) throw new Error('ADMIN_HOSTNAMES es obligatorio en producción');
const isAdminHost = (hostname: string) => !adminHostnames.size || adminHostnames.has(hostname.toLowerCase());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) { callback(null, true); return; }
    try {
      const url = new URL(origin);
      if (url.protocol === 'http:' && ['localhost', 'admin.localhost'].includes(url.hostname) && url.port === '5173') { callback(null, true); return; }
      if (url.protocol !== 'https:') { callback(null, false); return; }
      prisma.tenantDomain.findUnique({ where: { hostname: url.hostname.toLowerCase() } }).then(domain => callback(null, Boolean(domain))).catch(callback);
    } catch { callback(null, false); }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Email-Session', 'Idempotency-Key']
}));
app.use('/api/webhooks/kushki', kushkiWebhookRouter(prisma));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ====================================================================
// CONFIGURACIÓN DE CORREO (NODEMAILER)
// ====================================================================
const transporter = createSmtpTransport();

// ====================================================================
// HELPERS
// ====================================================================

async function tenantForHost(hostname: string): Promise<string | null> {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized === '127.0.0.1') return 'artocamello';
  const domain = await prisma.tenantDomain.findUnique({ where: { hostname: normalized } });
  return domain?.tenantId || null;
}

async function captchaPassed(req: Request, res: Response): Promise<boolean> {
  const token = req.body?.captchaToken;
  if (typeof token !== 'string' || !token.trim() || token.length > 4096) {
    res.status(400).json({ error: 'Completa la verificación de seguridad.' });
    return false;
  }
  try {
    if (await verifyRecaptcha(token, req.hostname, req.ip)) return true;
    res.status(403).json({ error: 'La verificación de seguridad no es válida o venció.' });
  } catch (error) {
    if (error instanceof CaptchaConfigurationError) res.status(503).json({ error: 'La verificación de seguridad no está disponible.' });
    else throw error;
  }
  return false;
}

function validClientName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 100;
}

function validClientPhone(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const phone = value.trim();
  const digits = phone.replace(/\D/g, '');
  return phone.length <= 25 && /^\+?[0-9()\s-]+$/.test(phone) && digits.length >= 7 && digits.length <= 15;
}

// ====================================================================
// RUTAS DE AUTENTICACIÓN
// ====================================================================

// 1. Registro
app.post('/api/auth/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, fullName, phone } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 128 || typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.length > 100 || (phone !== undefined && (typeof phone !== 'string' || phone.length > 30))) { res.status(400).json({ error: 'Datos de registro inválidos' }); return; }
    const normalizedEmail = email.trim().toLowerCase();
    const tenantId = await tenantForHost(req.hostname);
    if (!tenantId) { res.status(404).json({ error: 'Tenant no configurado' }); return; }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const limit = await consumeAuthAttempt(prisma, JWT_SECRET, ['register-ip', tenantId, ip], 20, 3600000);
    if (!limit.allowed) { res.setHeader('Retry-After', String(limit.retryAfterSeconds)).status(429).json({ error: 'Demasiados intentos de registro' }); return; }
    if (!await captchaPassed(req, res)) return;
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) { res.status(503).json({ error: 'La confirmación por correo no está disponible.' }); return; }
    const finalRole = 'guest'; // Siempre forzar guest al inicio

    const existingUser = await prisma.user.findFirst({ where: { email: { equals: normalizedEmail, mode: 'insensitive' } } });
    if (existingUser) {
      res.status(400).json({ error: 'El correo electrónico ya está en uso' });
      return;
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const verification = createEmailVerificationToken();
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          fullName,
          role: finalRole,
          phone,
          emailVerified: false,
          tenantId,
        },
      });
      await tx.emailVerificationToken.create({ data: { userId: newUser.id, tokenHash: verification.tokenHash, expiresAt: verification.expiresAt } });
      return newUser;
    });

    try {
      const baseUrl = await publicBaseUrl(prisma, tenantId, req.hostname);
      const verificationUrl = new URL('/verificar-correo', baseUrl);
      verificationUrl.hash = new URLSearchParams({ token: verification.token }).toString();
      await transporter.sendMail({
        from: `"ArtoCamello Cuentas" <${smtpFrom()}>`,
        to: result.email,
        subject: 'Confirma tu correo en ArtoCamello',
        text: `Hola ${result.fullName}, confirma tu correo en las pr?ximas 24 horas: ${verificationUrl.toString()}`,
        html: `<p>Hola ${escapeHtml(result.fullName)},</p><p>Confirma tu correo en las pr?ximas 24 horas:</p><p><a href="${escapeHtml(verificationUrl.toString())}">Confirmar correo</a></p>`,
      });
    } catch (error) {
      console.error('Error enviando correo de verificaci?n:', error);
      res.status(503).json({ error: 'No se pudo enviar la confirmaci?n por correo. Solicita un nuevo enlace.' });
      return;
    }
    res.status(201).json({ success: true, message: 'Revisa tu correo para confirmar la cuenta.', requiresVerification: true });
  } catch (error) {
    console.error('Error in /register:', error);
    res.status(500).json({ error: 'Hubo un error en el servidor al intentar registrarte' });
  }
});

app.post('/api/auth/verify-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.body?.token;
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) { res.status(400).json({ error: 'Enlace inválido' }); return; }
    const tenantId = await tenantForHost(req.hostname);
    if (!tenantId) { res.status(404).json({ error: 'Tenant no configurado' }); return; }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const verification = await prisma.emailVerificationToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!verification || verification.user.tenantId !== tenantId || !verification.user.active || !verifyEmailVerificationToken(token, verification.tokenHash, verification.expiresAt)) {
      res.status(400).json({ error: 'Enlace inválido o vencido' }); return;
    }
    const user = await prisma.$transaction(async tx => {
      const lockedUsers = await tx.$queryRaw<{ emailVerified: boolean; active: boolean }[]>`SELECT "emailVerified", "active" FROM "User" WHERE "id" = ${verification.userId} FOR UPDATE`;
      if (!lockedUsers[0] || !lockedUsers[0].active || lockedUsers[0].emailVerified) return null;
      const consumed = await tx.emailVerificationToken.deleteMany({ where: { id: verification.id, tokenHash, expiresAt: { gt: new Date() } } });
      if (!consumed.count) return null;
      await tx.user.update({ where: { id: verification.userId }, data: { emailVerified: true } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: verification.userId } });
      return tx.user.findUniqueOrThrow({ where: { id: verification.userId } });
    });
    if (!user) { res.status(400).json({ error: 'Enlace ya utilizado' }); return; }
    const { password: _password, verificationToken: _verificationToken, mfaSecret: _mfaSecret, mfaPendingSecret: _mfaPending, mfaRecoveryHashes: _mfaRecovery, mfaLastCounter: _mfaCounter, mfaFailureCount: _mfaFailures, mfaLockedUntil: _mfaLock, ...safeUser } = user;
    const sessionToken = jwt.sign({ userId: user.id, role: user.role, email: user.email, sessionVersion: user.sessionVersion }, JWT_SECRET, { expiresIn: '7d' });
    res.status(200).json({ user: safeUser, token: sessionToken });
  } catch (error) { console.error('Error verifying email:', error); res.status(500).json({ error: 'Error al verificar el correo' }); }
});

app.post('/api/auth/resend-verification', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = req.body?.email;
    if (typeof email !== 'string' || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ error: 'Correo inválido' }); return; }
    const tenantId = await tenantForHost(req.hostname);
    if (!tenantId) { res.status(404).json({ error: 'Tenant no configurado' }); return; }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const limit = await consumeAuthAttempt(prisma, JWT_SECRET, ['resend-email', tenantId, ip, email.trim().toLowerCase()], 3, 3600000);
    if (!limit.allowed) { res.setHeader('Retry-After', String(limit.retryAfterSeconds)).status(429).json({ error: 'Espera antes de solicitar otro enlace' }); return; }
    if (!await captchaPassed(req, res)) return;
    const user = await prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' }, tenantId, emailVerified: false, active: true } });
    if (user && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const verification = createEmailVerificationToken();
      const baseUrl = await publicBaseUrl(prisma, tenantId, req.hostname);
      const verificationUrl = new URL('/verificar-correo', baseUrl);
      verificationUrl.hash = new URLSearchParams({ token: verification.token }).toString();
      let createdVerificationId: string | null = null;
      try {
        const createdVerification = await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: verification.tokenHash, expiresAt: verification.expiresAt } });
        createdVerificationId = createdVerification.id;
        await transporter.sendMail({ from: `"ArtoCamello Cuentas" <${smtpFrom()}>`, to: user.email, subject: 'Confirma tu correo en ArtoCamello', text: `Confirma tu correo en las próximas 24 horas: ${verificationUrl.toString()}` });
      } catch (error) {
        if (createdVerificationId) await prisma.emailVerificationToken.deleteMany({ where: { id: createdVerificationId } });
        console.error('Error enviando reenvío de verificación:', error);
      }
    }
    res.status(200).json({ success: true, message: 'Si la cuenta necesita confirmación, enviaremos un nuevo enlace.' });
  } catch (error) { console.error('Error resending email verification:', error); res.status(500).json({ error: 'Error al solicitar el enlace' }); }
});

// 2. Login
app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 320 || password.length > 1024) { res.status(400).json({ error: 'Credenciales inválidas' }); return; }
    const loginTenantId = await tenantForHost(req.hostname);
    if (!loginTenantId) { res.status(403).json({ error: 'Tenant incorrecto' }); return; }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipLimit = await consumeAuthAttempt(prisma, JWT_SECRET, ['login-ip', loginTenantId, ip], 80, 15 * 60000);
    const accountLimit = await consumeAuthAttempt(prisma, JWT_SECRET, ['login-account-ip', loginTenantId, ip, email.trim().toLowerCase()], 8, 15 * 60000);
    if (!ipLimit.allowed || !accountLimit.allowed) { res.setHeader('Retry-After', String(Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds))).status(429).json({ error: 'Demasiados intentos. Espera antes de volver a iniciar sesión' }); return; }
    const submittedEmail = email.trim();
    const user = await prisma.user.findUnique({ where: { email: submittedEmail } })
      || await prisma.user.findUnique({ where: { email: submittedEmail.toLowerCase() } });
    if (!user || !user.active) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }
    if (user.tenantId !== loginTenantId) {
      const membership = await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: loginTenantId, userId: user.id } } });
      if (!membership || !['active','invited'].includes(membership.status)) { res.status(403).json({ error: 'Tenant incorrecto' }); return; }
    }

    const isValid = await bcrypt.compare(password, user.password || '');
    if (!isValid) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    if (!user.emailVerified) { res.status(403).json({ error: 'Confirma tu correo antes de iniciar sesión', requiresVerification: true }); return; }
    await clearAuthAttempt(prisma, JWT_SECRET, ['login-account-ip', loginTenantId, ip, email.trim().toLowerCase()]);

    const { password: _, verificationToken: _verificationToken, mfaSecret: _mfaSecret, mfaPendingSecret: _mfaPending, mfaRecoveryHashes: _mfaRecovery, mfaLastCounter: _mfaCounter, mfaFailureCount: _mfaFailures, mfaLockedUntil: _mfaLock, ...userWithoutPassword } = user;
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email, sessionVersion: user.sessionVersion },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Error in /login:', error);
    res.status(500).json({ error: 'Hubo un error en el servidor al intentar iniciar sesión' });
  }
});

const resetRequestMessage = 'Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.';
const resetTokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

app.post('/api/auth/forgot-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = req.body?.email;
    if (typeof email !== 'string' || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      res.status(400).json({ error: 'Ingresa un correo electrónico válido.' }); return;
    }
    const tenantId = await tenantForHost(req.hostname);
    if (!tenantId || isAdminHost(req.hostname) && adminHostnames.size) { res.status(403).json({ error: 'Sitio no disponible.' }); return; }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const normalizedEmail = email.trim().toLowerCase();
    const [ipLimit, accountLimit] = await Promise.all([
      consumeAuthAttempt(prisma, JWT_SECRET, ['reset-ip', tenantId, ip], 20, 60 * 60000),
      consumeAuthAttempt(prisma, JWT_SECRET, ['reset-account', tenantId, normalizedEmail], 3, 60 * 60000),
    ]);
    if (!ipLimit.allowed || !accountLimit.allowed) {
      res.setHeader('Retry-After', String(Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds))).status(429).json({ error: 'Demasiados intentos. Espera antes de solicitar otro enlace.' }); return;
    }
    const user = await prisma.user.findFirst({ where: { tenantId, email: { equals: normalizedEmail, mode: 'insensitive' } } });
    if (!user) { res.status(404).json({ code: 'EMAIL_NOT_REGISTERED', error: 'Este correo no está registrado. Puedes crear una cuenta.' }); return; }
    if (!user.active) { res.status(403).json({ error: 'Esta cuenta no está activa. Contacta a soporte.' }); return; }
    if (!user.emailVerified) { res.status(409).json({ code: 'EMAIL_NOT_VERIFIED', error: 'Confirma tu correo antes de restablecer la contraseña.' }); return; }
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) { res.status(503).json({ error: 'El envío de correo no está disponible temporalmente.' }); return; }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await prisma.passwordResetToken.upsert({
      where: { userId: user.id },
      create: { userId: user.id, tokenHash: resetTokenHash(token), expiresAt },
      update: { tokenHash: resetTokenHash(token), expiresAt },
    });
    const resetUrl = new URL('/recuperar-contrasena', await publicBaseUrl(prisma, tenantId, req.hostname));
    resetUrl.hash = new URLSearchParams({ token }).toString();
    try {
      const delivery = await transporter.sendMail({
        from: `"ArtoCamello Cuentas" <${smtpFrom()}>`,
        to: user.email,
        subject: 'Restablece tu contraseña de ArtoCamello',
        text: `Solicitaste cambiar la contraseña de tu cuenta. Abre este enlace para continuar:\n${resetUrl.toString()}\n\nEl enlace vence en 30 minutos y solo puede usarse una vez. Si no solicitaste el cambio, ignora este mensaje.`,
      });
      if (!delivery.accepted?.some((recipient: string) => recipient.toLowerCase() === user.email.toLowerCase())) {
        throw new Error('El servidor SMTP no aceptó el destinatario');
      }
    } catch (mailError) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, tokenHash: resetTokenHash(token) } });
      console.error('Error enviando recuperación de contraseña:', mailError);
      res.status(503).json({ error: 'No se pudo enviar el correo de recuperación. Intenta nuevamente más tarde.' }); return;
    }
    res.json({ message: resetRequestMessage });
  } catch (error) {
    console.error('Error in /forgot-password:', error);
    res.status(500).json({ error: 'No se pudo procesar la solicitud.' });
  }
});

app.post('/api/auth/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Enlace o contraseña inválidos. La contraseña debe tener entre 8 y 128 caracteres.' }); return;
    }
    const tenantId = await tenantForHost(req.hostname);
    if (!tenantId || isAdminHost(req.hostname) && adminHostnames.size) { res.status(403).json({ error: 'Sitio no disponible.' }); return; }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const limit = await consumeAuthAttempt(prisma, JWT_SECRET, ['reset-use-ip', tenantId, ip], 30, 15 * 60000);
    if (!limit.allowed) { res.setHeader('Retry-After', String(limit.retryAfterSeconds)).status(429).json({ error: 'Demasiados intentos. Espera antes de volver a intentar.' }); return; }

    const tokenHash = resetTokenHash(token);
    const hashedPassword = await bcrypt.hash(password, 10);
    const changed = await prisma.$transaction(async tx => {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!record || record.expiresAt <= new Date() || record.user.tenantId !== tenantId || !record.user.active || !record.user.emailVerified) return false;
      const consumed = await tx.passwordResetToken.deleteMany({ where: { id: record.id, tokenHash, expiresAt: { gt: new Date() } } });
      if (consumed.count !== 1) return false;
      await tx.user.update({ where: { id: record.userId }, data: { password: hashedPassword, authProvider: 'local', sessionVersion: { increment: 1 } } });
      return true;
    });
    if (!changed) { res.status(400).json({ error: 'El enlace no es válido o ya venció. Solicita uno nuevo.' }); return; }
    res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    console.error('Error in /reset-password:', error);
    res.status(500).json({ error: 'No se pudo restablecer la contraseña.' });
  }
});

// 3. Login y Registro vía Google
/* Legacy Google and email-link verification endpoints are disabled.
app.post('/api/auth/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential } = req.body || {};
    if (typeof credential !== 'string' || !credential || credential.length > 8192) { res.status(400).json({ error: 'Credencial de Google inválida' }); return; }
    const tenantId = await tenantForHost(req.hostname);
    if (!tenantId) { res.status(404).json({ error: 'Tenant no configurado' }); return; }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const limit = await consumeAuthAttempt(prisma, JWT_SECRET, ['google-ip', tenantId, ip], 60, 15 * 60000);
    if (!limit.allowed) { res.setHeader('Retry-After', String(limit.retryAfterSeconds)).status(429).json({ error: 'Demasiados intentos. Espera antes de volver a iniciar sesión' }); return; }

    let payload: any;
    if (credential.startsWith('ya29.')) {
      // Es un Access Token (proviene de un botón personalizado con useGoogleLogin)
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${credential}` } });
        if (!userInfoRes.ok) {
          throw new Error('No se pudo obtener información del usuario desde Google');
        }
        payload = await userInfoRes.json();
        // Mapear campos de userinfo a lo que espera el payload de ID Token
        if (payload.picture && !payload.picture.startsWith('http')) {
           // a veces viene vacío o diferente
        }
      } catch (err) {
        console.error('Google access token verification failed', err);
        res.status(401).json({ error: 'Token de acceso de Google inválido o expirado.' });
        return;
      }
    } else {
      // Es un ID Token (JWT estándar de GoogleLogin)
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch (err) {
        console.error('Google ID token verification failed', err);
        res.status(401).json({ error: 'Firma de Google inválida o credenciales caducadas.' });
        return;
      }
    }

    if (!payload || !payload.email) {
      res.status(401).json({ error: 'Token de Google sin email ligado.' });
      return;
    }
    if (!payload.email_verified) { res.status(403).json({ error: 'Correo de Google no verificado' }); return; }

    const { email, name, picture } = payload;

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const defaultRole = 'guest'; // Forzar guest para Google auth nuevo
      user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            password: null,
            authProvider: 'google',
            fullName: name || 'Usuario Google',
            avatarUrl: picture,
            emailVerified: true,
            role: defaultRole,
            tenantId,
          },
        });

        return newUser;
      });
    }

    if (!user.active) { res.status(403).json({ error: 'Tenant o cuenta no disponible' }); return; }
    if (user.tenantId !== tenantId) {
      const membership = await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
      if (!membership || !['active', 'invited'].includes(membership.status)) { res.status(403).json({ error: 'Tenant incorrecto' }); return; }
    }
    const { password: _, verificationToken: _verificationToken, mfaSecret: _mfaSecret, mfaPendingSecret: _mfaPending, mfaRecoveryHashes: _mfaRecovery, mfaLastCounter: _mfaCounter, mfaFailureCount: _mfaFailures, mfaLockedUntil: _mfaLock, ...userWithoutPassword } = user;

    const jwtToken = jwt.sign(
      { userId: user.id, role: user.role, email: user.email, sessionVersion: user.sessionVersion },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({ user: userWithoutPassword, token: jwtToken });
  } catch (error) {
    console.error('Error in /google:', error);
    res.status(500).json({ error: 'Hubo un error en el servidor al asociar Google' });
  }
});

// 4. Verificación de Correo
app.get('/api/auth/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Token de verificación no proporcionado o inválido' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { verificationToken: token } });
    if (!user) {
      res.status(400).json({ error: 'Token caducado o inexistente. Tu cuenta ya pudo haber sido verificada.' });
      return;
    }

    const verifiedUser = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });

    const { password: _, verificationToken: _verificationToken, mfaSecret: _mfaSecret, mfaPendingSecret: _mfaPending, mfaRecoveryHashes: _mfaRecovery, mfaLastCounter: _mfaCounter, mfaFailureCount: _mfaFailures, mfaLockedUntil: _mfaLock, ...userWithoutPassword } = verifiedUser;

    const jwtToken = jwt.sign(
      { userId: verifiedUser.id, role: verifiedUser.role, email: verifiedUser.email, sessionVersion: verifiedUser.sessionVersion },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({ user: userWithoutPassword, token: jwtToken });
  } catch (error) {
    console.error('Error in /verify:', error);
    res.status(500).json({ error: 'Fallo al procesar la verificación' });
  }
});

// ====================================================================
// MIDDLEWARE DE AUTENTICACIÓN
// ====================================================================

*/
export interface AuthRequest extends Request {
  user?: { userId: string; role: string; email: string; tenantId: string };
}

const authenticateToken = (req: AuthRequest, res: Response, next: express.NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Denegado: No token proveído' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      res.status(403).json({ error: 'Denegado: Token inválido o expirado' });
      return;
    }
    const claims = decoded as { userId?: string; sessionVersion?: number };
    if (!claims.userId) { res.status(403).json({ error: 'Token invalido' }); return; }
    prisma.user.findUnique({ where: { id: claims.userId } }).then(user => {
      if (!user?.active || !user.emailVerified || Number(claims.sessionVersion ?? 0) !== user.sessionVersion) { res.status(403).json({ error: 'Cuenta o sesión no disponible' }); return; }
      tenantForHost(req.hostname).then(tenantId => {
        if (!tenantId || tenantId !== user.tenantId) { res.status(403).json({ error: 'Tenant incorrecto' }); return; }
        req.user = { userId: user.id, role: user.role, email: user.email, tenantId };
        next();
      }).catch(next);
    }).catch(next);
  });
};

// ====================================================================
// RUTAS PROTEGIDAS — ONBOARDING
// ====================================================================

// 5. Establecer Rol en el Onboarding
app.post('/api/auth/role', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, fullName, phone } = req.body || {};
    const userId = req.user!.userId;

    if (role !== 'client' && role !== 'pro') {
      res.status(400).json({ error: 'Rol inválido' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { clientProfile: true, professionalProfile: true },
    });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    if (!user.active || !user.emailVerified) { res.status(403).json({ error: 'Confirma tu correo antes de continuar' }); return; }
    if (user.role !== 'guest' || user.clientProfile || user.professionalProfile) {
      res.status(409).json({ error: 'El rol ya fue definido' });
      return;
    }
    if (role === 'client' && (!validClientName(fullName) || !validClientPhone(phone))) {
      res.status(400).json({ error: 'Indica tu nombre completo y un teléfono válido para crear el perfil.' }); return;
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const claimed = await tx.user.updateMany({ where: { id: userId, role: 'guest', active: true, emailVerified: true }, data: role === 'client' ? { role, fullName: fullName.trim(), phone: phone.trim() } : { role } });
      if (!claimed.count) return null;
      if (role === 'client') {
        await tx.clientProfile.create({ data: { userId, tenantId: req.user!.tenantId } });
      } else {
        await tx.professionalProfile.create({
          data: { userId, tenantId: req.user!.tenantId, bio: '', categories: [], serviceZones: [] },
        });
      }
      return tx.user.findUniqueOrThrow({ where: { id: userId } });
    });
    if (!updatedUser) {
      res.status(409).json({ error: 'El rol ya fue definido' });
      return;
    }

    const { password: _, verificationToken: _verificationToken, mfaSecret: _mfaSecret, mfaPendingSecret: _mfaPending, mfaRecoveryHashes: _mfaRecovery, mfaLastCounter: _mfaCounter, mfaFailureCount: _mfaFailures, mfaLockedUntil: _mfaLock, ...userWithoutPassword } = updatedUser;

    const newToken = jwt.sign(
      { userId: updatedUser.id, role: updatedUser.role, email: updatedUser.email, sessionVersion: updatedUser.sessionVersion },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({ user: userWithoutPassword, token: newToken });
  } catch (error) {
    console.error('Error in /api/auth/role:', error);
    res.status(500).json({ error: 'Error al asignar el rol' });
  }
});

// ====================================================================
// RUTAS DE PETICIONES (SOLICITUDES DE CLIENTES)
// ====================================================================

// 6. Crear una nueva petición (Cliente)
app.post('/api/requests', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'client') { res.status(403).json({ error: 'Solo los clientes pueden crear solicitudes.' }); return; }
    const body = req.body || {};
    if (!['direct', 'marketplace'].includes(body.visibility) || !validRequestFields(body)
      || (body.visibility === 'direct' ? typeof body.targetProfessionalUserId !== 'string' : body.targetProfessionalUserId != null)) {
      res.status(400).json({ error: 'Datos de solicitud inválidos' }); return;
    }
    const owner = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { emailVerified: true } });
    if (!owner?.emailVerified) { res.status(403).json({ error: 'Verifica tu correo antes de publicar' }); return; }
    const retryKey = req.header('idempotency-key');
    if (retryKey && body.visibility === 'marketplace' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(retryKey)) {
      const retryFields = { visibility: body.visibility, targetProfessionalUserId: null,
        categorySlug: body.categorySlug.trim(), title: body.title.trim(), description: body.description.trim(), city: body.city.trim(), location: body.location.trim(),
        urgency: body.urgency, preferredDate: body.preferredDate ? new Date(body.preferredDate) : null,
        contactPhone: body.contactPhone.trim(), contactEmail: body.contactEmail.trim(), contactName: body.contactName?.trim() || null,
        estimatedBudget: Number(body.estimatedBudget) };
      const retryHash = crypto.createHash('sha256').update(JSON.stringify(retryFields)).digest('hex');
      const previous = await prisma.serviceRequest.findFirst({ where: { tenantId: req.user!.tenantId, clientId: req.user!.userId, idempotencyKey: retryKey } });
      if (previous) {
        if (previous.payloadHash !== retryHash) { res.status(409).json({ error: 'Clave de idempotencia ya utilizada con otro contenido' }); return; }
        res.status(200).json(previous); return;
      }
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userLimit = await consumeAuthAttempt(prisma, JWT_SECRET, ['publish-user', req.user!.tenantId, req.user!.userId], 20, 3600000);
    const ipLimit = await consumeAuthAttempt(prisma, JWT_SECRET, ['publish-ip', req.user!.tenantId, ip], 60, 3600000);
    if (!userLimit.allowed || !ipLimit.allowed) { res.setHeader('Retry-After', String(Math.max(userLimit.retryAfterSeconds, ipLimit.retryAfterSeconds))).status(429).json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }); return; }
    if (!await captchaPassed(req, res)) return;
    if (body.visibility === 'direct') {
      const target = await prisma.user.findFirst({ where: { id: body.targetProfessionalUserId, tenantId: req.user!.tenantId, role: 'pro', active: true, emailVerified: true }, include: { professionalProfile: true } });
      if (!target?.professionalProfile?.verified || !hasServiceCategory(target.professionalProfile.categories, body.categorySlug)) {
        res.status(404).json({ error: 'Profesional no disponible para esta categoría' }); return;
      }
    }
    const key = req.header('idempotency-key');
    if (key && (body.visibility !== 'marketplace' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))) {
      res.status(400).json({ error: 'Idempotency-Key inválida' }); return;
    }
    const fields = { visibility: body.visibility, targetProfessionalUserId: body.visibility === 'direct' ? body.targetProfessionalUserId : null,
      categorySlug: body.categorySlug.trim(), title: body.title.trim(), description: body.description.trim(), city: body.city.trim(), location: body.location.trim(),
      urgency: body.urgency, preferredDate: body.preferredDate ? new Date(body.preferredDate) : null,
      contactPhone: body.contactPhone.trim(), contactEmail: body.contactEmail.trim(), contactName: body.contactName?.trim() || null,
      estimatedBudget: Number(body.estimatedBudget) };
    const hash = crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex');
    const result = await prisma.$transaction(async tx => {
      if (key) {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${req.user!.tenantId}:${req.user!.userId}:${key}`}))`;
        const previous = await tx.serviceRequest.findFirst({ where: { tenantId: req.user!.tenantId, clientId: req.user!.userId, idempotencyKey: key } });
        if (previous) return { previous };
      }
      const created = await tx.serviceRequest.create({ data: { ...fields, tenantId: req.user!.tenantId, clientId: req.user!.userId, status: 'contact_limit_open', idempotencyKey: key || null, payloadHash: key ? hash : null } });
      return { created };
    });
    if ('previous' in result) {
      if (result.previous!.payloadHash !== hash) { res.status(409).json({ error: 'Clave de idempotencia ya utilizada con otro contenido' }); return; }
      res.status(200).json(result.previous); return;
    }
    res.status(201).json(result.created);
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({ error: 'Error al crear la petición' });
  }
});

// 7. Mis Peticiones (Cliente)
app.get('/api/requests/client', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requests = await prisma.serviceRequest.findMany({
      where: { clientId: req.user!.userId, tenantId: req.user!.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
    const purchaseIds = (await prisma.leadPurchase.findMany({ where: { requestId: { in: requests.map(item => item.id) } }, select: { id: true } })).map(item => item.id);
    const active = purchaseIds.length ? await prisma.payment.findMany({ where: { tenantId: req.user!.tenantId, OR: purchaseIds.map(id => ({ metadata: { path: ['leadPurchaseId'], equals: id } })), status: { in: ['created', 'awaiting_transfer', 'pending_provider', 'under_review', 'approved'] } }, select: { metadata: true, status: true, expiresAt: true } }) : [];
    const activeRequestIds = new Set(active.filter(payment => ['under_review', 'approved'].includes(payment.status) || !payment.expiresAt || payment.expiresAt > new Date()).map(payment => (payment.metadata as { requestId?: string }).requestId));
    res.status(200).json(requests.map(request => ({ ...request, maxProfessionalsPerLead: purchaseLimitForRequest(request, settingsOf(tenant.settings)), canEdit: request.visibility === 'marketplace' && isOpenRequest(request.status) && request.purchaseCount === 0 && !activeRequestIds.has(request.id) })));
  } catch (error) {
    console.error('Error getting client requests:', error);
    res.status(500).json({ error: 'Error al obtener peticiones' });
  }
});

/** Public marketplace summary for visitors deciding whether to join as a professional. */
app.get('/api/requests/public', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = await tenantForHost(req.hostname);
    if (!tenantId) { res.status(404).end(); return; }
    const requests = await prisma.serviceRequest.findMany({
      where: {
        tenantId,
        visibility: 'marketplace',
        status: { in: ['contact_limit_open', 'matching'] },
      },
      select: {
        id: true,
        categorySlug: true,
        city: true,
        urgency: true,
        estimatedBudget: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.status(200).json(requests.map(request => ({
      ...request,
      city: publicCity(request.city),
      title: `Servicio de ${request.categorySlug}`,
    })));
  } catch (error) {
    console.error('Error getting public requests:', error);
    res.status(500).json({ error: 'Error al obtener solicitudes públicas' });
  }
});

app.patch('/api/requests/:id', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'client') { res.status(403).json({ error: 'No autorizado' }); return; }
    const allowed = ['title', 'description', 'city', 'location', 'preferredDate', 'urgency', 'estimatedBudget', 'contactName', 'contactEmail', 'contactPhone'];
    const input = req.body || {};
    if (!Object.keys(input).length || Object.keys(input).some(key => !allowed.includes(key))) { res.status(400).json({ error: 'Campos inválidos' }); return; }
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${req.user!.tenantId}:${req.params.id}`}))`;
      const current = await tx.serviceRequest.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId, clientId: req.user!.userId } });
      if (!current) return { status: 404, error: 'Solicitud no encontrada' };
      if (current.visibility !== 'marketplace' || !isOpenRequest(current.status) || current.purchaseCount !== 0) return { status: 409, error: 'Solicitud no editable' };
      const purchases = await tx.leadPurchase.findMany({ where: { requestId: current.id }, select: { id: true } });
      for (const purchase of purchases) {
        const active = await tx.payment.findFirst({ where: { tenantId: current.tenantId, metadata: { path: ['leadPurchaseId'], equals: purchase.id }, OR: [{ status: { in: ['under_review', 'approved'] } }, { status: { in: ['created', 'awaiting_transfer', 'pending_provider'] }, expiresAt: { gt: new Date() } }] } });
        if (active) return { status: 409, error: 'Hay un pago en proceso' };
      }
      if (!validRequestFields({ ...current, ...input })) return { status: 400, error: 'Datos de solicitud inválidos' };
      const data: Record<string, unknown> = {};
      for (const field of Object.keys(input)) data[field] = field === 'estimatedBudget' ? Number(input[field]) : field === 'preferredDate' ? (input[field] ? new Date(input[field]) : null) : typeof input[field] === 'string' ? input[field].trim() : input[field];
      const changed = await tx.serviceRequest.updateMany({ where: { id: current.id, tenantId: current.tenantId, clientId: current.clientId, purchaseCount: 0, status: { in: [...OPEN_REQUEST_STATUSES] } }, data });
      if (!changed.count) return { status: 409, error: 'Solicitud no editable' };
      return { updated: await tx.serviceRequest.findUniqueOrThrow({ where: { id: current.id } }) };
    });
    if ('error' in result) { res.status(result.status || 409).json({ error: result.error }); return; }
    res.status(200).json(result.updated);
  } catch (error) { console.error('Error editing request:', error); res.status(500).json({ error: 'Error al editar solicitud' }); }
});

// 8. Peticiones Disponibles para Profesionales — incluye costUSD calculado
app.get('/api/requests/available', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requestingUser = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      include: { professionalProfile: true },
    });
    if (requestingUser?.role !== 'pro' || !requestingUser.active || !requestingUser.emailVerified || !requestingUser.professionalProfile?.verified) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }
    const realProfId = requestingUser.professionalProfile.id;

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
    const requests = await prisma.serviceRequest.findMany({
      where: {
        tenantId: req.user!.tenantId,
        status: { in: ['contact_limit_open', 'matching'] },
        leadPurchases: {
          none: { professionalId: realProfId, status: 'paid' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const categories = requestingUser.professionalProfile.categories;
    const filtered = requests.filter(r => canProfessionalAccessRequest(r, requestingUser.id, categories, req.user!.tenantId)
      && r.purchaseCount < purchaseLimitForRequest(r, settingsOf(tenant.settings)));

    // Añadir costUSD calculado para que el frontend lo muestre sin lógica de negocio
    const enriched = filtered.map(r => toProfessionalPreview(r,
      leadAmount(r.estimatedBudget, settingsOf(tenant.settings)).toNumber(),
      purchaseLimitForRequest(r, settingsOf(tenant.settings))));

    res.status(200).json(enriched);
  } catch (error) {
    console.error('Error in /api/requests/available:', error);
    res.status(500).json({ error: 'Error al obtener requerimientos disponibles' });
  }
});

// ====================================================================
// RUTAS DE LEADS — PAGO DIRECTO CON PAYPHONE (REDIRECT)
// ====================================================================

/**
 * POST /api/leads/pay
 * Crea la intención de pago en PayPhone y devuelve la URL de redirección.
 * El profesional es redirigido a PayPhone, paga, y PayPhone regresa a la app.
 */
app.post('/api/leads/pay', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { requestId } = req.body;

    const requestingUser = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      include: { professionalProfile: true },
    });

    if (requestingUser?.role !== 'pro' || !requestingUser.active || !requestingUser.emailVerified || !requestingUser.professionalProfile?.verified) {
      res.status(403).json({ error: 'Sólo perfiles profesionales pueden comprar contactos.' });
      return;
    }

    const adminMembership = await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: req.user!.tenantId, userId: requestingUser.id } }, select: { status: true } });
    if (adminMembership?.status === 'active') { res.status(403).json({ error: 'Las cuentas administrativas no realizan pagos.' }); return; }

    const realProfId = requestingUser.professionalProfile.id;

    const request = await prisma.serviceRequest.findFirst({ where: { id: requestId, tenantId: req.user!.tenantId } });
    if (!request) {
      res.status(404).json({ error: 'Solicitud no encontrada.' });
      return;
    }
    if (!canProfessionalAccessRequest(request, requestingUser.id, requestingUser.professionalProfile.categories, req.user!.tenantId)) {
      res.status(403).json({ error: 'Selecciona este servicio en tu perfil antes de comprar el contacto.' });
      return;
    }
    if (!isPurchasableRequest(request.status)) {
      res.status(409).json({ error: 'Esta solicitud ya no está disponible para comprar contactos.' });
      return;
    }
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.user!.tenantId } });
    const tenantSettings = settingsOf(tenant.settings);
    if (request.purchaseCount >= purchaseLimitForRequest(request, tenantSettings)) {
      res.status(400).json({ error: 'Límite de profesionales alcanzado.' });
      return;
    }

    const initiated = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${req.user!.tenantId}:${requestId}`}))`;
      const currentRequest = await tx.serviceRequest.findFirst({ where: { id: requestId, tenantId: req.user!.tenantId } });
      if (!currentRequest || !isPurchasableRequest(currentRequest.status)) return { error: 'Solicitud no disponible', statusCode: 409 };
      if (!canProfessionalAccessRequest(currentRequest, requestingUser.id, requestingUser.professionalProfile!.categories, req.user!.tenantId)) return { error: 'Solicitud no disponible', statusCode: 403 };
      if (currentRequest.purchaseCount >= purchaseLimitForRequest(currentRequest, tenantSettings)) return { error: 'Cupo de profesionales agotado', statusCode: 409 };
      const existing = await tx.leadPurchase.findUnique({ where: { requestId_professionalId: { requestId, professionalId: realProfId } } });
      if (existing?.status === 'paid') return { error: 'Ya has comprado este contacto', statusCode: 409 };
      if (existing) {
        const active = await tx.payment.findFirst({ where: { tenantId: req.user!.tenantId, metadata: { path: ['leadPurchaseId'], equals: existing.id }, OR: [{ status: { in: ['under_review', 'approved'] } }, { status: { in: ['created', 'awaiting_transfer', 'pending_provider'] }, expiresAt: { gt: new Date() } }] } });
        if (active) return { error: 'Ya hay un pago en proceso para este contacto', statusCode: 409 };
      }
      const amount = leadAmount(currentRequest.estimatedBudget, tenantSettings);
      const clientTxId = `A${crypto.randomBytes(7).toString('hex')}`;
      const purchase = existing
        ? await tx.leadPurchase.update({ where: { id: existing.id }, data: { costUSD: amount.toNumber(), payphoneClientTxId: clientTxId, status: 'pending' } })
        : await tx.leadPurchase.create({ data: { requestId, tenantId: req.user!.tenantId, professionalId: realProfId, costUSD: amount.toNumber(), status: 'pending', payphoneClientTxId: clientTxId } });
      const payment = await tx.payment.create({ data: {
        tenantId: req.user!.tenantId, payerUserId: req.user!.userId, amount,
        currency: 'USD', method: 'payphone', status: 'created', reference: clientTxId,
        provider: 'payphone', metadata: { leadPurchaseId: purchase.id, requestId },
        expiresAt: new Date(Date.now() + 72 * 3600000),
      } });
      return { payment, clientTxId };
    });
    if ('error' in initiated) { res.status(initiated.statusCode!).json({ error: initiated.error }); return; }
    const { payment, clientTxId } = initiated;
    const costUSD = payment.amount.toNumber();

    // ------------------------------------------------------------------
    // Llamada a la API de PayPhone para crear el link de pago
    // Documentación oficial PayPhone Button 2.0:
    //   POST https://pay.payphonetodoesposible.com/api/button/Prepare
    // ------------------------------------------------------------------
    const returnBase = await publicBaseUrl(prisma, req.user!.tenantId, req.hostname);
    const provider = new PayPhoneProvider(PAYPHONE_TOKEN, PAYPHONE_STORE_ID, PAYPHONE_BASE_URL, returnBase);
    try {
      const intent = await provider.createIntent({
        reference: clientTxId, amount: payment.amount.toFixed(2), currency: 'USD', requestId,
        responseUrl: `${returnBase}/dashboard/payment-success`,
        cancellationUrl: `${returnBase}/dashboard/payment-failed`,
      });
      await prisma.$transaction(async tx => {
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'pending_provider' } });
        await tx.paymentEvent.create({ data: { tenantId: req.user!.tenantId, paymentId: payment.id, type: 'created', source: 'payphone', idempotencyKey: `created:${payment.id}`, payload: {} } });
      });
      res.status(200).json({ redirectUrl: intent.checkoutUrl, costUSD, clientTxId });
    } catch (error) {
      await prisma.$transaction(async tx => {
        const changed = await tx.payment.updateMany({ where: { id: payment.id, status: 'created' }, data: { status: 'failed' } });
        if (changed.count) await tx.paymentEvent.create({ data: { tenantId: req.user!.tenantId, paymentId: payment.id, type: 'failed', source: 'payphone', idempotencyKey: `intent-failed:${payment.id}`, payload: {} } });
      });
      throw error;
    }
  } catch (error) {
    console.error('Error in /api/leads/pay:', error);
    res.status(500).json({ error: 'Error del servidor al iniciar el pago.' });
  }
});

/**
 * POST /api/leads/pay/confirm
 * Callback de confirmación. El frontend llama este endpoint cuando PayPhone retorna exitosamente.
 * Verifica el pago con la API de PayPhone y marca el lead como 'paid'.
 */
app.post('/api/leads/pay/confirm', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { clientTxId, payphoneTransactionId } = req.body;

    if (!clientTxId) {
      res.status(400).json({ error: 'clientTxId es requerido.' });
      return;
    }

    const payment = await prisma.payment.findFirst({ where: { tenantId: req.user!.tenantId, payerUserId: req.user!.userId, reference: clientTxId, method: 'payphone' } });
    if (!payment) { res.status(404).json({ error: 'Pago no encontrado' }); return; }
    const purchaseId = (payment.metadata as { leadPurchaseId?: string }).leadPurchaseId;
    const purchase = await prisma.leadPurchase.findFirst({
      where: { tenantId: req.user!.tenantId, professional: { userId: req.user!.userId }, ...(purchaseId ? { id: purchaseId } : { payphoneClientTxId: clientTxId }) },
      include: { request: true },
    });
    if (!purchase) { res.status(404).json({ error: 'Intención de pago no encontrada.' }); return; }

    if (payment.status === 'allocated' && purchase.status === 'paid') {
      // Ya confirmado anteriormente — devolver los datos del contacto directamente
      const request = purchase.request;
      res.status(200).json({
        success: true,
        alreadyPaid: true,
        contactPhone: request.contactPhone,
        contactEmail: request.contactEmail,
      });
      return;
    }

    // ------------------------------------------------------------------
    // Verificar el pago con PayPhone
    // POST https://pay.payphonetodoesposible.com/api/button/V2/Confirm
    // ------------------------------------------------------------------
    let paymentStatus: 'approved' | 'failed' | 'pending' = 'pending';
    let realTxId = '';
    let verifiedAmountCents: number | undefined;
    let verifiedCurrency: string | undefined;
    if (process.env.NODE_ENV !== 'production' && process.env.PAYPHONE_MOCK === 'true' && (!PAYPHONE_TOKEN || PAYPHONE_TOKEN === 'TU_PAYPHONE_TOKEN_AQUI' || !PAYPHONE_STORE_ID) && payphoneTransactionId === 'MOCK_TX_ID') {
      paymentStatus = 'approved';
      realTxId = 'MOCK_TX_ID';
      verifiedAmountCents = payment.amount.mul(100).toNumber();
      verifiedCurrency = 'USD';
    } else {
      if (clientTxId.length <= 16 && !/^[1-9]\d{0,15}$/.test(String(payphoneTransactionId || ''))) { res.status(400).json({ error: 'ID de transacción PayPhone inválido' }); return; }
      const provider = new PayPhoneProvider(PAYPHONE_TOKEN, PAYPHONE_STORE_ID, PAYPHONE_BASE_URL, APP_BASE_URL);
      const verified = await provider.getPayment(clientTxId, payphoneTransactionId);
      paymentStatus = verified.status;
      realTxId = verified.providerPaymentId || '';
      verifiedAmountCents = verified.amountCents;
      verifiedCurrency = verified.currency;
    }
    if (paymentStatus === 'pending') { res.status(202).json({ error: 'Pago pendiente de confirmación del proveedor' }); return; }
    if (paymentStatus !== 'approved') {
      await prisma.$transaction(async tx => {
        const changed = await tx.payment.updateMany({ where: { id: payment.id, status: 'pending_provider' }, data: { status: 'failed' } });
        if (changed.count) await tx.paymentEvent.create({ data: { tenantId: req.user!.tenantId, paymentId: payment.id, type: 'failed', source: 'payphone', idempotencyKey: `failed:${payment.id}`, payload: {} } });
      });
      res.status(402).json({ error: 'El pago no fue aprobado por PayPhone.' });
      return;
    }
    if (!realTxId || verifiedAmountCents !== payment.amount.mul(100).toNumber() || verifiedCurrency !== payment.currency) {
      res.status(409).json({ error: 'Monto, moneda o identificador PayPhone no coinciden' });
      return;
    }
    await prisma.$transaction(async tx => {
      const changed = await tx.payment.updateMany({ where: { id: payment.id, status: { in: ['created', 'pending_provider', 'expired', 'failed'] } }, data: { status: 'approved', providerPaymentId: realTxId } });
      if (changed.count) await tx.paymentEvent.create({ data: { tenantId: req.user!.tenantId, paymentId: payment.id, type: 'provider_approved', source: 'payphone', idempotencyKey: `payphone-approved:${payment.id}`, payload: { amountCents: verifiedAmountCents, currency: verifiedCurrency, providerPaymentId: realTxId } } });
    });
    try {
      await allocateLead(prisma, payment.id, req.user!.tenantId, 'payphone');
    } catch (error) {
      if (error instanceof PaymentConflict || (error as { code?: string }).code === 'P2034') {
        const latest = await prisma.payment.findUnique({ where: { id: payment.id } });
        if (latest?.status === 'allocated') { res.status(200).json({ success: true, alreadyPaid: true, contactPhone: purchase.request.contactPhone, contactEmail: purchase.request.contactEmail, costUSD: purchase.costUSD }); return; }
        if (latest?.status === 'approved') await prisma.paymentEvent.create({ data: { tenantId: req.user!.tenantId, paymentId: payment.id, type: 'manual_resolution_required', source: 'payphone', idempotencyKey: `manual:${payment.id}`, payload: { reason: error instanceof Error ? error.message : 'Conflicto de asignación' } } }).catch(dbError => { if ((dbError as { code?: string }).code !== 'P2002') throw dbError; });
        res.status(409).json({ error: error instanceof Error ? error.message : 'Conflicto de cupo' });
        return;
      }
      throw error;
    }
    res.status(200).json({
      success: true,
      contactPhone: purchase.request.contactPhone,
      contactEmail: purchase.request.contactEmail,
      costUSD: purchase.costUSD,
    });
  } catch (error) {
    console.error('Error in /api/leads/pay/confirm:', error);
    res.status(500).json({ error: 'Error del servidor al confirmar el pago.' });
  }
});

/**
 * GET /api/leads/unlocked
 * Lista los contactos adquiridos (pagados) por el profesional autenticado.
 */
app.get('/api/leads/unlocked', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requestingUser = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      include: { professionalProfile: true },
    });
    if (requestingUser?.role !== 'pro' || !requestingUser.professionalProfile) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }

    const realProfId = requestingUser.professionalProfile.id;

    const purchases = await prisma.leadPurchase.findMany({
      where: { professionalId: realProfId, tenantId: req.user!.tenantId, status: 'paid' },
      orderBy: { paidAt: 'desc' },
      include: {
        request: { include: { client: true } },
      },
    });

    const formatted = purchases.map((p) => ({
      purchase: {
        id: p.id,
        requestId: p.requestId,
        costUSD: p.costUSD,
        status: p.status,
        purchasedAt: p.paidAt || p.purchasedAt,
        payphoneTransactionId: p.payphoneTransactionId,
      },
      requestTitle: p.request.title,
      clientName: p.request.contactName || p.request.client.fullName,
      clientPhone: p.request.contactPhone,
      clientEmail: p.request.contactEmail,
      location: p.request.location,
      estimatedBudget: p.request.estimatedBudget,
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Error in /api/leads/unlocked:', error);
    res.status(500).json({ error: 'Error al obtener leads desbloqueados' });
  }
});

/**
 * GET /api/payments/history
 * Historial de todos los pagos realizados por el profesional (para la sección de Facturación).
 */
app.get('/api/payments/history', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requestingUser = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      include: { professionalProfile: true },
    });
    if (requestingUser?.role !== 'pro' || !requestingUser.professionalProfile) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }
    const adminMembership = await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: req.user!.tenantId, userId: requestingUser.id } }, select: { status: true } });
    if (adminMembership?.status === 'active') { res.status(403).json({ error: 'Las cuentas administrativas no tienen historial de compras' }); return; }

    const payments = await prisma.payment.findMany({
      where: { payerUserId: req.user!.userId, tenantId: req.user!.tenantId, status: 'allocated' },
      orderBy: { confirmedAt: 'desc' },
      include: { allocations: { include: { leadPurchase: { include: { request: true } } } } },
    });

    const history = payments.flatMap((p) => p.allocations.map(a => ({
      id: p.id,
      date: p.confirmedAt || p.createdAt,
      description: `Contacto: ${a.leadPurchase.request.title}`,
      location: a.leadPurchase.request.location,
      costUSD: p.amount.toNumber(),
      payphoneTransactionId: p.providerPaymentId || undefined,
      requestId: a.leadPurchase.requestId,
    })));

    res.status(200).json(history);
  } catch (error) {
    console.error('Error in /api/payments/history:', error);
    res.status(500).json({ error: 'Error al obtener el historial de pagos' });
  }
});

// ====================================================================
// RUTAS DE COTIZACIONES (QUOTES)
// ====================================================================

/**
 * POST /api/quotes
 * Crear/Enviar una cotización. El profesional debe haber pagado por el lead.
 */
app.post('/api/quotes', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { requestId, message, estimatedPrice, estimatedDays } = req.body;
    if (typeof requestId !== 'string' || typeof message !== 'string' || !message.trim() || message.length > 5000
      || !Number.isFinite(Number(estimatedPrice)) || Number(estimatedPrice) <= 0 || Number(estimatedPrice) > 1_000_000
      || (estimatedDays != null && (!Number.isInteger(Number(estimatedDays)) || Number(estimatedDays) <= 0 || Number(estimatedDays) > 3650))) {
      res.status(400).json({ error: 'Cotización inválida' }); return;
    }
    
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { professionalProfile: true },
    });
    if (user?.role !== 'pro' || !user.professionalProfile) {
      res.status(403).json({ error: 'Solo profesionales pueden enviar cotizaciones.' });
      return;
    }
    const realProfId = user.professionalProfile.id;

    // Verificar si ya compró este lead y está pagado
    const purchase = await prisma.leadPurchase.findUnique({
      where: { requestId_professionalId: { requestId, professionalId: realProfId } },
    });
    if (!purchase || purchase.status !== 'paid' || purchase.tenantId !== req.user!.tenantId) {
      res.status(403).json({ error: 'Debes desbloquear el contacto primero.' });
      return;
    }

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${req.user!.tenantId}:${requestId}`}))`;
      const request = await tx.serviceRequest.findFirst({ where: { id: requestId, tenantId: req.user!.tenantId } });
      if (!request || !isOpenRequest(request.status)) return { error: 'Solicitud cerrada' };
      const existingQuote = await tx.quote.findUnique({ where: { requestId_professionalId: { requestId, professionalId: realProfId } } });
      if (existingQuote && existingQuote.status !== 'sent') return { error: 'Cotización cerrada' };
      const quote = await tx.quote.upsert({
        where: { requestId_professionalId: { requestId, professionalId: realProfId } },
        update: { message, estimatedPrice: Number(estimatedPrice), estimatedDays: estimatedDays == null ? null : Number(estimatedDays) },
        create: { tenantId: req.user!.tenantId, requestId, professionalId: realProfId, message, estimatedPrice: Number(estimatedPrice), estimatedDays: estimatedDays == null ? null : Number(estimatedDays) },
      });
      return { quote };
    });
    if ('error' in result) { res.status(409).json({ error: result.error }); return; }
    res.status(200).json(result.quote);
  } catch (error) {
    console.error('Error in POST /api/quotes:', error);
    res.status(500).json({ error: 'Error al enviar cotización.' });
  }
});

/**
 * GET /api/quotes/request/:id
 * Listar cotizaciones recibidas para una solicitud del cliente.
 */
app.get('/api/quotes/request/:id', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Verificar que la solicitud pertenezca al cliente actual
    const request = await prisma.serviceRequest.findUnique({ where: { id } });
    if (!request || request.clientId !== req.user!.userId || request.tenantId !== req.user!.tenantId) {
      res.status(403).json({ error: 'No tienes acceso a esta solicitud.' });
      return;
    }

    const quotes = await prisma.quote.findMany({
      where: { requestId: id, tenantId: req.user!.tenantId },
      include: {
        professional: {
          include: { user: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const formatted = quotes.map(q => ({
      quote: {
        id: q.id,
        requestId: q.requestId,
        professionalId: q.professionalId,
        message: q.message,
        estimatedPrice: q.estimatedPrice,
        estimatedDays: q.estimatedDays,
        status: q.status,
        createdAt: q.createdAt,
      },
      professionalName: q.professional.user.fullName,
      professionalRating: q.professional.rating,
      professionalReviewCount: q.professional.reviewCount,
      professionalAvatar: q.professional.user.avatarUrl,
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Error in GET /api/quotes/request:', error);
    res.status(500).json({ error: 'Error al obtener cotizaciones.' });
  }
});

/**
 * GET /api/quotes/me
 * Listar todas las cotizaciones enviadas por el profesional autenticado.
 */
app.get('/api/quotes/me', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { professionalProfile: true },
    });
    if (user?.role !== 'pro' || !user.professionalProfile) {
      res.status(403).json({ error: 'Solo profesionales pueden acceder a sus cotizaciones.' });
      return;
    }

    const quotes = await prisma.quote.findMany({
      where: { professionalId: user.professionalProfile.id, tenantId: req.user!.tenantId },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(quotes);
  } catch (error) {
    console.error('Error in GET /api/quotes/me:', error);
    res.status(500).json({ error: 'Error al obtener cotizaciones enviadas.' });
  }
});

/**
 * POST /api/quotes/:id/accept
 * El cliente acepta una cotización.
 */
app.post('/api/quotes/:id/accept', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { request: true }
    });

    if (!quote || quote.request.clientId !== req.user!.userId || quote.tenantId !== req.user!.tenantId) {
      res.status(403).json({ error: 'No tienes permisos.' });
      return;
    }

    const accepted = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${req.user!.tenantId}:${quote.requestId}`}))`;
      const changed = await tx.serviceRequest.updateMany({ where: { id: quote.requestId, tenantId: req.user!.tenantId, status: { in: ['contact_limit_open', 'contact_limit_reached', 'quotes_received'] } }, data: { status: 'hired' } });
      if (!changed.count) return false;
      // Marcar la aceptada
      const quoteChanged = await tx.quote.updateMany({
        where: { id, status: 'sent' },
        data: { status: 'accepted' }
      });
      if (!quoteChanged.count) throw new PaymentConflict('Cotización no disponible');

      // Rechazar las demás
      await tx.quote.updateMany({
        where: { requestId: quote.requestId, id: { not: id } },
        data: { status: 'rejected' }
      });

      return true;
    });
    if (!accepted) { res.status(409).json({ error: 'Solicitud no disponible' }); return; }
    res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof PaymentConflict) { res.status(409).json({ error: error.message }); return; }
    console.error('Error in POST /api/quotes/accept:', error);
    res.status(500).json({ error: 'Error al aceptar cotización.' });
  }
});

// ====================================================================
// RUTAS DE PETICIONES (CANCELAR Y COMPLETAR)
// ====================================================================

app.post('/api/requests/:id/cancel', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const request = await prisma.serviceRequest.findUnique({ where: { id } });
    
    if (!request || request.clientId !== req.user!.userId || request.tenantId !== req.user!.tenantId) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }

    const updated = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`${req.user!.tenantId}:${id}`}))`;
      const changed = await tx.serviceRequest.updateMany({ where: { id, tenantId: req.user!.tenantId, clientId: req.user!.userId, status: { in: [...OPEN_REQUEST_STATUSES] } }, data: { status: 'cancelled' } });
      return changed.count ? tx.serviceRequest.findUniqueOrThrow({ where: { id } }) : null;
    });
    if (!updated) { res.status(409).json({ error: 'Solicitud no cancelable' }); return; }
    
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error canceling request', error);
    res.status(500).json({ error: 'Error al cancelar' });
  }
});

app.post('/api/requests/:id/complete', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const request = await prisma.serviceRequest.findUnique({ where: { id } });
    
    if (!request || request.clientId !== req.user!.userId || request.tenantId !== req.user!.tenantId) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }

    const changed = await prisma.serviceRequest.updateMany({ where: { id, tenantId: req.user!.tenantId, clientId: req.user!.userId, status: 'hired' }, data: { status: 'completed' } });
    if (!changed.count) { res.status(409).json({ error: 'Solicitud no contratada' }); return; }
    const updated = await prisma.serviceRequest.findUniqueOrThrow({ where: { id } });
    
    res.status(200).json(updated);
  } catch (error) {
    console.error('Error completing request', error);
    res.status(500).json({ error: 'Error al completar' });
  }
});

// ====================================================================
// RUTAS DE PERFIL PROFESIONAL
// ====================================================================

/**
 * GET /api/profile
 * Devuelve el perfil completo del profesional autenticado
 * (datos de User + ProfessionalProfile).
 */
app.get('/api/profile', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { professionalProfile: true },
    });

    if (!user || user.role !== 'pro') {
      res.status(403).json({ error: 'Solo perfiles profesionales pueden acceder a esta ruta.' });
      return;
    }

    const { password: _, verificationToken: __, mfaSecret: _mfaSecret, mfaPendingSecret: _mfaPending, mfaRecoveryHashes: _mfaRecovery, mfaLastCounter: _mfaCounter, ...safeUser } = user;

    res.status(200).json({
      user: safeUser,
      profile: user.professionalProfile,
    });
  } catch (error) {
    console.error('Error in GET /api/profile:', error);
    res.status(500).json({ error: 'Error al obtener el perfil.' });
  }
});

/**
 * PUT /api/profile
 * Actualiza el perfil del profesional autenticado.
 * Acepta:
 *   - fullName, phone (en User)
 *   - businessName, bio, categories, serviceZones, experienceYears,
 *     portfolioImages, avatarUrl (en ProfessionalProfile / User)
 */
app.put('/api/profile', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      fullName,
      phone,
      avatarUrl,
      businessName,
      bio,
      categories,
      serviceZones,
      experienceYears,
      portfolioImages,
      skills,
      city,
      address,
      documentType,
      documentId,
    } = req.body;

    const userId = req.user!.userId;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { professionalProfile: true },
    });

    if (!existingUser || existingUser.role !== 'pro') {
      res.status(403).json({ error: 'Solo profesionales pueden actualizar este perfil.' });
      return;
    }

    const validCategories = categories === undefined || (Array.isArray(categories) && categories.length > 0 && categories.length <= 20 && categories.every((value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 100));
    if (!validCategories) {
      res.status(400).json({ error: 'Selecciona al menos un servicio válido.' });
      return;
    }
    const selectedCategories = categories === undefined ? undefined : canonicalServiceCategories(categories as string[]);

    // Actualizar datos básicos del User
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(phone !== undefined && { phone }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
    });

    // Actualizar ProfessionalProfile
    let updatedProfile = existingUser.professionalProfile;
    if (updatedProfile) {
      updatedProfile = await prisma.professionalProfile.update({
        where: { userId },
        data: {
          ...(businessName !== undefined && { businessName }),
          ...(bio !== undefined && { bio }),
          ...(selectedCategories !== undefined && { categories: selectedCategories }),
          ...(serviceZones !== undefined && { serviceZones }),
          ...(experienceYears !== undefined && { experienceYears: parseInt(experienceYears) }),
          ...(portfolioImages !== undefined && { portfolioImages }),
          ...(skills !== undefined && { skills }),
          ...(city !== undefined && { city }),
          ...(address !== undefined && { address }),
          ...(documentType !== undefined && { documentType }),
          ...(documentId !== undefined && { documentId }),
        },
      });
    }

    const { password: _, verificationToken: __, mfaSecret: _mfaSecret, mfaPendingSecret: _mfaPending, mfaRecoveryHashes: _mfaRecovery, mfaLastCounter: _mfaCounter, ...safeUser } = updatedUser;

    res.status(200).json({
      success: true,
      user: safeUser,
      profile: updatedProfile,
    });
  } catch (error) {
    console.error('Error in PUT /api/profile:', error);
    res.status(500).json({ error: 'Error al guardar el perfil.' });
  }
});

// ====================================================================
// RUTAS DE PERFIL CLIENTE
// ====================================================================

/**
 * GET /api/client/profile
 * Devuelve el perfil completo del cliente autenticado.
 */
app.get('/api/client/profile', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { clientProfile: true },
    });

    if (!user || user.role !== 'client') {
      res.status(403).json({ error: 'Solo perfiles de clientes pueden acceder a esta ruta.' });
      return;
    }

    const { password: _, verificationToken: __, mfaSecret: _mfaSecret, mfaPendingSecret: _mfaPending, mfaRecoveryHashes: _mfaRecovery, mfaLastCounter: _mfaCounter, ...safeUser } = user;

    res.status(200).json({
      user: safeUser,
      profile: user.clientProfile,
    });
  } catch (error) {
    console.error('Error in GET /api/client/profile:', error);
    res.status(500).json({ error: 'Error al obtener el perfil.' });
  }
});

/**
 * PUT /api/client/profile
 * Actualiza el perfil del cliente autenticado.
 */
app.put('/api/client/profile', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      fullName,
      phone,
      avatarUrl,
      addresses,
    } = req.body;

    const userId = req.user!.userId;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { clientProfile: true },
    });

    if (!existingUser || existingUser.role !== 'client') {
      res.status(403).json({ error: 'Solo clientes pueden actualizar este perfil.' });
      return;
    }
    if ((fullName !== undefined && !validClientName(fullName)) || (phone !== undefined && !validClientPhone(phone))) {
      res.status(400).json({ error: 'Indica tu nombre completo y un teléfono válido.' }); return;
    }

    // Actualizar datos básicos del User
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(phone !== undefined && { phone }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
    });

    // Actualizar ClientProfile
    let updatedProfile = existingUser.clientProfile;
    if (updatedProfile && addresses !== undefined) {
      updatedProfile = await prisma.clientProfile.update({
        where: { userId },
        data: {
          addresses, // Pasmos todo el array de strings serializados
        },
      });
    }

    const { password: _, verificationToken: __, mfaSecret: _mfaSecret, mfaPendingSecret: _mfaPending, mfaRecoveryHashes: _mfaRecovery, mfaLastCounter: _mfaCounter, ...safeUser } = updatedUser;

    res.status(200).json({
      success: true,
      user: safeUser,
      profile: updatedProfile,
    });
  } catch (error) {
    console.error('Error in PUT /api/client/profile:', error);
    res.status(500).json({ error: 'Error al guardar el perfil.' });
  }
});

/** Closes a client account and removes its personal profile and request contact data. */
app.delete('/api/client/account', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const password = req.body?.password;
    if (typeof password !== 'string' || !password || password.length > 128 || req.body?.confirmation !== 'ELIMINAR') {
      res.status(400).json({ error: 'Escribe ELIMINAR y tu contrasena actual para confirmar.' }); return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || user.role !== 'client' || user.tenantId !== req.user!.tenantId) {
      res.status(403).json({ error: 'Solo clientes pueden eliminar su cuenta desde esta ruta.' }); return;
    }
    if (!user.password || user.authProvider !== 'local') {
      res.status(409).json({ error: 'Esta cuenta no tiene una contrasena local. Contacta a soporte para eliminarla.' }); return;
    }
    const limit = await consumeAuthAttempt(prisma, JWT_SECRET, ['delete-account', user.id, req.ip || 'unknown'], 5, 15 * 60000);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds)).status(429).json({ error: 'Demasiados intentos. Intenta de nuevo mas tarde.' }); return;
    }
    if (!await bcrypt.compare(password, user.password)) {
      res.status(401).json({ error: 'La contrasena actual no es correcta.' }); return;
    }

    await prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({
        where: { id: user.id, tenantId: user.tenantId, role: 'client', active: true },
        data: {
          active: false, sessionVersion: { increment: 1 }, emailVerified: false,
          email: `deleted-${user.id}@invalid.local`, fullName: 'Cuenta eliminada', phone: null,
          password: null, avatarUrl: null, verificationToken: null,
          mfaSecret: null, mfaPendingSecret: null, mfaRecoveryHashes: [], mfaLastCounter: -1,
          mfaFailureCount: 0, mfaLockedUntil: null,
        },
      });
      if (!changed.count) throw new Error('ACCOUNT_ALREADY_CLOSED');
      await tx.clientProfile.deleteMany({ where: { userId: user.id, tenantId: user.tenantId } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await tx.review.deleteMany({ where: { clientId: user.id, tenantId: user.tenantId } });
      await tx.serviceRequest.updateMany({
        where: { clientId: user.id, tenantId: user.tenantId },
        data: {
          status: 'cancelled', title: 'Solicitud de cuenta eliminada', description: '',
          location: '', city: null, contactName: null, contactPhone: '', contactEmail: '',
          preferredDate: null, idempotencyKey: null, payloadHash: null,
        },
      });
    });
    res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'ACCOUNT_ALREADY_CLOSED') {
      res.status(409).json({ error: 'La cuenta ya fue eliminada.' }); return;
    }
    console.error('Error in DELETE /api/client/account:', error);
    res.status(500).json({ error: 'No se pudo eliminar la cuenta.' });
  }
});

/**
 * POST /api/profile/change-password
 * Cambia la contraseña del usuario autenticado.
 */
app.post('/api/profile/change-password', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Contraseña actual y nueva son requeridas.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || !user.password) {
      res.status(400).json({ error: 'Esta cuenta usa autenticación social y no tiene contraseña.' });
      return;
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      res.status(401).json({ error: 'La contraseña actual no es correcta.' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, sessionVersion: { increment: 1 } } });

    res.status(200).json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error('Error in POST /api/profile/change-password:', error);
    res.status(500).json({ error: 'Error al cambiar la contraseña.' });
  }
});

// ====================================================================
// RUTAS DE BÚSQUEDA DE PROFESIONALES
// ====================================================================

/**
 * GET /api/professionals
 * Devuelve la lista de profesionales públicos.
 */
app.get('/api/professionals', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = await tenantForHost(req.hostname);
    if (!tenantId) { res.status(404).end(); return; }
    const pros = await prisma.user.findMany({
      where: { role: 'pro', tenantId, active: true, professionalProfile: { tenantId, verified: true, categories: { isEmpty: false } } },
      select: { id: true, fullName: true, avatarUrl: true, createdAt: true, professionalProfile: { select: {
        id: true, businessName: true, bio: true, categories: true, serviceZones: true,
        experienceYears: true, portfolioImages: true, skills: true, city: true,
        rating: true, reviewCount: true, verified: true, completedJobs: true,
      } } },
    });
    const mappedPros = pros.map(({ professionalProfile, ...user }) => ({ ...user, profile: professionalProfile }));

    res.status(200).json(mappedPros);
  } catch (error) {
    console.error('Error in GET /api/professionals:', error);
    res.status(500).json({ error: 'Error al cargar profesionales' });
  }
});

/**
 * GET /api/professionals/:id
 * Devuelve un profesional público por su userId.
 */
app.get('/api/professionals/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tenantId = await tenantForHost(req.hostname);
    if (!tenantId) { res.status(404).end(); return; }
    const user = await prisma.user.findFirst({
      where: { id: id, role: 'pro', tenantId, active: true, professionalProfile: { tenantId, verified: true, categories: { isEmpty: false } } },
      select: {
        id: true, fullName: true, avatarUrl: true, createdAt: true,
        professionalProfile: { select: {
          id: true, businessName: true, bio: true, categories: true, serviceZones: true,
          experienceYears: true, portfolioImages: true, skills: true, city: true,
          rating: true, reviewCount: true, verified: true, completedJobs: true,
        } },
        reviewsReceived: {
          where: { tenantId },
          select: { id: true, rating: true, comment: true, createdAt: true,
            client: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                createdAt: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      },
    });

    if (!user || !user.professionalProfile) {
      res.status(404).json({ error: 'Profesional no encontrado' });
      return;
    }

    const { professionalProfile, reviewsReceived, ...publicUser } = user;
    res.status(200).json({ ...publicUser, profile: professionalProfile, reviews: reviewsReceived });
  } catch (error) {
    console.error('Error in GET /api/professionals/:id:', error);
    res.status(500).json({ error: 'Error al cargar profesional' });
  }
});

/**
 * POST /api/professionals/:id/reviews
 * Permite a un cliente verificado dejar una reseña a un profesional.
 */
app.post('/api/professionals/:id/reviews', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: professionalId } = req.params;
    const { rating, comment } = req.body;
    const clientId = req.user!.userId;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof comment !== 'string' || !comment.trim() || comment.length > 2000) {
      res.status(400).json({ error: 'Calificación o comentario inválidos.' });
      return;
    }

    // 1. Verificar que el cliente esté verificado
    const client = await prisma.user.findUnique({ where: { id: clientId } });
    if (!client || client.role !== 'client' || client.tenantId !== req.user!.tenantId) {
      res.status(403).json({ error: 'Solo un cliente activo puede dejar reseñas.' });
      return;
    }

    // 2. Verificar que el profesional existe
    const pro = await prisma.user.findFirst({
      where: { id: professionalId, role: 'pro', tenantId: req.user!.tenantId, active: true },
      include: { professionalProfile: true }
    });

    if (!pro || !pro.professionalProfile?.verified || pro.professionalProfile.tenantId !== req.user!.tenantId) {
      res.status(404).json({ error: 'Profesional no encontrado.' });
      return;
    }

    // 3. Crear la reseña
    const newReview = await prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          rating,
          comment: comment.trim(),
          clientId,
          professionalId,
          tenantId: req.user!.tenantId
        },
        include: {
          client: {
            select: {
              fullName: true,
              avatarUrl: true
            }
          }
        }
      });

      // 4. Actualizar agregados en el perfil del profesional
      const allReviews = await tx.review.findMany({
        where: { professionalId, tenantId: req.user!.tenantId }
      });

      const count = allReviews.length;
      const avg = allReviews.reduce((acc, curr) => acc + curr.rating, 0) / count;

      await tx.professionalProfile.update({
        where: { userId: professionalId },
        data: {
          rating: avg,
          reviewCount: count
        }
      });

      return review;
    });

    res.status(201).json(newReview);
  } catch (error) {
    console.error('Error in POST /api/professionals/:id/reviews:', error);
    res.status(500).json({ error: 'Error al publicar la reseña.' });
  }
});

// ====================================================================
// RUTAS DE PREFERENCIAS DE NOTIFICACIONES
// ====================================================================

/**
 * POST /api/notifications/preferences
 * Recibe la preferencia de notificación y envía un correo de confirmación.
 * Body: { preference: string, enabled: boolean, label: string }
 */
app.post('/api/notifications/preferences', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { preference, enabled, label } = req.body;

    if (!['emailQuotes', 'emailMessages', 'emailPromos', 'notif-new-jobs', 'notif-client-msgs', 'notif-newsletter'].includes(preference) || typeof enabled !== 'boolean' || typeof label !== 'string' || label.length > 100) {
      res.status(400).json({ error: 'Datos de preferencia inválidos.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    // Solo enviar correo cuando se ACTIVA la notificación
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const limit = await consumeAuthAttempt(prisma, JWT_SECRET, ['notification-email', req.user!.tenantId, req.user!.userId, ip], 10, 3600000);
    if (!limit.allowed) { res.setHeader('Retry-After', String(limit.retryAfterSeconds)).status(429).json({ error: 'Demasiadas solicitudes' }); return; }
    const safeLabel = escapeHtml(label);
    const safeName = escapeHtml(user.fullName);
    if (enabled) {
      const statusText = 'activada';
      const statusColor = '#16a34a';
      const statusIcon = '✅';

      try {
        await transporter.sendMail({
          from: `"ArtoCamello Notificaciones" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: `Notificación ${statusText}: ${label}`,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
              <!-- Header -->
              <div style="background: #101828; padding: 30px 40px; text-align: center;">
                <h1 style="color: #FFCA0C; font-size: 24px; margin: 0; font-weight: 800; letter-spacing: -0.5px;">
                  Arto<span style="color: #ffffff;">Camello</span>
                </h1>
                <p style="color: #9ca3af; font-size: 13px; margin-top: 6px;">Preferencias de notificación</p>
              </div>

              <!-- Body -->
              <div style="padding: 40px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <span style="font-size: 48px;">${statusIcon}</span>
                </div>

                <h2 style="color: #101828; font-size: 20px; text-align: center; margin-bottom: 8px;">
                  Notificación ${statusText}
                </h2>
                <p style="color: #6b7280; font-size: 15px; text-align: center; margin-bottom: 30px;">
                  Hola <strong>${safeName}</strong>, te confirmamos que tu preferencia ha sido actualizada.
                </p>

                <!-- Preference Card -->
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 30px;">
                  <table style="width: 100%;">
                    <tr>
                      <td style="padding: 8px 0;">
                        <span style="color: #6b7280; font-size: 13px;">Preferencia</span><br/>
                        <strong style="color: #101828; font-size: 15px;">${safeLabel}</strong>
                      </td>
                      <td style="text-align: right; vertical-align: middle;">
                        <span style="background: ${statusColor}; color: white; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;">
                          ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}
                        </span>
                      </td>
                    </tr>
                  </table>
                </div>

                <p style="color: #9ca3af; font-size: 13px; text-align: center; line-height: 1.6;">
                  Recibirás correos electrónicos según esta preferencia.<br/>
                  Puedes cambiar esto en cualquier momento desde tu panel.
                </p>
              </div>

              <!-- Footer -->
              <div style="background: #f9fafb; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  © ${new Date().getFullYear()} ArtoCamello · Todos los derechos reservados
                </p>
              </div>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error('Error enviando correo de notificación:', emailErr);
        // No fallar la request si el correo falla
      }
    }

    res.status(200).json({ 
      success: true, 
      message: enabled 
        ? `Notificación "${label}" activada. Se envió un correo de confirmación.`
        : `Notificación "${label}" desactivada.`,
      preference,
      enabled,
    });
  } catch (error) {
    console.error('Error in /api/notifications/preferences:', error);
    res.status(500).json({ error: 'Error al actualizar la preferencia de notificación.' });
  }
});

// Iniciar servidor
const adminHostGuard = (req: Request, res: Response, next: NextFunction) => {
  if (!isAdminHost(req.hostname)) { res.status(404).end(); return; }
  next();
};
app.use('/api/admin', adminHostGuard, adminEmailCodeRouter(prisma, JWT_SECRET));
app.use('/api/admin', adminHostGuard, adminRouter(prisma, JWT_SECRET));
app.use('/api/platform', platformRouter(prisma, JWT_SECRET));
app.use('/api/payments', transferRouter(prisma, JWT_SECRET));
export { app, prisma };
if (require.main === module) {
  app.listen(port, () => console.log(`Backend Server running at http://localhost:${port}`));
  const expiryTimer = setInterval(() => expirePendingPayments(prisma).catch(error => console.error('Payment expiry failed', error)), 60000);
  expiryTimer.unref();
  const throttleCleanupTimer = setInterval(() => Promise.all([
    pruneAuthAttempts(prisma),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  ]).catch(error => console.error('Auth cleanup failed', error)), 3600000);
  throttleCleanupTimer.unref();
}
