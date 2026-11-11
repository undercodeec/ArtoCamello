import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, FileText, AlertCircle, Users, Star, ChevronRight } from 'lucide-react';
import { PublishServiceForm } from './PublishServiceForm';
import {
  ServiceRequest, RequestStatus, REQUEST_STATUS_LABELS,
  Quote, QuoteStatus, QUOTE_STATUS_LABELS,
} from '@/domain/types';
import { MAX_PROFESSIONALS_PER_REQUEST } from '@/domain/constants';
import { listRequestsByClient, cancelRequest, completeRequest, updateServiceRequest } from '@/services/requestService';
import { listQuotesByRequest, acceptQuote } from '@/services/quoteService';
import { getReviewByRequest } from '@/services/reviewService';
import { getCurrentAuth } from '@/services/authService';

export function MyRequestsPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [cancelModalOpen, setCancelModalOpen] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ServiceRequest>>({});
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [quotesMap, setQuotesMap] = useState<Record<string, Awaited<ReturnType<typeof listQuotesByRequest>>>>({});
  const auth = getCurrentAuth();

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoadingRequests(true);
    setLoadError('');
    if (auth.userId) {
      try {
        const reqs = await listRequestsByClient(auth.userId);
        setRequests(reqs);
        // Pre-load quotes for requests that have them
        const qMap: any = {};
        await Promise.all(
          reqs.map(async (r) => {
            try {
              const quotes = await listQuotesByRequest(r.id);
              if (quotes && quotes.length > 0) {
                qMap[r.id] = quotes;
              }
            } catch (err) {
              console.error(`Error loading quotes for request ${r.id}:`, err);
            }
          })
        );
        setQuotesMap(qMap);
      } catch (error) {
        console.error("Failed to load requests:", error);
        setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar tus solicitudes.');
      }
    }
    setLoadingRequests(false);
  };

  const handleCancelRequest = async (id: string) => {
    try {
      const result = await cancelRequest(id);
      if (!result) throw new Error('No se pudo cancelar. Es posible que el estado haya cambiado.');
      setCancelModalOpen(null);
      await loadRequests();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'No se pudo cancelar.'); }
  };

  const saveEdit = async (id: string) => {
    setActionError('');
    setSaving(true);
    try {
      const budget = Number(editValues.estimatedBudget);
      if (!Number.isFinite(budget) || budget <= 0) throw new Error('Indica un presupuesto mayor a cero.');
      await updateServiceRequest(id, {
        title: editValues.title?.trim(), description: editValues.description?.trim(), city: editValues.city?.trim(),
        location: editValues.location?.trim(), urgency: editValues.urgency, estimatedBudget: budget,
        ...(editValues.preferredDate ? { preferredDate: editValues.preferredDate } : {}),
        contactName: editValues.contactName?.trim(), contactEmail: editValues.contactEmail?.trim(), contactPhone: editValues.contactPhone?.trim(),
      });
      setEditingId(null);
      await loadRequests();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'No se pudo editar la solicitud.'); }
    finally { setSaving(false); }
  };

  const handleAcceptQuote = async (quoteId: string) => {
    await acceptQuote(quoteId);
    loadRequests();
  };

  const getStatusConfig = (status: RequestStatus) => {
    switch (status) {
      case RequestStatus.SUBMITTED:
      case RequestStatus.MATCHING:
      case RequestStatus.CONTACT_LIMIT_OPEN:
        return { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock };
      case RequestStatus.QUOTES_RECEIVED:
      case RequestStatus.CONTACT_LIMIT_REACHED:
        return { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: FileText };
      case RequestStatus.HIRED:
        return { color: 'bg-purple-100 text-purple-800 border-purple-200', icon: Users };
      case RequestStatus.COMPLETED:
        return { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle };
      case RequestStatus.CANCELLED:
        return { color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle };
      default:
        return { color: 'bg-gray-100 text-gray-800 border-gray-200', icon: FileText };
    }
  };

  const isActive = (status: RequestStatus) =>
    status !== RequestStatus.COMPLETED &&
    status !== RequestStatus.CANCELLED;

  return (
    <div className="min-h-screen bg-gray-50 pt-8 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-[#101828] mb-2">Mis Solicitudes</h1>
            <p className="text-gray-500 text-lg">Publica una necesidad y haz seguimiento a tus solicitudes.</p>
          </div>
        </div>
        <PublishServiceForm onPublished={loadRequests} />
        {actionError && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{actionError}</p>}

        {loadingRequests ? (
          <div role="status" className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-600">Cargando tus solicitudes...</div>
        ) : loadError ? (
          <div role="alert" className="bg-white rounded-xl border border-red-200 p-8 text-center">
            <p className="mb-4 text-red-700">{loadError}</p>
            <button type="button" onClick={loadRequests} className="rounded-lg bg-[#101828] px-5 py-2 font-semibold text-white">Reintentar</button>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[#101828] mb-2">Aún no tienes solicitudes</h3>
            <p className="text-gray-500">Completa el formulario de arriba para publicar tu primera solicitud.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => {
              const StatusIcon = getStatusConfig(request.status).icon;
              const quotes = quotesMap[request.id] || [];
              const maxProfessionals = request.maxProfessionalsPerLead || MAX_PROFESSIONALS_PER_REQUEST;
              const hasReview = !!getReviewByRequest(request.id);
              const isExpanded = expandedId === request.id;

              return (
                <div key={request.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
                  <div className="p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded">
                            {request.categorySlug}
                          </span>
                          <span className="text-sm text-gray-500">
                            {new Date(request.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <h2 className="text-xl font-bold text-[#101828]">{request.title}</h2>
                        <p className="mt-1 text-xs font-semibold text-gray-500">{request.visibility === 'direct' ? 'Dirigida a un profesional' : 'Publicación general'}</p>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-semibold whitespace-nowrap ${getStatusConfig(request.status).color}`}>
                        <StatusIcon className="w-4 h-4" />
                        {REQUEST_STATUS_LABELS[request.status]}
                      </div>
                    </div>

                    <p className="text-gray-600 text-sm mb-6">{request.description}</p>
                    {request.visibility === 'marketplace' && request.canEdit === true && (
                      <div className="mb-4">
                        {editingId !== request.id ? <button type="button" onClick={() => { setEditingId(request.id); setEditValues(request); setActionError(''); }} className="text-sm font-semibold text-blue-700 underline">Editar publicación</button> :
                          <form onSubmit={e => { e.preventDefault(); saveEdit(request.id); }} className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
                            {(['title', 'city', 'location', 'contactName', 'contactEmail', 'contactPhone'] as const).map(name => <label key={name} className="text-sm font-semibold">{({ title: 'Título', city: 'Ciudad', location: 'Dirección privada', contactName: 'Nombre', contactEmail: 'Correo', contactPhone: 'Teléfono' })[name]}<input required value={editValues[name] || ''} onChange={e => setEditValues(v => ({ ...v, [name]: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label>)}
                            <label className="text-sm font-semibold">Urgencia<select value={editValues.urgency || 'medium'} onChange={e => setEditValues(v => ({ ...v, urgency: e.target.value as ServiceRequest['urgency'] }))} className="mt-1 w-full rounded-lg border p-2"><option value="low">Flexible</option><option value="medium">Próximos días</option><option value="high">Urgente</option></select></label>
                            <label className="text-sm font-semibold">Presupuesto (USD)<input required type="number" min="0.01" step="0.01" value={editValues.estimatedBudget || ''} onChange={e => setEditValues(v => ({ ...v, estimatedBudget: Number(e.target.value) }))} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <label className="text-sm font-semibold">Fecha preferida<input type="date" value={editValues.preferredDate?.slice(0, 10) || ''} onChange={e => setEditValues(v => ({ ...v, preferredDate: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : undefined }))} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <label className="text-sm font-semibold sm:col-span-2">Descripción<textarea required value={editValues.description || ''} onChange={e => setEditValues(v => ({ ...v, description: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label>
                            <div className="flex gap-3 sm:col-span-2"><button type="submit" disabled={saving} className="rounded-lg bg-[#101828] px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar cambios'}</button><button type="button" onClick={() => setEditingId(null)} className="font-semibold text-gray-600">Cerrar</button></div>
                          </form>}
                      </div>
                    )}

                    {/* Progress bar — always showing max 4 */}
                    {isActive(request.status) && (
                      <div className="bg-gray-50 rounded-lg p-4 mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-semibold text-gray-700">Presupuestos recibidos:</span>
                          <span className="text-sm font-bold text-[#101828]">
                            {Math.min(quotes.length, maxProfessionals)} de {maxProfessionals}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className="bg-[#FFCA0C] h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${(Math.min(quotes.length, maxProfessionals) / maxProfessionals) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Quotes section (expandable) */}
                    {quotes.length > 0 && (
                      <div className="mb-4">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : request.id)}
                          className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                        >
                          <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          Ver {quotes.length} presupuesto{quotes.length > 1 ? 's' : ''} recibido{quotes.length > 1 ? 's' : ''}
                        </button>

                        {isExpanded && (
                          <div className="mt-4 space-y-3">
                            {quotes.map(({ quote, professionalName, professionalRating, professionalReviewCount }) => (
                              <div key={quote.id} className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <div className="w-10 h-10 rounded-full bg-[#FFCA0C]/20 flex items-center justify-center text-[#101828] font-bold text-sm">
                                        {professionalName.charAt(0)}
                                      </div>
                                      <div>
                                        <p className="font-bold text-[#101828]">{professionalName}</p>
                                        <div className="flex items-center gap-1 text-sm text-gray-500">
                                          <Star className="w-3.5 h-3.5 fill-[#FFCA0C] text-[#FFCA0C]" />
                                          <span className="font-medium">{professionalRating.toFixed(1)}</span>
                                          <span>({professionalReviewCount} reseñas)</span>
                                        </div>
                                      </div>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-2">{quote.message}</p>
                                    <p className="text-lg font-bold text-[#101828]">
                                      ${quote.estimatedPrice}
                                      {quote.estimatedDays && (
                                        <span className="text-sm text-gray-500 font-normal ml-2">
                                          · {quote.estimatedDays} día{quote.estimatedDays > 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {quote.status === QuoteStatus.ACCEPTED ? (
                                      <span className="bg-green-100 text-green-800 px-3 py-1.5 rounded-full text-sm font-bold border border-green-200">
                                        ✓ Aceptado
                                      </span>
                                    ) : quote.status === QuoteStatus.REJECTED ? (
                                      <span className="bg-red-100 text-red-800 px-3 py-1.5 rounded-full text-sm font-bold border border-red-200">
                                        ✗ Rechazado
                                      </span>
                                    ) : (
                                      request.status !== RequestStatus.HIRED &&
                                      request.status !== RequestStatus.COMPLETED && (
                                        <button
                                          onClick={() => handleAcceptQuote(quote.id)}
                                          className="bg-[#101828] hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                                        >
                                          Elegir profesional
                                        </button>
                                      )
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions footer */}
                    {isActive(request.status) && request.status !== RequestStatus.HIRED && (
                      <div className="flex justify-end border-t border-gray-100 pt-4 mt-2">
                        <button
                          onClick={() => setCancelModalOpen(request.id)}
                          className="text-red-500 hover:text-red-700 text-sm font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <XCircle className="w-4 h-4" /> Cancelar solicitud
                        </button>
                      </div>
                    )}

                    {/* Review CTA for completed requests */}
                    {request.status === RequestStatus.COMPLETED && !hasReview && (
                      <div className="flex justify-end border-t border-gray-100 pt-4 mt-2">
                        <button className="bg-[#FFCA0C] hover:bg-[#e6b600] text-[#101828] px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2">
                          <Star className="w-4 h-4" /> Dejar reseña
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-[#101828] mb-2">¿Cancelar esta solicitud?</h3>
              <p className="text-gray-600 mb-6">
                Si ya resolviste el problema o contrataste a alguien, cancela la solicitud para evitar que más profesionales paguen por contactarte.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setCancelModalOpen(null)}
                  className="px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Volver
                </button>
                <button
                  onClick={() => handleCancelRequest(cancelModalOpen)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Sí, cancelar solicitud
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
