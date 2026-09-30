import React, { useState, useEffect } from 'react';
import { Receipt, Download, FileText, DollarSign, ExternalLink } from 'lucide-react';
import { PaymentHistoryItem } from '@/domain/types';
import { getPaymentHistory } from '@/services/leadService';
import { listMyCards, listMyTransfers, TransferPayment } from '@/services/transferService';
import { Link } from 'react-router';

export function WalletBilling() {
  const [activeTab, setActiveTab] = useState<'payments' | 'billing'>('payments');
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [transfers, setTransfers] = useState<Array<TransferPayment & { metadata: { requestId?: string } }>>([]);
  const [cards, setCards] = useState<Array<TransferPayment & { metadata: { requestId?: string } }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPayments();
    listMyTransfers().then(setTransfers).catch(() => setTransfers([]));
    listMyCards().then(setCards).catch(() => setCards([]));
    const timer = window.setInterval(() => listMyCards().then(setCards).catch(() => {}), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    const history = await getPaymentHistory();
    setPayments(history);
    setLoading(false);
  };

  const totalSpent = payments.reduce((acc, p) => acc + p.costUSD, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-[#101828]">Facturación y Pagos</h1>
        <p className="text-gray-500 mt-1">Revisa tus pagos realizados y tus datos de facturación SRI.</p>
      </div>

      {transfers.length > 0 && <div className="bg-white border rounded-xl p-5"><h2 className="font-bold text-lg mb-3">Mis transferencias</h2><div className="space-y-2">{transfers.map(p => <div key={p.id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><span>{p.reference} · ${Number(p.amount).toFixed(2)} USD · {p.status}</span><Link className="underline text-blue-700" to={`/dashboard/transfer/${p.metadata.requestId || ''}?paymentId=${p.id}`}>Ver estado</Link></div>)}</div></div>}
      {cards.length > 0 && <div className="bg-white border rounded-xl p-5"><h2 className="font-bold text-lg mb-3">Mis pagos con tarjeta</h2><p className="text-sm text-gray-500 mb-2">El contacto aparece desbloqueado cuando el proveedor confirma el pago.</p><div className="space-y-2">{cards.map(p => <div key={p.id} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><span>{p.reference} · ${Number(p.amount).toFixed(2)} USD · {p.status === 'allocated' ? 'Contacto desbloqueado' : p.status === 'approved' ? 'Pago recibido, requiere revisión' : p.status === 'pending_provider' ? 'Esperando confirmación' : p.status === 'expired' ? 'Vencido' : p.status}</span>{p.status === 'allocated' && <Link className="underline text-blue-700" to="/dashboard/contacts">Ver contacto</Link>}</div>)}</div></div>}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'payments' ? 'border-[#101828] text-[#101828]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Historial de Pagos
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${activeTab === 'billing' ? 'border-[#101828] text-[#101828]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Datos de Facturación
        </button>
      </div>

      {activeTab === 'payments' && (
        <div className="space-y-6">
          {/* Resumen de gasto */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#101828] rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full"></div>
              <p className="text-gray-400 font-medium mb-1">Total Pagado en Contactos</p>
              <h2 className="text-5xl font-bold text-[#FFCA0C] mb-2">
                ${totalSpent.toFixed(2)}
                <span className="text-xl text-gray-300 font-normal ml-2">USD</span>
              </h2>
              <p className="text-gray-400 text-sm">{payments.length} contacto{payments.length !== 1 ? 's' : ''} desbloqueado{payments.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex items-center gap-4">
              <div className="p-4 bg-green-50 rounded-xl">
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Tasa de comisión</p>
                <p className="text-2xl font-bold text-[#101828]">Variable</p>
                <p className="text-sm text-gray-400">del presupuesto estimado del trabajo</p>
              </div>
            </div>
          </div>

          {/* Tabla de historial */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-[#101828]">Pagos Realizados</h3>
              <button
                id="btn-export-payments"
                className="text-sm text-blue-600 font-medium hover:underline flex items-center gap-1"
                onClick={() => alert('Funcionalidad de exportación próximamente.')}
              >
                <Download className="w-4 h-4" /> Exportar
              </button>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-[#101828] border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-gray-500">Cargando historial...</p>
              </div>
            ) : payments.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-[#101828] mb-1">No hay pagos registrados</p>
                <p className="text-sm">Cuando desbloquees un contacto, aparecerá aquí.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                      <th className="p-4 font-bold">Fecha</th>
                      <th className="p-4 font-bold">Descripción</th>
                      <th className="p-4 font-bold">Ubicación</th>
                      <th className="p-4 font-bold">Ref. PayPhone</th>
                      <th className="p-4 font-bold text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                          {new Date(p.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="p-4 text-sm font-medium text-[#101828]">{p.description}</td>
                        <td className="p-4 text-sm text-gray-500">{p.location}</td>
                        <td className="p-4 text-sm text-gray-400 font-mono text-xs">
                          {p.payphoneTransactionId || '—'}
                        </td>
                        <td className="p-4 text-sm font-bold text-right text-green-700 whitespace-nowrap">
                          ${p.costUSD.toFixed(2)} USD
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td colSpan={4} className="p-4 text-sm font-bold text-[#101828]">Total</td>
                      <td className="p-4 text-sm font-bold text-right text-[#101828]">${totalSpent.toFixed(2)} USD</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-[#101828]">Datos Fiscales (SRI)</h3>
              <p className="text-sm text-gray-500">Información para la emisión de facturas electrónicas.</p>
            </div>
          </div>

          <form className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-[#404145]">Tipo de Identificación</label>
                <select
                  id="billing-id-type"
                  className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]"
                >
                  <option>RUC</option>
                  <option>Cédula</option>
                  <option>Pasaporte</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-[#404145]">Número de Identificación</label>
                <input id="billing-id-number" type="text" placeholder="Ej: 1712345678001" className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-[#404145]">Razón Social / Nombres Completos</label>
              <input id="billing-business-name" type="text" placeholder="Ej: Servicios Profesionales S.A." className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]" />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-[#404145]">Dirección Matriz</label>
              <input id="billing-address" type="text" placeholder="Av. Principal y Secundaria" className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-[#404145]">Correo Electrónico (para facturas)</label>
                <input id="billing-email" type="email" placeholder="facturacion@ejemplo.com" className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-[#404145]">Teléfono</label>
                <input id="billing-phone" type="tel" placeholder="0991234567" className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]" />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <button
                id="btn-save-billing"
                type="button"
                className="bg-[#101828] text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Guardar Datos de Facturación
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
