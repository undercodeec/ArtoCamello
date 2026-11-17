// ====================================================================
// ArtoCamello — Auth Service (Real API Integration)
// ====================================================================
import { User, UserRole } from '../domain/types';

const AUTH_KEY = 'artocamello_auth';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  role: UserRole;
  email: string | null;
  token: string | null;
}

type ApiMessage = {
  error?: unknown;
  message?: unknown;
  code?: unknown;
};

export class RecoveryEmailNotRegisteredError extends Error {}

/**
 * The API is expected to return JSON. A missing route or reverse proxy can
 * return HTML, which must not surface as a JSON SyntaxError in the UI.
 */
async function readApiMessage(response: Response): Promise<ApiMessage> {
  const body = await response.text();
  if (!body) return {};

  try {
    return JSON.parse(body) as ApiMessage;
  } catch {
    if (!response.ok) {
      throw new Error('El servicio de recuperación no está disponible en este momento. Intenta nuevamente más tarde.');
    }
    throw new Error('El servidor devolvió una respuesta inválida. Intenta nuevamente más tarde.');
  }
}

function getAuthState(): AuthState {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { isAuthenticated: false, userId: null, role: UserRole.GUEST, email: null, token: null };
}

function setAuthState(state: AuthState): void {
  if (state.isAuthenticated) {
    sessionStorage.removeItem('adminEmailSession');
  }
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(state));
  // Keep legacy keys for components that might still use them directly
  if (state.isAuthenticated && state.token) {
    sessionStorage.setItem('isAuthenticated', 'true');
    let type = 'guest';
    if (state.role === UserRole.PROFESSIONAL) type = 'pro';
    else if (state.role === UserRole.CLIENT) type = 'client';
    
    sessionStorage.setItem('userType', type);
    sessionStorage.setItem('userEmail', state.email || '');
    sessionStorage.setItem('authToken', state.token);
  } else {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('userType');
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('authToken');
  }
  window.dispatchEvent(new Event('auth-status-changed'));
}

/**
 * Login a user by email and password.
 * Returns the User on success, throws an Error on failure.
 */
export async function login(email: string, password: string): Promise<User> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Error al iniciar sesión');
  }

  const data = await response.json();
  const user = data.user as User;
  
  setAuthState({
    isAuthenticated: true,
    userId: user.id,
    role: user.role,
    email: user.email,
    token: data.token,
  });

  // Salvar user data para obtenerla síncronamente en getCurrentUser (como un cache simple)
  sessionStorage.setItem('cachedUser', JSON.stringify(user));

  return user;
}

export async function requestPasswordReset(email: string): Promise<string> {
  const response = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await readApiMessage(response);
  if (response.status === 404 && data.code === 'EMAIL_NOT_REGISTERED') {
    throw new RecoveryEmailNotRegisteredError('Este correo no está registrado. Puedes crear una cuenta.');
  }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo solicitar el enlace.');
  return typeof data.message === 'string' ? data.message : 'Revisa tu correo para continuar.';
}

export async function resetPassword(token: string, password: string): Promise<string> {
  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await readApiMessage(response);
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo restablecer la contraseña.');
  return typeof data.message === 'string' ? data.message : 'Contraseña actualizada.';
}

/**
 * Register a new user. Support verification flow.
 */
export async function register(data: { email: string; password: string; fullName: string; role: UserRole; phone?: string; captchaToken?: string }): Promise<{ requiresVerification: boolean, message: string; user?: User }> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Error al registrarse');
  }

  const responseData = await response.json();
  
  // Si requiere verificación de email (Nodemailer config backend)
  if (responseData.requiresVerification) {
    return {
       requiresVerification: true,
       message: responseData.message || 'Verifica tu bandeja de entrada'
    };
  }

  // Comportamiento antiguo si no hubiera verificación de email temporal
  const user = responseData.user as User;
  
  setAuthState({
    isAuthenticated: true,
    userId: user.id,
    role: user.role,
    email: user.email,
    token: responseData.token,
  });

  sessionStorage.setItem('cachedUser', JSON.stringify(user));

  return { requiresVerification: false, message: 'Autenticado existosamente', user };
}

/**
 * Updates the user's role on the backend during onboarding.
 */
export async function verifyEmail(token: string): Promise<User> {
  const response = await fetch(`${API_URL}/auth/verify-email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo verificar el correo.');
  const user = data.user as User;
  setAuthState({ isAuthenticated: true, userId: user.id, role: user.role, email: user.email, token: data.token });
  sessionStorage.setItem('cachedUser', JSON.stringify(user));
  return user;
}

export async function resendVerification(email: string, captchaToken: string): Promise<string> {
  const response = await fetch(`${API_URL}/auth/resend-verification`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, captchaToken }),
  });
  const data = await readApiMessage(response);
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo solicitar otro enlace.');
  return typeof data.message === 'string' ? data.message : 'Si la cuenta necesita confirmación, enviaremos un nuevo enlace.';
}

export async function updateRole(role: 'client' | 'pro', profile?: { fullName: string; phone: string }): Promise<User> {
  const auth = getAuthState();
  if (!auth.token) throw new Error('No hay sesión activa para actualizar rol');

  const response = await fetch(`${API_URL}/auth/role`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth.token}` 
    },
    body: JSON.stringify({ role, ...(role === 'client' ? profile : {}) }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Error al actualizar rol');
  }

  const data = await response.json();
  const user = data.user as User;
  
  setAuthState({
    isAuthenticated: true,
    userId: user.id,
    role: user.role,
    email: user.email,
    token: data.token,
  });

  sessionStorage.setItem('cachedUser', JSON.stringify(user));

  return user;
}

/** Force injects auth state after an authentication flow completes. */
export function forceAuth(user: User, token: string): void {
  setAuthState({
    isAuthenticated: true,
    userId: user.id,
    role: user.role,
    email: user.email,
    token: token,
  });
  sessionStorage.setItem('cachedUser', JSON.stringify(user));
}

/**
 * Logout the current user.
 */
export function logout(): void {
  setAuthState({ isAuthenticated: false, userId: null, role: UserRole.GUEST, email: null, token: null });
  sessionStorage.removeItem('cachedUser');
  sessionStorage.removeItem('adminEmailSession');
}

/** Get current auth state */
export function getCurrentAuth(): AuthState {
  return getAuthState();
}

/** Get current user object from cache if available */
export function getCurrentUser(): User | null {
  const auth = getAuthState();
  if (!auth.isAuthenticated || !auth.userId) return null;
  try {
    const cached = sessionStorage.getItem('cachedUser');
    if (cached) return JSON.parse(cached);
  } catch { /* ignore */ }
  return null;
}
