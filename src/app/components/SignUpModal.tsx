import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { useNavigate } from 'react-router';
import illustration from 'figma:asset/62a7846a80b09f8084074694693eb26e2a63983f.png';
import { useAuth } from '@/shared/context/AuthContext';
import { UserRole } from '@/domain/types';
import { trackMetaEvent } from '@/shared/lib/metaPixel';
import { requestPasswordReset } from '@/services/authService';

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'login' | 'signup';
}

type View = 'login' | 'signup' | 'recovery';
const fieldClass = 'w-full rounded-lg border border-gray-300 px-4 py-3 text-[#101828] outline-none transition focus:border-[#101828] focus:ring-2 focus:ring-[#FFCA0C]/40';

export function SignUpModal({ isOpen, onClose, initialView = 'signup' }: SignUpModalProps) {
  const [view, setView] = useState<View>(initialView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const { login, register } = useAuth();

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setView(initialView);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setError('');
    setSuccess('');
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen, initialView]);

  const changeView = (next: View) => {
    setView(next);
    setError('');
    setSuccess('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (view === 'recovery') {
        setSuccess(await requestPasswordReset(email.trim()));
      } else if (view === 'login') {
        const user = await login(email.trim(), password);
        onClose();
        if (user.role === UserRole.PROFESSIONAL) navigate('/dashboard');
      } else {
        if (password !== confirmPassword) {
          setError('Las contraseñas no coinciden.');
          return;
        }
        const localPart = email.trim().split('@')[0];
        const result = await register({
          email: email.trim(),
          password,
          fullName: localPart.length >= 2 ? localPart : 'Cliente',
          role: UserRole.GUEST,
        });
        trackMetaEvent('CompleteRegistration');
        if (result.requiresVerification) setSuccess(result.message);
        else { onClose(); navigate('/onboarding'); }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ocurrió un error. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar ventana" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="relative my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[850px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-white text-gray-600 shadow hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-[#101828]">
          <span aria-hidden="true" className="text-2xl leading-none">×</span>
        </button>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:flex-row">
          <div className="relative hidden shrink-0 bg-[#FFCA0C] px-8 pb-0 pt-10 text-[#101828] md:flex md:w-[42%] md:flex-col lg:px-10">
            <h2 className="mb-7 max-w-xs text-3xl font-bold leading-tight">El éxito comienza aquí</h2>
            <div className="space-y-5 text-base font-medium leading-snug">
              <p className="flex items-start gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0" />Más de 700 categorías</p>
              <p className="flex items-start gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0" />Trabajo de calidad realizado con mayor rapidez</p>
              <p className="flex items-start gap-3"><Check className="mt-0.5 h-5 w-5 shrink-0" />Acceso a talento profesional y negocios de todo el mundo</p>
            </div>
            <img src={illustration} alt="Profesional trabajando" className="mt-auto max-h-56 w-full object-contain object-bottom pt-5" />
          </div>

          <div className="flex w-full flex-col px-5 py-8 sm:px-9 md:w-[58%] md:px-8 md:py-10 lg:px-12">
            {view === 'recovery' && (
              <button type="button" onClick={() => changeView('login')} className="mb-5 flex w-fit items-center gap-2 text-sm font-semibold text-gray-600 hover:text-[#101828]">
                <ArrowLeft className="h-4 w-4" /> Volver a iniciar sesión
              </button>
            )}
            <h2 id="auth-title" className="pr-8 text-2xl font-bold leading-tight text-[#101828] sm:text-[28px]">
              {view === 'login' ? 'Inicia sesión en tu cuenta' : view === 'signup' ? 'Crear una cuenta nueva' : 'Recuperar contraseña'}
            </h2>
            <p className="mb-6 mt-2 text-sm leading-relaxed text-gray-600">
              {view === 'recovery' ? 'Escribe el correo de tu cuenta cliente y te enviaremos un enlace para crear una nueva contraseña.' : (
                <>{view === 'login' ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}{' '}
                  <button type="button" onClick={() => changeView(view === 'login' ? 'signup' : 'login')} className="font-semibold text-[#101828] underline underline-offset-2 hover:text-[#9A6500]">
                    {view === 'login' ? 'Regístrate aquí' : 'Iniciar sesión'}
                  </button>
                </>
              )}
            </p>

            {success ? (
              <div role="status" className="space-y-5 rounded-xl bg-green-50 p-5 text-sm leading-relaxed text-green-900">
                <Mail className="h-8 w-8" />
                <p>{success}</p>
                <button type="button" onClick={view === 'recovery' ? () => changeView('login') : onClose} className="font-semibold underline underline-offset-2">{view === 'recovery' ? 'Volver a iniciar sesión' : 'Cerrar'}</button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                <div>
                  <label htmlFor="auth-email" className="mb-1.5 block text-sm font-semibold text-[#404145]">Correo electrónico</label>
                  <input id="auth-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="nombre@email.com" autoComplete="email" className={fieldClass} required />
                </div>
                {view !== 'recovery' && (
                  <div>
                    <label htmlFor="auth-password" className="mb-1.5 block text-sm font-semibold text-[#404145]">Contraseña</label>
                    <div className="relative">
                      <input id="auth-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete={view === 'login' ? 'current-password' : 'new-password'} minLength={view === 'signup' ? 8 : undefined} maxLength={view === 'signup' ? 128 : undefined} className={`${fieldClass} pr-12`} required />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#101828]">
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                )}
                {view === 'signup' && (
                  <div>
                    <label htmlFor="auth-confirm-password" className="mb-1.5 block text-sm font-semibold text-[#404145]">Repetir contraseña</label>
                    <input id="auth-confirm-password" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} className={fieldClass} required />
                    <p className="mt-1.5 text-xs text-gray-500">Usa entre 8 y 128 caracteres.</p>
                  </div>
                )}
                {view === 'login' && (
                  <button type="button" onClick={() => changeView('recovery')} className="block text-sm font-semibold text-[#404145] underline underline-offset-2 hover:text-[#9A6500]">¿Olvidaste tu contraseña?</button>
                )}
                <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-lg bg-[#101828] px-4 py-3 font-semibold text-white transition hover:bg-[#26354d] disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Procesando" /> : view === 'login' ? 'Iniciar sesión' : view === 'signup' ? 'Crear cuenta' : 'Enviar enlace'}
                </button>
              </form>
            )}
            {view === 'signup' && <p className="mt-6 text-xs leading-relaxed text-gray-500">Al unirte, aceptas los términos de servicio y la política de privacidad de ArtoCamello.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
