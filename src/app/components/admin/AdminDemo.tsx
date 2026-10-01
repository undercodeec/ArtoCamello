import React, { useState } from 'react';
import logo from '@/assets/logoartocamello.png';

const sections = ['Inicio', 'Transferencias', 'Todos los pagos', 'Clientes', 'Profesionales', 'Administradores', 'Roles y permisos', 'Configuración', 'Auditoría'];

export function AdminDemo() {
  const [section, setSection] = useState('Inicio');
  return <div className="min-h-screen bg-[#f6f7f9] text-[#101828] lg:flex">
    <aside className="lg:w-64 bg-white border-r border-gray-200 p-5 lg:min-h-screen">
      <img src={logo} alt="ArtoCamello" className="w-40 mb-5" />
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">Vista de demostración · administrador</p>
      <nav className="grid grid-cols-2 lg:grid-cols-1 gap-1">{sections.map(item => <button key={item} onClick={() => setSection(item)} className={`text-left px-3 py-2 rounded-lg text-sm ${section === item ? 'bg-[#FFCA0C] font-bold' : 'hover:bg-gray-100'}`}>{item}</button>)}</nav>
    </aside>
    <main className="flex-1 p-4 md:p-8 max-w-[1500px] min-w-0">
      <div className="flex flex-wrap gap-3 justify-between items-start mb-6"><div><h1 className="text-3xl font-bold">{section}</h1><p className="text-gray-600 mt-1">Datos de ejemplo para revisar la interfaz.</p></div><span className="bg-amber-100 text-amber-900 px-3 py-1 rounded-full text-sm font-medium">Modo demo</span></div>
      {section === 'Inicio' ? <DashboardDemo /> : <SectionDemo section={section} />}
    </main>
  </div>;
}

function DashboardDemo() {
  const cards = [['Transferencias por revisar', '12'], ['Pagos aprobados', '148'], ['Usuarios nuevos (30 días)', '37'], ['Profesionales por verificar', '8']];
  return <><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{cards.map(([label, value]) => <div key={label} className="bg-white rounded-xl p-5 border"><p className="text-gray-500 text-sm">{label}</p><strong className="text-3xl">{value}</strong></div>)}</div>
    <div className="grid lg:grid-cols-3 gap-4 mt-6"><div className="bg-white rounded-xl border p-5 lg:col-span-2"><h2 className="text-xl font-semibold mb-4">Actividad reciente</h2>{['Pago confirmado para diseño de interiores', 'Nueva transferencia enviada para revisión', 'Profesional verificado', 'Administrador actualizado'].map((item, index) => <div key={item} className="border-t py-3 flex justify-between text-sm"><span>{item}</span><span className="text-gray-500">hace {index + 1} h</span></div>)}</div><div className="bg-white rounded-xl border p-5"><h2 className="text-xl font-semibold mb-4">Estado de pagos</h2><div className="space-y-3 text-sm"><p className="flex justify-between"><span>Confirmados</span><strong>82%</strong></p><div className="h-2 rounded bg-gray-100"><div className="h-2 rounded bg-[#FFCA0C] w-[82%]" /></div><p className="flex justify-between"><span>En revisión</span><strong>12%</strong></p><div className="h-2 rounded bg-gray-100"><div className="h-2 rounded bg-[#101828] w-[12%]" /></div></div></div></div>
  </>;
}

function SectionDemo({ section }: { section: string }) {
  return <div className="bg-white border rounded-xl overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left"><th className="p-3">Referencia</th><th>Usuario</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>{['AR-2026-1048', 'AR-2026-1047', 'AR-2026-1046', 'AR-2026-1045'].map((reference, index) => <tr key={reference} className="border-t"><td className="p-3 font-mono">{reference}</td><td>{section === 'Administradores' ? 'María Paredes' : 'Carlos Mena'}</td><td><span className={`px-2 py-1 rounded-full ${index === 0 ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-800'}`}>{index === 0 ? 'Por revisar' : 'Activo'}</span></td><td>01 oct. 2026</td><td><button className="underline text-blue-700">Ver detalle</button></td></tr>)}</tbody></table></div>;
}
