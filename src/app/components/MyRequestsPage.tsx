import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, FileText, AlertCircle, Users, Star, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import {
  ServiceRequest, RequestStatus, REQUEST_STATUS_LABELS,
  Quote, QuoteStatus, QUOTE_STATUS_LABELS,
} from '@/domain/types';
import { MAX_PROFESSIONALS_PER_REQUEST } from '@/domain/constants';
import { listRequestsByClient, cancelRequest, completeRequest } from '@/services/requestService';
import { listQuotesByRequest, acceptQuote } from '@/services/quoteService';
import { getReviewByRequest } from '@/services/reviewService';
import { getCurrentAuth } from '@/services/authService';

export function MyRequestsPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [cancelModalOpen, setCancelModalOpen] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quotesMap, setQuotesMap] = useState<Record<string, Awaited<ReturnType<typeof listQuotesByRequest>>>>({});
  const navigate = useNavigate();
  const auth = getCurrentAuth();

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
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
      }
    }
  };

  const handleCancelRequest = async (id: string) => {
    await cancelRequest(id);
    setCancelModalOpen(null);
    loadRequests();
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
            <p className="text-gray-500 text-lg">Haz seguimiento al estado de los trabajos que has solicitado.</p>
          </div>
          <Link
            to="/search"
            className="bg-[#FFCA0C] hover:bg-[#e6b600] text-[#101828] font-bold py-3 px-6 rounded-lg transition-colors inline-flex items-center gap-2"
          >
            + Nueva solicitud
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[#101828] mb-2">Aún no tienes solicitudes</h3>
            <p className="text-gray-500 mb-6">Cuando solicites un presupuesto, aparecerá aquí.</p>
            <Link to="/search" className="inline-block bg-[#FFCA0C] hover:bg-[#e6b600] text-[#101828] font-bold py-3 px-6 rounded-lg transition-colors">
              Solicitar presupuesto gratis
            </Link>
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
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-semibold whitespace-nowrap ${getStatusConfig(request.status).color}`}>
                        <StatusIcon className="w-4 h-4" />
                        {REQUEST_STATUS_LABELS[request.status]}
                      </div>
                    </div>

                    <p className="text-gray-600 text-sm mb-6">{request.description}</p>

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
