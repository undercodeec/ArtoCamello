import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { adminRequest } from '@/services/adminService';

export function AdminClaim() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await adminRequest('/invitations/claim', { method: 'POST', body: JSON.stringify({ token, password }) }); setDone(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <main className="min-h-screen bg-[#f6f7f9] grid place-items-center p-4"><div className="bg-white border rounded-xl p-8 w-full max-w-md"><h1 className="text-2xl font-bold mb-3">Invitación administrativa</h1>{done ? <><p>Cuenta activada. Inicia sesión para entrar al panel.</p><Link className="underline block mt-4" to="/login">Iniciar sesión</Link></> : <form onSubmit={submit} className="space-y-4"><p className="text-sm text-gray-600">Crea tu contraseña para verificar el correo y aceptar la invitación.</p><label className="block text-sm font-medium">Contraseña (mínimo 12 caracteres)<input className="block w-full border rounded-lg p-2 mt-1" type="password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)} /></label>{error && <p className="text-red-600 text-sm">{error}</p>}<button disabled={!token || busy} className="bg-[#101828] text-white px-4 py-2 rounded-lg disabled:opacity-50">{busy ? 'Activando...' : 'Activar cuenta'}</button></form>}</div></main>;
}
