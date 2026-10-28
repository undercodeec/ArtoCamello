import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react';
import { useNavigate } from 'react-router';
import { resetPassword } from '@/services/authService';

export function ResetPasswordPage() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    setError('');
    try {
      setSuccess(await resetPassword(token, password));
      setPassword('');
      setConfirmation('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const openLogin = () => {
    navigate('/');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { view: 'login' } })), 0);
  };

  return (
    <div className="min-h-[calc(100dvh-5rem)] bg-[#f7f8fa] px-4 py-12 sm:py-20">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl shadow-slate-200/70 sm:p-9">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-[#FFCA0C] text-[#101828]"><LockKeyhole className="h-6 w-6" /></div>
        <h1 className="text-2xl font-bold text-[#101828]">Crea una nueva contraseña</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">El enlace de recuperación dura 30 minutos y solo se puede usar una vez.</p>
        {!token ? (
          <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">Este enlace no es válido. Solicita uno nuevo desde el inicio de sesión.</p>
        ) : success ? (
          <p role="status" className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">{success}</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-[#404145]">Nueva contraseña</label>
              <div className="relative">
                <input id="new-password" type={visible ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required className="w-full rounded-lg border border-gray-300 px-4 py-3 pr-12 outline-none focus:border-[#101828] focus:ring-2 focus:ring-[#FFCA0C]/40" />
                <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">{visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
              </div>
              <p className="mt-1 text-xs text-gray-500">Usa entre 8 y 128 caracteres.</p>
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-semibold text-[#404145]">Repite la nueva contraseña</label>
              <input id="confirm-password" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-[#101828] focus:ring-2 focus:ring-[#FFCA0C]/40" />
            </div>
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-lg bg-[#101828] px-4 py-3 font-semibold text-white hover:bg-[#26354d] disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Guardar contraseña'}</button>
          </form>
        )}
        <button type="button" onClick={openLogin} className="mt-6 text-sm font-semibold text-[#101828] underline underline-offset-2">Volver a iniciar sesión</button>
      </section>
    </div>
  );
}
