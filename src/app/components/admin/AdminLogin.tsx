import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { login } from '@/services/authService';

export function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return <main className="min-h-screen bg-[#f6f7f9] grid place-items-center p-6"><form onSubmit={submit} className="bg-white border rounded-xl p-8 w-full max-w-md space-y-4"><h1 className="text-2xl font-bold">Panel administrativo</h1><p className="text-sm text-gray-600">Inicia sesión con tu cuenta administrativa.</p><label className="block text-sm font-medium">Correo<input className="mt-1 block w-full border rounded-lg p-2" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label className="block text-sm font-medium">Contraseña<input className="mt-1 block w-full border rounded-lg p-2" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{error && <p className="text-sm text-red-700">{error}</p>}<button className="w-full bg-[#101828] text-white py-2 rounded-lg font-semibold disabled:opacity-50" disabled={busy}>{busy ? 'Ingresando...' : 'Ingresar'}</button><button type="button" onClick={() => navigate('/demo')} className="w-full border border-[#101828] text-[#101828] py-2 rounded-lg font-semibold">Ver panel de demostración</button></form></main>;
}
