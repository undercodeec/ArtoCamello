import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { adminRequest, AdminMe, Payment } from '@/services/adminService';
import logo from '@/assets/logoartocamello.png';
import { adminUrl, publicAppUrl } from '@/app/adminHost';
import { getCurrentUser, logout } from '@/services/authService';
import { Bell, ClipboardList, CreditCard, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings2, ShieldCheck, Users as UsersIcon, UserRound, X } from 'lucide-react';

type List<T> = { items: T[]; total: number };
const money = (amount: string | number, currency = 'USD') => `${Number(amount).toFixed(2)} ${currency}`;
const date = (value: string) => new Date(value).toLocaleString('es-EC');
const status: Record<string, string> = { awaiting_transfer: 'Esperando transferencia', under_review: 'Por revisar', approved: 'Confirmado, por resolver', allocated: 'Aprobado', rejected: 'Rechazado', pending_provider: 'Pendiente proveedor', failed: 'Fallido', expired: 'Vencido' };
const nav = [
  ['/', 'Inicio', 'dashboard.read'],
  ['/payments/transfers', 'Transferencias', 'payments.read'],
  ['/payments', 'Todos los pagos', 'payments.read'],
  ['/users/clients', 'Clientes', 'users.read'],
  ['/users/professionals', 'Profesionales', 'users.read'],
  ['/access/admins', 'Administradores', 'admins.read'],
  ['/access/roles', 'Roles y permisos', 'roles.read'],
  ['/settings', 'Configuración', 'settings.read'],
  ['/audit', 'Auditoría', 'audit.read'],
];
const navIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  '/': LayoutDashboard, '/payments/transfers': CreditCard, '/payments': ClipboardList,
  '/users/clients': UsersIcon, '/users/professionals': UserRound, '/access/admins': ShieldCheck,
  '/access/roles': ShieldCheck, '/settings': Settings2, '/audit': ClipboardList,
};
const input = 'border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm';
const button = 'bg-[#101828] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50';

function useData<T>(path: string, key = '') {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = () => { setLoading(true); adminRequest<T>(path).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(reload, [path, key]);
  return { data, error, loading, reload };
}

export function AdminPanel() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState('');
  const [emailCode, setEmailCode] = useState(false);
  const [mfa, setMfa] = useState<'setup' | 'verify' | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const loadAccess = () => adminRequest<AdminMe>('/me').then(value => { setMe(value); setError(''); setEmailCode(false); setMfa(null); }).catch((e: Error & { code?: string }) => { if (e.code === 'EMAIL_CODE_REQUIRED') setEmailCode(true); else if (e.code === 'MFA_SETUP_REQUIRED') setMfa('setup'); else if (e.code === 'MFA_REQUIRED') setMfa('verify'); else setError(e.message); });
  useEffect(() => { loadAccess(); }, []);
  useEffect(() => { const listener = (event: Event) => setMfa((event as CustomEvent<string>).detail === 'MFA_SETUP_REQUIRED' ? 'setup' : 'verify'); window.addEventListener('admin-mfa-required', listener); return () => window.removeEventListener('admin-mfa-required', listener); }, []);
  if (emailCode) return <EmailCodeGate onReady={loadAccess} />;
  if (mfa) return <MfaGate mode={mfa} onReady={loadAccess} />;
  if (error) return <main className="min-h-screen grid place-items-center p-8"><div className="bg-white p-8 rounded-xl shadow max-w-md"><h1 className="text-xl font-bold mb-2">Acceso administrativo</h1><p>{error}</p><button className={`${button} mt-4`} onClick={() => adminRequest('/invitations/accept', { method: 'POST' }).then(() => adminRequest<AdminMe>('/me')).then(value => { setMe(value); setError(''); }).catch(e => setError(e.message))}>Aceptar invitación pendiente</button><Link to="/login" className="underline mt-4 block">Iniciar sesión con otra cuenta</Link></div></main>;
  if (!me) return <main className="p-8">Verificando acceso...</main>;
  const sub = pathname || '/';
  const permissions = new Set(me.permissions);
  const selected = nav.find(([path]) => path === sub);
  if (selected && !permissions.has(selected[2])) return <main className="p-8">Permiso insuficiente</main>;
  const userName = getCurrentUser()?.fullName || 'Administrador';
  const initials = userName.charAt(0).toUpperCase();
  const signOut = () => { logout(); window.location.assign(publicAppUrl()); };
  return <div className="min-h-screen bg-[#f6f7f9] text-[#101828]">
    <div className="lg:hidden fixed inset-x-0 top-0 h-16 bg-[#101828] text-white z-30 flex items-center justify-between px-4 shadow-lg"><span className="font-bold text-lg">ArtoCamello <span className="text-[#FFCA0C]">Admin</span></span><button aria-label="Abrir navegación" onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X /> : <Menu />}</button></div>
    <aside className={`fixed inset-y-0 left-0 ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'} w-72 bg-[#101828] text-white flex flex-col z-40 overflow-hidden transition-[transform,width] duration-300 ${mobileMenu ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className={`p-5 border-b border-white/10 flex items-center ${sidebarCollapsed ? 'lg:justify-center' : 'justify-between'} gap-3`}><a href={publicAppUrl()} className="min-w-0"><img src={logo} alt="ArtoCamello" className={sidebarCollapsed ? 'w-10 h-10 object-contain lg:block' : 'w-40 h-10 object-contain object-left'} /></a><button type="button" aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="hidden lg:grid w-9 h-9 rounded-lg place-items-center text-gray-300 hover:bg-white/10 hover:text-white">{sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}</button></div>
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">Panel administrativo · {me.role.replace(/_/g, ' ')}</p>
      <nav className={`flex-1 px-4 py-6 space-y-1 overflow-y-auto overscroll-contain ${sidebarCollapsed ? 'lg:px-3' : ''}`}>{nav.filter(([, , permission]) => permissions.has(permission)).map(([path, label]) => { const Icon = navIcons[path]; return <Link key={path} to={path} title={label} onClick={() => setMobileMenu(false)} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${sidebarCollapsed ? 'lg:justify-center lg:px-3' : ''} ${sub === path ? 'bg-[#FFCA0C] text-[#101828] shadow-lg shadow-black/20' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}><Icon className="w-5 h-5 shrink-0" /><span className={sidebarCollapsed ? 'lg:hidden' : ''}>{label}</span></Link>; })}</nav>
      <div className="p-4 border-t border-white/10"><div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/10 mb-3"><div className="w-10 h-10 rounded-full bg-[#FFCA0C] text-[#101828] grid place-items-center font-bold">{initials}</div><div className="min-w-0"><p className="text-sm font-semibold truncate">{userName}</p><p className="text-xs text-gray-400 capitalize">{me.role.replace(/_/g, ' ')}</p></div></div><button onClick={signOut} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-300 hover:bg-red-500/15 transition-colors"><LogOut className="w-5 h-5" />Cerrar sesión</button></div>
    </aside>
    {mobileMenu && <button aria-label="Cerrar navegación" className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileMenu(false)} />}
    <main className={`min-w-0 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'} pt-16 lg:pt-0 transition-[margin] duration-300`}>
      <header className="hidden lg:flex h-20 px-8 border-b border-gray-200 bg-white/85 backdrop-blur items-center justify-between sticky top-0 z-20"><div><p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Panel administrativo</p><p className="font-semibold">{selected?.[1] || 'Panel'}</p></div><div className="flex items-center gap-4"><button aria-label="Notificaciones" className="w-10 h-10 rounded-xl grid place-items-center text-gray-500 hover:bg-gray-100"><Bell className="w-5 h-5" /></button><div className="h-8 border-l border-gray-200" /><div className="flex items-center gap-2"><div className="w-9 h-9 rounded-full bg-[#FFCA0C] grid place-items-center font-bold text-sm">{initials}</div><span className="text-sm font-semibold max-w-40 truncate">{userName}</span></div></div></header>
      <div className="p-4 md:p-8 max-w-[1500px] min-w-0 mx-auto">
      {sub === '/' && <Dashboard />}
      {sub === '/payments/transfers' && <Payments transfers permissions={permissions} />}
      {sub === '/payments' && <Payments permissions={permissions} />}
      {sub === '/users/clients' && <Users role="client" permissions={permissions} />}
      {sub === '/users/professionals' && <Users role="pro" permissions={permissions} />}
      {sub === '/access/admins' && <Admins permissions={permissions} />}
      {sub === '/access/roles' && <Roles permissions={permissions} />}
      {sub === '/settings' && <Settings permissions={permissions} />}
      {sub === '/audit' && <Audit />}
      {!selected && <div><h1 className="text-2xl font-bold">Página no encontrada</h1><button onClick={() => navigate('/')} className={button}>Ir al inicio</button></div>}
      </div>
    </main>
  </div>;
}

function EmailCodeGate({ onReady }: { onReady: () => void }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setError('');
    try { await adminRequest('/access-code/request', { method: 'POST' }); setMessage('Enviamos un código de seis dígitos a tu correo registrado.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError('');
    try {
      const response = await adminRequest<{ adminEmailSession: string }>('/access-code/verify', { method: 'POST', body: JSON.stringify({ code }) });
      sessionStorage.setItem('adminEmailSession', response.adminEmailSession);
      onReady();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-[#f6f7f9] grid place-items-center p-6"><div className="bg-white border rounded-xl p-6 w-full max-w-md space-y-4">
    <h1 className="text-2xl font-bold">Confirma tu correo</h1>
    <p>Para ingresar al panel, solicita y confirma un código enviado a tu correo administrativo.</p>
    <button className={button} disabled={busy} onClick={send}>{message ? 'Reenviar código' : 'Enviar código'}</button>
    <label className="block text-sm">Código de seis dígitos<input className={`${input} block w-full mt-1`} autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} /></label>
    <button className={button} disabled={busy || code.length !== 6} onClick={verify}>Continuar</button>
    {message && <p className="text-green-700">{message}</p>}
    {error && <p className="text-red-700">{error}</p>}
  </div></main>;
}

function MfaGate({ mode, onReady }: { mode: 'setup' | 'verify'; onReady: () => void }) {
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setup = async () => { setBusy(true); setError(''); try { const response = await adminRequest<{ secret: string }>('/mfa/setup', { method: 'POST' }); setSecret(response.secret); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (mode === 'setup' && !recoveryCodes.length) {
        const response = await adminRequest<{ recoveryCodes: string[] }>('/mfa/confirm', { method: 'POST', body: JSON.stringify({ code }) });
        setRecoveryCodes(response.recoveryCodes); setCode('');
      } else {
        const response = await adminRequest<{ adminSession: string }>('/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) });
        sessionStorage.setItem('adminSession', response.adminSession);
        onReady();
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-[#f6f7f9] grid place-items-center p-6"><div className="bg-white border rounded-xl p-6 w-full max-w-md space-y-4">
    <h1 className="text-2xl font-bold">Seguridad del panel administrativo</h1>
    {mode === 'setup' && !recoveryCodes.length && <><p>Configura un autenticador TOTP para esta cuenta.</p>{!secret ? <button className={button} disabled={busy} onClick={setup}>Generar clave de configuración</button> : <><p>Ingresa esta clave en tu aplicación autenticadora:</p><code className="block break-all bg-gray-100 p-3 rounded select-all">{secret}</code></>}</>}
    {recoveryCodes.length > 0 && <><p className="font-semibold">Guarda estos códigos de recuperación en un lugar seguro. Cada uno sirve una sola vez y no se mostrará de nuevo.</p><pre className="bg-gray-100 p-3 rounded whitespace-pre-wrap select-all">{recoveryCodes.join('\n')}</pre><button className={button} onClick={() => { setRecoveryCodes([]); setSecret(''); onReady(); }}>Ya guardé los códigos</button></>}
    {(mode === 'verify' || Boolean(secret)) && !recoveryCodes.length && <><label className="block text-sm">{mode === 'verify' ? 'Código del autenticador o de recuperación' : 'Código de seis dígitos'}<input className={`${input} block w-full mt-1`} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></label><button className={button} disabled={busy || !code} onClick={submit}>{mode === 'verify' ? 'Entrar al panel' : 'Activar MFA'}</button></>}
    {error && <p className="text-red-700">{error}</p>}
  </div></main>;
}

function Dashboard() {
  const { data, error, loading } = useData<{ pendingTransfers: number; approvedPayments: number; newUsers: number; unverifiedProfessionals: number; expiredPayments: number; unresolvedProviderPayments: number; rejectionRate: number | null; averageReviewHours: number | null; recentActivity: Array<{ id: string; action: string; createdAt: string }> }>('/dashboard');
  return <section><h1 className="text-3xl font-bold mb-6">Resumen</h1>{error && <p className="text-red-600">{error}</p>}{loading ? 'Cargando...' : data && <>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{[['Transferencias por revisar', data.pendingTransfers], ['Pagos aprobados', data.approvedPayments], ['Usuarios nuevos (30 días)', data.newUsers], ['Profesionales por verificar', data.unverifiedProfessionals]].map(([label, value]) => <div key={label} className="bg-white rounded-xl p-5 border"><p className="text-gray-500 text-sm">{label}</p><strong className="text-3xl">{value}</strong></div>)}</div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">{[['Pagos vencidos', data.expiredPayments], ['Pagos de proveedor por resolver', data.unresolvedProviderPayments], ['Transferencias rechazadas', data.rejectionRate === null ? 'Sin datos' : `${(data.rejectionRate * 100).toFixed(1)}%`], ['Tiempo medio de revisión', data.averageReviewHours === null ? 'Sin datos' : `${data.averageReviewHours.toFixed(1)} h`]].map(([label, value]) => <div key={label} className="bg-white rounded-xl p-5 border"><p className="text-gray-500 text-sm">{label}</p><strong className="text-2xl">{value}</strong></div>)}</div>
    <div className="bg-white rounded-xl border p-5 mt-6"><h2 className="text-xl font-semibold mb-3">Actividad reciente</h2>{data.recentActivity.map(a => <p key={a.id} className="border-t py-2 text-sm">{a.action} · {date(a.createdAt)}</p>)}</div>
  </>}</section>;
}

function Payments({ transfers = false, permissions }: { transfers?: boolean; permissions: Set<string> }) {
  const [filter, setFilter] = useState('');
  const [reference, setReference] = useState('');
  const [bank, setBank] = useState(''); const [minAmount, setMinAmount] = useState(''); const [maxAmount, setMaxAmount] = useState(''); const [dateFrom, setDateFrom] = useState(''); const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const query = new URLSearchParams({ status: filter, reference, bank, minAmount, maxAmount, dateFrom, dateTo });
  const path = `/payments${transfers ? '/transfers' : ''}?page=${page}&${query}`;
  const { data, error, loading, reload } = useData<List<Payment>>(path);
  const exportCsv = async () => {
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/admin/payments/export.csv?${query}${transfers ? '&method=transfer' : ''}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('authToken')}`, 'X-Admin-Email-Session': sessionStorage.getItem('adminEmailSession') || '', 'X-Admin-Session': sessionStorage.getItem('adminSession') || '' } });
    if (!response.ok) { alert('No se pudo exportar'); return; }
    const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = 'pagos.csv'; a.click(); URL.revokeObjectURL(url);
  };
  return <section><div className="flex flex-wrap items-center justify-between gap-3 mb-5"><h1 className="text-3xl font-bold">{transfers ? 'Transferencias' : 'Todos los pagos'}</h1>{permissions.has('payments.export') && <button onClick={exportCsv} className={button}>Exportar CSV</button>}</div>
    <div className="flex flex-wrap gap-2 mb-4"><select className={input} value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="">Todos los estados</option>{['awaiting_transfer','under_review','approved','allocated','rejected','failed','expired','pending_provider'].map(s => <option key={s} value={s}>{status[s] || s}</option>)}</select><input className={input} placeholder="Buscar referencia" value={reference} onChange={e => { setReference(e.target.value); setPage(1); }} /><input className={input} placeholder="Banco" value={bank} onChange={e => { setBank(e.target.value); setPage(1); }} /><input className={`${input} w-28`} type="number" min="0" placeholder="Monto mín." value={minAmount} onChange={e => { setMinAmount(e.target.value); setPage(1); }} /><input className={`${input} w-28`} type="number" min="0" placeholder="Monto máx." value={maxAmount} onChange={e => { setMaxAmount(e.target.value); setPage(1); }} /><label className="text-xs">Desde<input className={`${input} block`} type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} /></label><label className="text-xs">Hasta<input className={`${input} block`} type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} /></label></div>
    {error && <p className="text-red-600">{error}</p>}{loading ? 'Cargando...' : <><div className="bg-white border rounded-xl overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left"><th className="p-3">Referencia</th><th>Pagador</th>{transfers && <><th>Lead</th><th>Banco / Ref. declarada</th><th>Transferencia / Envío</th><th>Revisor</th></>}<th>Monto</th><th>Método</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>{data?.items.map(p => <tr key={p.id} className="border-t"><td className="p-3 font-mono">{p.reference}</td><td>{p.payer.fullName}</td>{transfers && <><td>{p.leadTitle}</td><td>{p.transfers?.[0] ? `${p.transfers[0].bankName} / ${p.transfers[0].transferReference}` : 'Pendiente'}</td><td>{p.transfers?.[0] ? `${date(p.transfers[0].transferredAt)} / ${date(p.transfers[0].createdAt)}` : '—'}</td><td>{p.transfers?.[0]?.reviewer?.fullName || 'Pendiente'}</td></>}<td>{money(p.amount,p.currency)}</td><td>{p.method}</td><td>{status[p.status] || p.status}</td><td>{date(p.createdAt)}</td><td><button className="underline text-blue-700" onClick={() => setSelected(p.id)}>Detalle</button></td></tr>)}</tbody></table>{!data?.items.length && <p className="p-5">Sin pagos para estos filtros.</p>}</div><Pager page={page} total={data?.total || 0} onPage={setPage} /></>}
    {selected && <PaymentDetail id={selected} canReview={permissions.has('payments.review')} onClose={() => setSelected(null)} onChanged={reload} />}
  </section>;
}

function PaymentDetail({ id, canReview, onClose, onChanged }: { id: string; canReview: boolean; onClose: () => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useData<Payment>(`/payments/${id}`);
  const [note, setNote] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const openProof = async (url: string) => {
    const tab = window.open('', '_blank');
    try {
      const response = await fetch(`${(import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api$/, '')}${url}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('authToken')}`, 'X-Admin-Email-Session': sessionStorage.getItem('adminEmailSession') || '', 'X-Admin-Session': sessionStorage.getItem('adminSession') || '' } });
      if (!response.ok) throw new Error('No se pudo abrir el comprobante');
      const objectUrl = URL.createObjectURL(await response.blob()); if (tab) tab.location.href = objectUrl; setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) { tab?.close(); setMessage((error as Error).message); }
  };
  const decide = async (decision: 'approve' | 'reject') => {
    if (note.trim().length < 5) { setMessage('Escribe una nota de al menos 5 caracteres.'); return; }
    if (!window.confirm(decision === 'approve' ? '¿Confirmas que la transferencia llegó a la cuenta indicada?' : '¿Confirmas el rechazo?')) return;
    setBusy(true); setMessage('');
    try { await adminRequest(`/payments/transfers/${id}/${decision}`, { method: 'POST', body: JSON.stringify({ note }) }); setMessage(decision === 'approve' ? 'Pago aprobado' : 'Pago rechazado'); reload(); onChanged(); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  const reconcile = async () => {
    if (!window.confirm('¿Consultar este pago directamente en Kushki?')) return;
    setBusy(true); setMessage('');
    try { const result = await adminRequest<{ status?: string; payment: Payment }>(`/payments/cards/${id}/reconcile`, { method: 'POST' }); setMessage(result.status ? `Estado en Kushki: ${result.status}` : 'Pago conciliado'); reload(); onChanged(); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 bg-black/50 z-50 p-4 overflow-auto" role="dialog" aria-modal="true"><div className="bg-white max-w-2xl mx-auto my-8 p-6 rounded-xl shadow-xl"><button onClick={onClose} className="float-right underline">Cerrar</button><h2 className="text-2xl font-bold mb-4">Detalle del pago</h2>
    {error && <p className="text-red-600">{error}</p>}{loading ? 'Cargando...' : data && <div className="space-y-3 text-sm"><p><b>Referencia:</b> {data.reference}</p><p><b>Pagador:</b> {data.payer.fullName} ({data.payer.email})</p><p><b>Monto:</b> {money(data.amount,data.currency)} · <b>Estado:</b> {status[data.status] || data.status}</p>
      {data.possibleDuplicates ? <p className="bg-amber-100 p-3 rounded">Posibles comprobantes o referencias repetidas: {data.possibleDuplicates}. Revisa antes de aprobar.</p> : null}
      {data.bankAccounts?.map(a => <p key={a.accountNumber} className="bg-gray-50 p-3 rounded"><b>Cuenta de destino:</b> {a.bankName} · {a.accountName} · {a.accountNumber}</p>)}
      {data.transfers?.map(t => <div key={t.id} className="border p-3 rounded"><p><b>Banco origen:</b> {t.bankName} · <b>Referencia declarada:</b> {t.transferReference}</p><p><b>Monto declarado:</b> {t.declaredAmount === null ? 'No registrado (comprobante anterior)' : money(t.declaredAmount, data.currency)}</p>{t.declaredAmount !== null && Number(t.declaredAmount) !== Number(data.amount) && <p className="text-red-700 font-semibold">El monto declarado no coincide con el pago esperado. Rechaza este comprobante.</p>}<p>Transferida: {date(t.transferredAt)} · Enviada: {date(t.createdAt)}</p><p>Revisor: {t.reviewer?.fullName || 'Pendiente'} · {t.reviewNote || ''}</p><button className="underline text-blue-700" onClick={() => openProof(t.proofUrl)}>Ver comprobante</button></div>)}
      {canReview && data.method === 'card' && data.status !== 'allocated' && <button disabled={busy} className={button} onClick={reconcile}>Conciliar con Kushki</button>}
      {!!data.allocations?.length && <div><b>Asignaciones:</b> {data.allocations.map(a => <p key={a.id}>{a.subjectId} · {money(a.amount,data.currency)}</p>)}</div>}
      {!!data.events?.length && <div><b>Eventos:</b> {data.events.map(e => <p key={e.id}>{date(e.createdAt)} · {e.source} · {e.type}</p>)}</div>}
      {canReview && data.method === 'transfer' && data.status === 'under_review' && <div className="border-t pt-4"><label className="block font-semibold mb-1">Nota de revisión (obligatoria)</label><textarea className={`${input} w-full`} rows={3} value={note} onChange={e => setNote(e.target.value)} /><div className="flex gap-2 mt-2"><button disabled={busy} className={button} onClick={() => decide('approve')}>Aprobar y desbloquear</button><button disabled={busy} className="bg-red-700 text-white px-4 py-2 rounded-lg" onClick={() => decide('reject')}>Rechazar</button></div></div>}{message && <p className="font-medium">{message}</p>}</div>}
  </div></div>;
}

function Users({ role, permissions }: { role: 'client' | 'pro'; permissions: Set<string> }) {
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, loading, reload } = useData<List<{ id: string; email: string; fullName: string; active: boolean; createdAt: string; professionalProfile?: { verified: boolean }; _count: { serviceRequests: number } }>>(`/users?role=${role}&search=${encodeURIComponent(search)}&page=${page}`);
  const change = async (id: string, active: boolean) => { const reason = window.prompt(active ? 'Motivo de reactivación' : 'Motivo de suspensión'); if (!reason) return; try { await adminRequest(`/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ active, reason }) }); reload(); } catch (e) { alert((e as Error).message); } };
  const verify = async (id: string, verified: boolean) => { if (!window.confirm(verified ? '¿Verificar profesional?' : '¿Revocar verificación?')) return; try { await adminRequest(`/professionals/${id}/verify`, { method: 'POST', body: JSON.stringify({ verified }) }); reload(); } catch (e) { alert((e as Error).message); } };
  return <section><h1 className="text-3xl font-bold mb-5">{role === 'pro' ? 'Profesionales' : 'Clientes'}</h1><input className={`${input} mb-4`} placeholder="Nombre o correo" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />{error && <p className="text-red-600">{error}</p>}{loading ? 'Cargando...' : <><div className="bg-white border rounded-xl overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left"><th className="p-3">Nombre</th><th>Correo</th><th>Estado</th><th>{role === 'pro' ? 'Verificación' : 'Solicitudes'}</th><th>Alta</th><th></th></tr></thead><tbody>{data?.items.map(u => <tr key={u.id} className="border-t"><td className="p-3">{u.fullName}</td><td>{u.email}</td><td>{u.active ? 'Activo' : 'Suspendido'}</td><td>{role === 'pro' ? (u.professionalProfile?.verified ? 'Verificado' : 'Pendiente') : u._count.serviceRequests}</td><td>{date(u.createdAt)}</td><td className="space-x-2"><button className="underline" onClick={() => setSelected(u.id)}>Detalle</button>{permissions.has('users.manage') && <button className="underline" onClick={() => change(u.id, !u.active)}>{u.active ? 'Suspender' : 'Reactivar'}</button>}{role === 'pro' && permissions.has('professionals.verify') && <button className="underline" onClick={() => verify(u.id, !u.professionalProfile?.verified)}>{u.professionalProfile?.verified ? 'Revocar' : 'Verificar'}</button>}</td></tr>)}</tbody></table></div><Pager page={page} total={data?.total || 0} onPage={setPage} /></>}{selected && <UserDetail id={selected} onClose={() => setSelected(null)} />}</section>;
}

function UserDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, loading } = useData<{ fullName: string; email: string; phone?: string; role: string; active: boolean; professionalProfile?: { businessName?: string; bio?: string; categories: string[]; verified: boolean; documentType?: string; documentId?: string }; serviceRequests: Array<{ id: string; title: string; status: string }>; purchases: Array<{ id: string; request: { title: string }; status: string; costUSD: number }>; payments: Array<{ id: string; status: string; amount: string }> }>(`/users/${id}`);
  return <div className="fixed inset-0 bg-black/50 z-50 p-4 overflow-auto" role="dialog" aria-modal="true"><div className="bg-white max-w-2xl mx-auto my-8 p-6 rounded-xl shadow-xl"><button onClick={onClose} className="float-right underline">Cerrar</button><h2 className="text-2xl font-bold mb-4">Perfil</h2>{error && <p className="text-red-600">{error}</p>}{loading ? 'Cargando...' : data && <div className="space-y-4 text-sm"><p><b>{data.fullName}</b> · {data.email} · {data.phone || 'Sin teléfono'} · {data.active ? 'Activo' : 'Suspendido'}</p>{data.professionalProfile && <div><h3 className="font-bold">Profesional</h3><p>{data.professionalProfile.businessName} · {data.professionalProfile.verified ? 'Verificado' : 'Pendiente'}</p><p>{data.professionalProfile.bio}</p><p>Categorías: {data.professionalProfile.categories.join(', ')}</p><p>Documento: {data.professionalProfile.documentType || 'No registrado'} {data.professionalProfile.documentId || ''}</p></div>}<div><h3 className="font-bold">Solicitudes</h3>{data.serviceRequests.map(r => <p key={r.id}>{r.title} · {r.status}</p>)}</div><div><h3 className="font-bold">Leads adquiridos</h3>{data.purchases.map(p => <p key={p.id}>{p.request.title} · {p.status} · ${p.costUSD.toFixed(2)}</p>)}</div><div><h3 className="font-bold">Pagos</h3>{data.payments.map(p => <p key={p.id}>{p.id} · {p.status} · {money(p.amount)}</p>)}</div></div>}</div></div>;
}

function Admins({ permissions }: { permissions: Set<string> }) {
  const { data, error, loading, reload } = useData<Array<{ id: string; status: string; user: { email: string; fullName: string }; role: { id: string; code: string } }>>('/memberships');
  const roles = useData<Array<{ id: string; code: string; name: string }>>('/roles');
  const [email, setEmail] = useState(''); const [roleId, setRoleId] = useState(''); const [message, setMessage] = useState('');
  const invite = async () => { try { const result = await adminRequest<{ delivered: boolean; requiresEmailDelivery: boolean; acceptUrl?: string }>('/invitations', { method: 'POST', body: JSON.stringify({ email, roleId }) }); setMessage(result.delivered ? 'Invitación enviada por correo.' : result.requiresEmailDelivery ? 'No se pudo enviar el correo. Reintenta la invitación.' : `Invitación creada. Comparte ${result.acceptUrl || adminUrl()} con el usuario.`); reload(); } catch (e) { setMessage((e as Error).message); } };
  const change = async (id: string, patch: object) => { try { await adminRequest(`/memberships/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); reload(); } catch (e) { alert((e as Error).message); } };
  return <section><h1 className="text-3xl font-bold mb-5">Administradores</h1>{error && <p className="text-red-600">{error}</p>}{permissions.has('admins.invite') && <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-2 mb-5"><input className={input} type="email" placeholder="Correo verificado del tenant" value={email} onChange={e => setEmail(e.target.value)} /><select className={input} value={roleId} onChange={e => setRoleId(e.target.value)}><option value="">Selecciona un rol</option>{roles.data?.filter(r => r.code !== 'tenant_owner').map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select><button className={button} onClick={invite}>Invitar</button>{message && <p className="w-full text-sm">{message}</p>}</div>}{loading ? 'Cargando...' : <div className="bg-white border rounded-xl overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left"><th className="p-3">Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>{data?.map(m => <tr key={m.id} className="border-t"><td className="p-3">{m.user.fullName}</td><td>{m.user.email}</td><td>{permissions.has('admins.manage') && m.role.code !== 'tenant_owner' ? <select className={input} value={m.role.id} onChange={e => change(m.id, { roleId: e.target.value })}>{roles.data?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select> : m.role.code}</td><td>{m.status}</td><td>{permissions.has('admins.manage') && m.role.code !== 'tenant_owner' && <button className="underline" onClick={() => change(m.id, { status: m.status === 'active' ? 'revoked' : 'active' })}>{m.status === 'active' ? 'Revocar' : 'Activar'}</button>}</td></tr>)}</tbody></table></div>}</section>;
}

function Roles({ permissions }: { permissions: Set<string> }) {
  type Role = { id: string; code: string; name: string; isSystem: boolean; permissions: Array<{ permission: { code: string } }> };
  const { data, error, loading, reload } = useData<Role[]>('/roles');
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [message, setMessage] = useState('');
  const allCodes = [...new Set(data?.flatMap(r => r.permissions.map(p => p.permission.code)) || [])].filter(c => permissions.has(c)).sort();
  const create = async () => { try { await adminRequest('/roles', { method: 'POST', body: JSON.stringify({ code, name, permissions: [] }) }); setCode(''); setName(''); setMessage('Rol creado'); reload(); } catch (e) { setMessage((e as Error).message); } };
  return <section><h1 className="text-3xl font-bold mb-5">Roles y permisos</h1>{error && <p className="text-red-600">{error}</p>}{permissions.has('roles.manage') && <div className="bg-white border rounded-xl p-4 mb-5 flex flex-wrap gap-2"><input className={input} placeholder="Código (ej. supervisor)" value={code} onChange={e => setCode(e.target.value)} /><input className={input} placeholder="Nombre del rol" value={name} onChange={e => setName(e.target.value)} /><button className={button} onClick={create}>Crear rol</button>{message && <p className="w-full text-sm">{message}</p>}</div>}{loading ? 'Cargando...' : <div className="grid gap-4">{data?.map(r => <RoleCard key={r.id} role={r} allCodes={allCodes} canEdit={permissions.has('roles.manage')} onChanged={reload} />)}</div>}</section>;
}

function RoleCard({ role, allCodes, canEdit, onChanged }: { role: { id: string; name: string; isSystem: boolean; permissions: Array<{ permission: { code: string } }> }; allCodes: string[]; canEdit: boolean; onChanged: () => void }) {
  const [codes, setCodes] = useState(role.permissions.map(p => p.permission.code)); const [message, setMessage] = useState('');
  useEffect(() => setCodes(role.permissions.map(p => p.permission.code)), [role]);
  const save = async () => { try { await adminRequest(`/roles/${role.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: codes }) }); setMessage('Permisos guardados'); onChanged(); } catch (e) { setMessage((e as Error).message); } };
  return <div className="bg-white border rounded-xl p-5"><h2 className="font-bold text-lg">{role.name} {role.isSystem && <span className="text-xs font-normal text-gray-500">Rol del sistema · solo lectura</span>}</h2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">{(canEdit && !role.isSystem ? allCodes : role.permissions.map(p => p.permission.code)).map(code => <label key={code} className="text-sm flex gap-2 items-center"><input type="checkbox" disabled={!canEdit || role.isSystem} checked={codes.includes(code)} onChange={e => setCodes(e.target.checked ? [...codes,code] : codes.filter(v => v !== code))} />{code}</label>)}</div>{canEdit && !role.isSystem && <button className={`${button} mt-4`} onClick={save}>Guardar permisos</button>}{message && <p className="text-sm mt-2">{message}</p>}</div>;
}

function Settings({ permissions }: { permissions: Set<string> }) {
  type Account = { bankName: string; accountName: string; accountNumber: string; accountType?: string };
  const { data, error, loading, reload } = useData<{ name: string; cardConfigured: boolean; settings: { maxProfessionalsPerLead: number; leadFeeRate: number; leadMinCostUSD: number; transferExpiryHours: number; cardEnabled: boolean; bankAccounts: Account[] } }>('/settings');
  const [limit, setLimit] = useState(4);
  const [rate, setRate] = useState(6);
  const [minimum, setMinimum] = useState(3);
  const [hours, setHours] = useState(72);
  const [cardEnabled, setCardEnabled] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [message, setMessage] = useState('');
  const canEdit = permissions.has('settings.manage');
  useEffect(() => {
    if (!data) return;
    setLimit(data.settings.maxProfessionalsPerLead);
    setRate(data.settings.leadFeeRate * 100);
    setMinimum(data.settings.leadMinCostUSD);
    setHours(data.settings.transferExpiryHours);
    setCardEnabled(data.settings.cardEnabled);
    setAccounts(data.settings.bankAccounts || []);
  }, [data]);
  const updateAccount = (index: number, field: keyof Account, value: string) => setAccounts(current => current.map((account, i) => i === index ? { ...account, [field]: value } : account));
  const save = async () => {
    try {
      await adminRequest('/settings', { method: 'PUT', body: JSON.stringify({ maxProfessionalsPerLead: limit, leadFeeRate: rate / 100, leadMinCostUSD: minimum, transferExpiryHours: hours, cardEnabled, bankAccounts: accounts }) });
      setMessage('Guardado'); reload();
    } catch (e) { setMessage((e as Error).message); }
  };
  return <section><h1 className="text-3xl font-bold mb-5">Configuración</h1>{error && <p className="text-red-600">{error}</p>}{loading ? 'Cargando...' : <div className="bg-white border rounded-xl p-5 max-w-xl space-y-4">
    <p className="font-bold">{data?.name}</p>
    <label className="block">Cupo de profesionales por solicitud<input className={`${input} block mt-1 w-full`} type="number" min="1" max="20" value={limit} onChange={e => setLimit(Number(e.target.value))} disabled={!canEdit} /></label>
    <label className="block">Comisión por lead (%)<input className={`${input} block mt-1 w-full`} type="number" min="0.1" max="100" step="0.1" value={rate} onChange={e => setRate(Number(e.target.value))} disabled={!canEdit} /></label>
    <label className="block">Costo mínimo (USD)<input className={`${input} block mt-1 w-full`} type="number" min="0" step="0.01" value={minimum} onChange={e => setMinimum(Number(e.target.value))} disabled={!canEdit} /></label>
    <label className="block">Vencimiento de transferencia (horas)<input className={`${input} block mt-1 w-full`} type="number" min="1" max="720" value={hours} onChange={e => setHours(Number(e.target.value))} disabled={!canEdit} /></label>
    <label className="flex gap-2 items-center"><input type="checkbox" checked={cardEnabled} onChange={e => setCardEnabled(e.target.checked)} disabled={!canEdit || !data?.cardConfigured} />Habilitar tarjeta con Kushki</label>
    {!data?.cardConfigured && <p className="text-sm text-gray-500">Faltan credenciales y habilitación del proveedor en este ambiente.</p>}
    <div className="flex justify-between items-center"><h2 className="font-bold">Cuentas receptoras</h2>{canEdit && accounts.length < 5 && <button className="underline text-sm" onClick={() => setAccounts([...accounts, { bankName: '', accountName: '', accountNumber: '' }])}>Añadir cuenta</button>}</div>
    {accounts.map((account, index) => <div key={index} className="border rounded-lg p-3 space-y-2">
      {([['Banco','bankName'],['Titular','accountName'],['Número de cuenta','accountNumber'],['Tipo de cuenta','accountType']] as const).map(([label, field]) => <label key={field} className="block text-sm">{label}<input className={`${input} block mt-1 w-full`} value={account[field] || ''} onChange={e => updateAccount(index, field, e.target.value)} disabled={!canEdit} /></label>)}
      {canEdit && <button className="text-red-700 underline text-sm" onClick={() => setAccounts(accounts.filter((_, i) => i !== index))}>Quitar cuenta</button>}
    </div>)}
    {!accounts.length && <p className="text-sm text-gray-500">Sin cuentas configuradas. Las transferencias permanecerán deshabilitadas.</p>}
    {canEdit && <button className={button} onClick={save}>Guardar</button>}{message && <p>{message}</p>}
  </div>}</section>;
}
function Audit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const params = new URLSearchParams({ page: String(page), action, actorId, entityType, entityId, dateFrom, dateTo });
  const { data, error, loading } = useData<List<{ id: string; action: string; entityType: string; entityId: string; actorId: string; createdAt: string; before?: object; after?: object }>>(`/audit-logs?${params}`);
  return <section><h1 className="text-3xl font-bold mb-5">Auditoría</h1>
    <div className="flex flex-wrap gap-2 mb-4">
      {([['Acción',action,setAction],['Actor ID',actorId,setActorId],['Recurso',entityType,setEntityType],['Recurso ID',entityId,setEntityId]] as const).map(([label,value,setter]) => <input key={label} className={input} placeholder={label} value={value} onChange={e => { setter(e.target.value); setPage(1); }} />)}
      <label className="text-xs">Desde<input className={`${input} block`} type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} /></label>
      <label className="text-xs">Hasta<input className={`${input} block`} type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} /></label>
    </div>
    {error && <p className="text-red-600">{error}</p>}{loading ? 'Cargando...' : <><div className="bg-white border rounded-xl divide-y">{data?.items.map(a => <details key={a.id} className="p-4 text-sm"><summary className="cursor-pointer font-medium">{a.action} · {a.entityType} · {date(a.createdAt)}</summary><p>Actor: {a.actorId} · Recurso: {a.entityId}</p><pre className="whitespace-pre-wrap text-xs">{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre></details>)}</div><Pager page={page} total={data?.total || 0} onPage={setPage} /></>}
  </section>;
}
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (n: number) => void }) { return <div className="flex items-center gap-3 mt-4 text-sm"><button className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button><span>Página {page} · {total} registros</span><button className={button} disabled={page * 20 >= total} onClick={() => onPage(page + 1)}>Siguiente</button></div>; }
