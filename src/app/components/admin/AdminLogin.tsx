import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { login } from '@/services/authService';
import { isAdminDemoAvailable } from '@/app/adminPreview';

export function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await login(email, password); navigate('/', { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión'); }
    finally { setBusy(false); }
  };

  const demoAvailable = isAdminDemoAvailable(import.meta.env.DEV);

  return <main className="min-h-screen bg-[#f6f7f9] grid lg:grid-cols-2">
    <section className="hidden lg:flex bg-[#101828] text-white p-12 xl:p-20 flex-col justify-between relative overflow-hidden"><div className="absolute w-96 h-96 rounded-full bg-[#FFCA0C]/15 -right-24 -top-24" /><div className="absolute w-80 h-80 rounded-full border border-white/10 -left-32 bottom-12" /><div className="relative"><div className="flex items-center gap-3 font-bold text-2xl"><span className="w-11 h-11 rounded-xl bg-[#FFCA0C] text-[#101828] grid place-items-center">A</span>ArtoCamello <span className="text-[#FFCA0C] font-medium">Admin</span></div></div><div className="relative max-w-lg"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-[#FFCA0C]"><ShieldCheck className="w-4 h-4" />Acceso protegido</span><h1 className="text-5xl font-bold leading-tight mt-6">Gestiona tu operación con claridad.</h1><p className="text-lg text-gray-300 leading-relaxed mt-5">Revisa pagos, usuarios y actividad de tu negocio desde un solo lugar.</p></div><p className="relative text-sm text-gray-400">ArtoCamello · Panel administrativo</p></section>
    <section className="grid place-items-center p-6 sm:p-10"><form onSubmit={submit} className="w-full max-w-md bg-white border border-gray-200 rounded-3xl p-7 sm:p-10 shadow-xl shadow-slate-200/60 space-y-6"><div className="lg:hidden flex items-center gap-2 font-bold text-xl"><span className="w-9 h-9 rounded-xl bg-[#FFCA0C] text-[#101828] grid place-items-center">A</span>ArtoCamello <span className="text-[#101828]/60 font-medium">Admin</span></div><div><p className="text-sm font-semibold text-[#b78000] uppercase tracking-wider">Bienvenido</p><h2 className="text-3xl font-bold mt-2">Inicia sesión</h2><p className="text-sm text-gray-500 mt-2">Usa tu cuenta administrativa para continuar.</p></div><label className="block text-sm font-semibold text-gray-700">Correo<div className="relative mt-2"><Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" /><input className="block w-full border border-gray-200 rounded-xl py-3 pl-11 pr-3 outline-none focus:border-[#FFCA0C] focus:ring-4 focus:ring-[#FFCA0C]/15" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></div></label><label className="block text-sm font-semibold text-gray-700">Contraseña<div className="relative mt-2"><LockKeyhole className="absolute left-3 top-3 w-5 h-5 text-gray-400" /><input className="block w-full border border-gray-200 rounded-xl py-3 pl-11 pr-3 outline-none focus:border-[#FFCA0C] focus:ring-4 focus:ring-[#FFCA0C]/15" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></div></label>{error && <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</p>}<button className="w-full flex items-center justify-center gap-2 bg-[#101828] hover:bg-[#1d2939] text-white py-3.5 rounded-xl font-semibold transition-colors disabled:opacity-50" disabled={busy}>{busy ? 'Ingresando...' : <>Ingresar al panel <ArrowRight className="w-4 h-4" /></>}</button>{demoAvailable && <button type="button" onClick={() => navigate('/demo')} className="w-full border border-[#101828] text-[#101828] hover:bg-[#101828]/5 py-3 rounded-xl font-semibold transition-colors">Ver panel de demostración</button>}<p className="text-xs text-center text-gray-500">Después de la contraseña confirmarás tu correo y MFA.</p></form></section>
  </main>;
}
