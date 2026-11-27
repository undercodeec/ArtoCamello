import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { BankAccount, TransferPayment, createTransferIntent, getTransferPayment, submitTransferProof } from '@/services/transferService';

const statusLabels: Record<string, string> = {
  awaiting_transfer: 'Esperando comprobante',
  under_review: 'Comprobante en revisión',
  rejected: 'Comprobante rechazado',
  allocated: 'Pago validado y contacto habilitado',
  expired: 'Referencia vencida',
};

export function TransferPaymentPage() {
  const { requestId = '' } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const paymentId = params.get('paymentId');
  const [payment, setPayment] = useState<TransferPayment | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountLast4, setAccountLast4] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [transferredAt, setTransferredAt] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    setError('');
    const load = paymentId
      ? getTransferPayment(paymentId).then(data => ({ payment: data, bankAccounts: data.bankAccounts || [] }))
      : createTransferIntent(requestId);
    load.then(data => {
      if (!active) return;
      setPayment(data.payment);
      setAccounts(data.bankAccounts);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudo preparar la transferencia.');
    });
    return () => { active = false; };
  }, [requestId, paymentId]);

  const refresh = async () => {
    if (!payment) return;
    setError('');
    try {
      const updated = await getTransferPayment(payment.id);
      setPayment(updated);
      setAccounts(updated.bankAccounts || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el estado.');
    }
  };

  const renew = async () => {
    setError('');
    try {
      const data = await createTransferIntent(requestId);
      setPayment(data.payment);
      setAccounts(data.bankAccounts);
      navigate(`/dashboard/transfer/${requestId}?paymentId=${data.payment.id}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear una nueva referencia.');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!payment || !file) return;
    if (file.size > 5_000_000) {
      setError('El comprobante supera 5 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await submitTransferProof(payment.id, {
        bankName: bankName.trim(), accountLast4: accountLast4.trim(),
        transferReference: transferReference.trim(),
        transferredAt: new Date(transferredAt).toISOString(),
        declaredAmount: Number(payment.amount).toFixed(2), file,
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo enviar el comprobante.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl rounded-xl border bg-white p-5 md:p-8">
      <Link to="/dashboard/contacts" className="text-sm font-medium text-[#101828] underline">← Volver a Mis Contactos</Link>
      <h1 className="mt-4 text-2xl font-bold text-[#101828]">Desbloquear contacto por transferencia</h1>
      <p className="mb-5 mt-2 text-gray-600">Transfiere el monto exacto y envía el comprobante. Una vez validado el pago por el equipo de ArtoCamello, se habilitarán el número y los datos de contacto del cliente para contactarlo directamente.</p>

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!payment ? (!error && <p role="status">Preparando los datos del pago...</p>) : <>
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p><strong>Monto exacto:</strong> {Number(payment.amount).toFixed(2)} {payment.currency}</p>
          <p><strong>Referencia de ArtoCamello:</strong> <span className="font-mono">{payment.reference}</span></p>
          <p><strong>Estado:</strong> {statusLabels[payment.status] || payment.status}</p>
          {payment.expiresAt && <p><strong>Vence:</strong> {new Date(payment.expiresAt).toLocaleString('es-EC')}</p>}
          {payment.transfers?.[0]?.reviewNote && <p><strong>Nota de revisión:</strong> {payment.transfers[0].reviewNote}</p>}
        </div>

        {payment.status !== 'allocated' && <section className="my-5">
          <h2 className="mb-3 text-lg font-bold text-[#101828]">Cuenta receptora</h2>
          <div className="grid gap-3">
            {accounts.map(account => <div key={`${account.bankName}-${account.accountNumber}`} className="rounded-xl border border-gray-200 p-4 text-sm">
              <p className="text-base font-bold text-[#101828]">{account.bankName}</p>
              <p><strong>Tipo:</strong> {account.accountType || 'Cuenta bancaria'}</p>
              <p><strong>Número:</strong> <span className="font-mono font-semibold">{account.accountNumber}</span></p>
              <p><strong>Titular:</strong> {account.accountName}</p>
              {account.accountHolderId && <p><strong>Cédula:</strong> {account.accountHolderId}</p>}
            </div>)}
          </div>
          <p className="mt-3 text-xs text-gray-600">Usa la referencia de ArtoCamello en el concepto de la transferencia si tu banco permite ingresarla.</p>
        </section>}

        {payment.status === 'under_review' && <div role="status" className="my-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">Recibimos tu comprobante. El contacto seguirá bloqueado hasta que el equipo valide el pago. Puedes actualizar el estado desde esta página.</div>}
        {payment.status === 'allocated' && <div role="status" className="my-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">Pago validado. El número del cliente ya está disponible en Mis Contactos. <Link to="/dashboard/contacts" className="font-bold underline">Ver contacto</Link></div>}
        {payment.status === 'expired' && <button type="button" onClick={renew} className="mt-5 rounded-lg bg-[#101828] px-5 py-3 font-semibold text-white">Crear nueva referencia</button>}
        {['awaiting_transfer', 'rejected'].includes(payment.status) && <form onSubmit={submit} className="mt-5 space-y-4 border-t pt-5">
          <h2 className="text-xl font-bold text-[#101828]">Enviar comprobante</h2>
          {payment.status === 'rejected' && <p className="text-sm text-red-700">Corrige los datos indicados en la nota de revisión y vuelve a enviar el comprobante.</p>}
          <label className="block text-sm font-medium">Banco de origen<input required maxLength={100} className="mt-1 block w-full rounded-lg border p-2" value={bankName} onChange={event => setBankName(event.target.value)} /></label>
          <label className="block text-sm font-medium">Últimos 4 dígitos de la cuenta de origen (opcional)<input pattern="[0-9]{4}" maxLength={4} className="mt-1 block w-full rounded-lg border p-2" value={accountLast4} onChange={event => setAccountLast4(event.target.value)} /></label>
          <label className="block text-sm font-medium">Referencia emitida por el banco<input required maxLength={100} className="mt-1 block w-full rounded-lg border p-2" value={transferReference} onChange={event => setTransferReference(event.target.value)} /></label>
          <div className="text-sm font-medium">Monto exacto a transferir ({payment.currency})<output className="mt-1 block w-full rounded-lg border bg-gray-50 p-2 font-semibold">{Number(payment.amount).toFixed(2)}</output><p className="mt-1 text-xs font-normal text-gray-600">El importe no se puede modificar. Si transferiste otro monto, contacta a soporte antes de enviar el comprobante.</p></div>
          <label className="block text-sm font-medium">Fecha y hora de la transferencia<input required type="datetime-local" className="mt-1 block w-full rounded-lg border p-2" value={transferredAt} onChange={event => setTransferredAt(event.target.value)} /></label>
          <label className="block text-sm font-medium">Comprobante PDF, JPG o PNG (máx. 5 MB)<input required type="file" accept="application/pdf,image/jpeg,image/png" className="mt-1 block w-full" onChange={event => setFile(event.target.files?.[0] || null)} /></label>
          <button type="submit" disabled={busy || !file} className="rounded-lg bg-[#101828] px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Enviando...' : 'Enviar para revisión'}</button>
        </form>}
        <button type="button" onClick={refresh} className="mt-5 block text-sm font-semibold text-[#101828] underline">Actualizar estado</button>
      </>}
    </div>
  );
}
