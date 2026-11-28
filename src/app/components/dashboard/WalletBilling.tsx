import React, { useState, useEffect } from 'react';
import { Receipt, Download, FileText, DollarSign } from 'lucide-react';
import { PaymentHistoryItem } from '@/domain/types';
import { getPaymentHistory } from '@/services/leadService';
import { listMyCards, listMyTransfers, TransferPayment } from '@/services/transferService';
import { Link } from 'react-router';
import { BillingDetails, downloadReceipt, emptyBillingDetails, getBillingDetails, saveBillingDetails } from '@/services/billingService';

export function WalletBilling() {
  const [activeTab, setActiveTab] = useState<'payments' | 'billing'>('payments');
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [transfers, setTransfers] = useState<Array<TransferPayment & { metadata: { requestId?: string } }>>([]);
  const [cards, setCards] = useState<Array<TransferPayment & { metadata: { requestId?: string } }>>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<BillingDetails>(emptyBillingDetails);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [billingSuccess, setBillingSuccess] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const receiptFromEmail = new URLSearchParams(window.location.search).get('receipt');

  useEffect(() => {
    loadPayments();
    listMyTransfers().then(setTransfers).catch(() => setTransfers([]));
    listMyCards().then(setCards).catch(() => setCards([]));
    getBillingDetails().then(data => { if (data) setBilling(data); }).catch(error => setBillingError((error as Error).message)).finally(() => setBillingLoading(false));
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
  const updateBilling = (key: keyof BillingDetails, value: string) => {
    setBilling(current => ({ ...current, [key]: value }));
    setBillingSuccess('');
  };
  const saveBilling = async (event: React.FormEvent) => {
    event.preventDefault(); setBillingError(''); setBillingSuccess(''); setBillingSaving(true);
    try { setBilling(await saveBillingDetails(billing)); setBillingSuccess('Datos guardados. Se usarán en los próximos recibos; los anteriores no cambian.'); }
    catch (error) { setBillingError((error as Error).message); }
    finally { setBillingSaving(false); }
  };
  const getReceipt = async (paymentId: string) => {
    setReceiptError(''); setDownloadingId(paymentId);
    try { await downloadReceipt(paymentId); }
    catch (error) { setReceiptError((error as Error).message); }
    finally { setDownloadingId(null); }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-[#101828]">Facturación y Pagos</h1>
        <p className="text-gray-500 mt-1">Revisa tus pagos y configura los datos que aparecerán en los próximos recibos. Los recibos no son facturas tributarias del SRI.</p>
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
          {receiptFromEmail && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">¿Llegaste desde el correo? Busca el pago indicado y pulsa «Descargar recibo». También encontrarás el PDF adjunto al mensaje.</p>}
          {receiptError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{receiptError}</p>}
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
              <span className="text-xs text-gray-500">Recibos individuales en PDF</span>
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
                       <th className="p-4 font-bold">Referencia</th>
                       <th className="p-4 font-bold text-right">Monto</th>
                       <th className="p-4 font-bold">Recibo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map((p) => (
                      <tr key={p.id} className={receiptFromEmail === p.id ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                        <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                          {new Date(p.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="p-4 text-sm font-medium text-[#101828]">{p.description}</td>
                        <td className="p-4 text-sm text-gray-500">{p.location}</td>
                        <td className="p-4 text-sm text-gray-400 font-mono text-xs">
                          {p.reference || p.payphoneTransactionId || '—'}
                        </td>
                        <td className="p-4 text-sm font-bold text-right text-green-700 whitespace-nowrap">
                          ${p.costUSD.toFixed(2)} USD
                        </td>
                        <td className="p-4 text-sm"><button type="button" disabled={downloadingId === p.id} onClick={() => getReceipt(p.id)} className="inline-flex items-center gap-1 text-blue-700 underline disabled:opacity-50"><Download className="h-4 w-4" />{downloadingId === p.id ? 'Descargando...' : 'Descargar recibo'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                       <td colSpan={4} className="p-4 text-sm font-bold text-[#101828]">Total</td>
                       <td className="p-4 text-sm font-bold text-right text-[#101828]">${totalSpent.toFixed(2)} USD</td>
                       <td />
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
               <h3 className="font-bold text-lg text-[#101828]">Datos para recibos</h3>
               <p className="text-sm text-gray-500">Datos declarados por ti; no generan facturas electrónicas del SRI. Los próximos recibos se enviarán a tu correo de cuenta, con copia al correo de facturación si es distinto.</p>
            </div>
          </div>

           <form className="space-y-5" onSubmit={saveBilling}>
             {billingLoading && <p role="status">Cargando datos...</p>}
             {billingError && <p role="alert" className="text-sm text-red-700">{billingError}</p>}
             {billingSuccess && <p role="status" className="text-sm text-green-700">{billingSuccess}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                 <label htmlFor="billing-id-type" className="block text-sm font-semibold text-[#404145]">Tipo de Identificación</label>
                <select
                  id="billing-id-type"
                  value={billing.idType} onChange={event => updateBilling('idType', event.target.value)}
                  className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]"
                >
                   <option value="ruc">RUC</option>
                   <option value="cedula">Cédula</option>
                   <option value="pasaporte">Pasaporte</option>
                </select>
              </div>
              <div className="space-y-1.5">
                 <label htmlFor="billing-id-number" className="block text-sm font-semibold text-[#404145]">Número de Identificación</label>
                 <input id="billing-id-number" type="text" required maxLength={32} value={billing.idNumber} onChange={event => updateBilling('idNumber', event.target.value)} placeholder="Ej: 1712345678001" className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]" />
              </div>
            </div>

            <div className="space-y-1.5">
               <label htmlFor="billing-business-name" className="block text-sm font-semibold text-[#404145]">Razón Social / Nombres Completos</label>
               <input id="billing-business-name" type="text" required maxLength={160} value={billing.legalName} onChange={event => updateBilling('legalName', event.target.value)} placeholder="Ej: Servicios Profesionales S.A." className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]" />
            </div>

            <div className="space-y-1.5">
               <label htmlFor="billing-address" className="block text-sm font-semibold text-[#404145]">Dirección declarada</label>
               <input id="billing-address" type="text" required maxLength={255} value={billing.address} onChange={event => updateBilling('address', event.target.value)} placeholder="Av. Principal y Secundaria" className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                 <label htmlFor="billing-email" className="block text-sm font-semibold text-[#404145]">Correo para copia del recibo</label>
                 <input id="billing-email" type="email" required maxLength={254} value={billing.email} onChange={event => updateBilling('email', event.target.value)} placeholder="facturacion@ejemplo.com" className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]" />
              </div>
              <div className="space-y-1.5">
                 <label htmlFor="billing-phone" className="block text-sm font-semibold text-[#404145]">Teléfono</label>
                 <input id="billing-phone" type="tel" required maxLength={40} value={billing.phone} onChange={event => updateBilling('phone', event.target.value)} placeholder="0991234567" className="w-full border border-gray-300 rounded-md px-4 py-2.5 focus:outline-none focus:border-[#101828]" />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <button
                id="btn-save-billing"
                 type="submit" disabled={billingSaving || billingLoading}
                className="bg-[#101828] text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-800 transition-colors"
              >
                 {billingSaving ? 'Guardando...' : 'Guardar datos para recibos'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
