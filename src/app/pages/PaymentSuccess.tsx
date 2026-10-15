import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { CheckCircle2, Loader2, Phone, Mail } from 'lucide-react';
import { confirmLeadPayment } from '@/services/leadService';
import { trackMetaEvent } from '@/shared/lib/metaPixel';

type Status = 'loading' | 'success' | 'error';

export function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [costUSD, setCostUSD] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;

    const clientTxId = searchParams.get('clientTransactionId') || searchParams.get('clientTxId');
    const payphoneTransactionId = searchParams.get('id') || undefined;

    if (!clientTxId) {
      if (mounted) {
        setStatus('error');
        setErrorMsg('No se encontró el identificador de la transacción.');
      }
      return;
    }

    const confirm = async () => {
      const result = await confirmLeadPayment(clientTxId, payphoneTransactionId);
      if (!mounted) return;

      if (result.success) {
        const purchaseKey = `meta-pixel-purchase:${clientTxId}`;
        if (!sessionStorage.getItem(purchaseKey)) {
          trackMetaEvent('Purchase', {
            currency: 'USD',
            value: result.costUSD || 0,
          });
          sessionStorage.setItem(purchaseKey, '1');
        }
        setContactPhone(result.contactPhone || '');
        setContactEmail(result.contactEmail || '');
        setCostUSD(result.costUSD || 0);
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(result.error || 'El pago no pudo ser confirmado.');
      }
    };

    confirm();
    return () => { mounted = false; };
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 md:p-12 rounded-2xl shadow-xl w-full max-w-md text-center animate-in zoom-in-95 duration-500">

        {status === 'loading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-16 h-16 text-[#101828] animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-[#101828] mb-2">Verificando pago...</h2>
            <p className="text-gray-500">Estamos confirmando tu pago con PayPhone.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-[#101828] mb-2">¡Pago exitoso!</h2>
            <p className="text-gray-500 mb-2">
              Pagaste <span className="font-bold text-[#101828]">${costUSD.toFixed(2)} USD</span>
            </p>
            <p className="text-gray-500 mb-6">Aquí están los datos del cliente:</p>

            <div className="w-full space-y-3 mb-8">
              {contactPhone && (
                <a
                  href={`https://wa.me/${contactPhone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  id="btn-whatsapp-contact"
                  className="flex items-center justify-center gap-3 w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  <Phone className="w-5 h-5" />
                  WhatsApp: {contactPhone}
                </a>
              )}
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}`}
                  id="btn-email-contact"
                  className="flex items-center justify-center gap-3 w-full bg-gray-100 hover:bg-gray-200 text-[#101828] font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  <Mail className="w-5 h-5" />
                  {contactEmail}
                </a>
              )}
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={() => navigate('/dashboard/contacts')}
                id="btn-go-contacts"
                className="flex-1 bg-[#101828] hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                Ver mis contactos
              </button>
              <button
                onClick={() => navigate('/dashboard/jobs')}
                id="btn-go-jobs"
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-[#101828] font-bold py-3 px-4 rounded-lg transition-colors"
              >
                Seguir explorando
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-[#101828] mb-2">No se pudo confirmar el pago</h2>
            <p className="text-gray-600 mb-8">{errorMsg}</p>
            <button
              onClick={() => navigate('/dashboard/jobs')}
              id="btn-back-jobs"
              className="w-full bg-[#101828] hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-lg transition-colors"
            >
              Volver al mercado
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
