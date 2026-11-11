import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { resendVerification, verifyEmail } from '@/services/authService';
import { UserRole } from '@/domain/types';
import { RecaptchaWidget, recaptchaConfigured } from '@/shared/components/RecaptchaWidget';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(Boolean(token));
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!token) return;
    let active = true;
    verifyEmail(token).then(user => {
      if (!active) return;
      if (user.role === UserRole.PROFESSIONAL) navigate('/dashboard', { replace: true });
      else if (user.role === UserRole.GUEST) navigate('/onboarding', { replace: true });
      else {
        const returnTo = sessionStorage.getItem('authReturnTo');
        sessionStorage.removeItem('authReturnTo');
        navigate(returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/mis-solicitudes', { replace: true });
      }
    }).catch(cause => { if (active) { setError(cause instanceof Error ? cause.message : 'No se pudo verificar el correo.'); setWorking(false); } });
    return () => { active = false; };
  }, [token, navigate]);
  return <main className="min-h-screen bg-gray-50 px-4 pt-32"><div className="mx-auto max-w-md rounded-xl bg-white p-8 shadow-sm">
    <h1 className="text-2xl font-bold text-[#101828]">Verifica tu correo</h1>
    {working ? <p role="status" className="mt-4">Verificando tu cuenta...</p> : <p role="alert" className="mt-4 text-red-700">{error || 'El enlace de verificación no es válido.'}</p>}
    {!working && <form className="mt-6 space-y-3" onSubmit={async event => {
      event.preventDefault();
      if (recaptchaConfigured && !captchaToken) { setError('Completa la verificación de seguridad.'); return; }
      setResending(true); setError(''); setResendMessage('');
      try { setResendMessage(await resendVerification(email.trim(), captchaToken)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo solicitar otro enlace.'); }
      finally { setResending(false); setCaptchaReset(current => current + 1); }
    }}>
      <label htmlFor="verify-email" className="block text-sm font-semibold">Solicitar otro enlace</label>
      <input id="verify-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="Tu correo" className="w-full rounded-lg border px-3 py-2" />
      <RecaptchaWidget onToken={setCaptchaToken} resetKey={captchaReset} />
      <button type="submit" disabled={resending} className="rounded-lg bg-[#101828] px-4 py-2 font-semibold text-white disabled:opacity-60">{resending ? 'Enviando...' : 'Reenviar verificación'}</button>
      {resendMessage && <p role="status" className="text-sm text-green-700">{resendMessage}</p>}
    </form>}
    {!working && <Link to="/" className="mt-5 inline-block font-semibold underline">Volver al inicio</Link>}
  </div></main>;
}
