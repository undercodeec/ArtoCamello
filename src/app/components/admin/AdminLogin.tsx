import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { forceAuth } from '@/services/authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
      forceAuth(data.user, data.token);
      navigate('/', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return <main className="min-h-screen bg-[#f6f7f9] grid lg:grid-cols-2">
    <section className="hidden lg:flex bg-[#101828] text-white p-12 xl:p-20 flex-col justify-between">
      <div className="flex items-center gap-3 font-bold text-2xl"><span className="w-11 h-11 rounded-xl bg-[#FFCA0C] text-[#101828] grid place-items-center">A</span>ArtoCamello <span className="text-[#FFCA0C] font-medium">Admin</span></div>
      <div className="max-w-lg"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-[#FFCA0C]"><ShieldCheck className="w-4 h-4" />Acceso protegido</span><h1 className="text-5xl font-bold leading-tight mt-6">Gestiona tu operación con claridad.</h1><p className="text-lg text-gray-300 leading-relaxed mt-5">Ingresa con tus credenciales administrativas y confirma el código enviado a tu correo.</p></div>
      <p className="text-sm text-gray-400">ArtoCamello · Panel administrativo</p>
    </section>
    <section className="grid place-items-center p-6 sm:p-10">
      <form onSubmit={login} className="w-full max-w-md bg-white border border-gray-200 rounded-3xl p-7 sm:p-10 shadow-xl shadow-slate-200/60 space-y-6">
        <div><p className="text-sm font-semibold text-[#b78000] uppercase tracking-wider">Bienvenido</p><h2 className="text-3xl font-bold mt-2">Inicia sesión</h2><p className="text-sm text-gray-500 mt-2">Usa tu correo y contraseña administrativos.</p></div>
        <label className="block text-sm font-semibold text-gray-700">Correo<div className="relative mt-2"><Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" /><input className="block w-full border border-gray-200 rounded-xl py-3 pl-11 pr-3 outline-none focus:border-[#FFCA0C]" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></div></label>
        <label className="block text-sm font-semibold text-gray-700">Contraseña<div className="relative mt-2"><LockKeyhole className="absolute left-3 top-3 w-5 h-5 text-gray-400" /><input className="block w-full border border-gray-200 rounded-xl py-3 pl-11 pr-3 outline-none focus:border-[#FFCA0C]" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></div></label>
        {error && <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button className="w-full flex items-center justify-center gap-2 bg-[#101828] text-white py-3.5 rounded-xl font-semibold disabled:opacity-50" disabled={busy}>{busy ? 'Procesando...' : <>Entrar al panel <ArrowRight className="w-4 h-4" /></>}</button>
      </form>
    </section>
  </main>;
}
