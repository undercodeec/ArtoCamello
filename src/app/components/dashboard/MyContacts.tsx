import React, { useState, useEffect, useCallback } from 'react';
import {
  Phone, Mail, Users, Search, MessageSquare,
  MapPin, Clock, Lock, AlertTriangle, CheckCircle,
  DollarSign, Eye, EyeOff, FileText, Star, Inbox
} from 'lucide-react';
import { ServiceRequest, UrgencyLevel, URGENCY_LABELS } from '@/domain/types';
import { MAX_PROFESSIONALS_PER_REQUEST } from '@/domain/constants';
import { listMatchingRequestsForProfessional } from '@/services/requestService';
import { initiateLeadPayment, listUnlockedContacts, UnlockedContact } from '@/services/leadService';
import { submitQuote, listQuotesByProfessional } from '@/services/quoteService';
import { Quote } from '@/domain/types';
import { getCurrentAuth } from '@/services/authService';
import { getCategoryBySlug } from '@/services/categoryService';
import { createCardIntent, getPaymentMethods } from '@/services/transferService';
import { trackMetaEvent } from '@/shared/lib/metaPixel';

type Tab = 'inbox' | 'unlocked';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  return `Hace ${Math.floor(h / 24)} días`;
}

function getUrgencyBadge(urgency: UrgencyLevel) {
  const map: Record<UrgencyLevel, { color: string; dot: string }> = {
    [UrgencyLevel.HIGH]:   { color: 'bg-red-100 text-red-700 border border-red-200',    dot: 'bg-red-500' },
    [UrgencyLevel.MEDIUM]: { color: 'bg-orange-100 text-orange-700 border border-orange-200', dot: 'bg-orange-500' },
    [UrgencyLevel.LOW]:    { color: 'bg-green-100 text-green-700 border border-green-200',  dot: 'bg-green-500' },
  };
  return map[urgency];
}

// ─── Sub-component: Solicitud Card (locked) ───────────────────────────────────

interface InboxCardProps {
  job: ServiceRequest;
  isLoading: boolean;
  error: string | null;
  onPay: (id: string) => void;
  onCard: (id: string) => void;
  transferAvailable: boolean;
  payphoneAvailable: boolean;
  cardAvailable: boolean;
}

function InboxCard({ job, isLoading, error, onPay, onCard, transferAvailable, payphoneAvailable, cardAvailable }: InboxCardProps) {
  const category = getCategoryBySlug(job.categorySlug);
  const costUSD = job.costUSD ?? Math.max(job.estimatedBudget * 0.06, 3);
  const maxProfessionals = job.maxProfessionalsPerLead || MAX_PROFESSIONALS_PER_REQUEST;
  const slotsLeft = maxProfessionals - job.purchaseCount;
  const limitReached = job.purchaseCount >= maxProfessionals;
  const urgencyBadge = getUrgencyBadge(job.urgency);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">

      {/* Top bar */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-[#101828] text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {category?.name || job.categorySlug}
            </span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${urgencyBadge.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${urgencyBadge.dot}`}></span>
              {URGENCY_LABELS[job.urgency]}
            </span>
          </div>
          <span className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap shrink-0">
            <Clock className="w-3.5 h-3.5" /> {getTimeAgo(job.createdAt)}
          </span>
        </div>

        {/* Job title & description */}
        <h3 className="text-lg font-bold text-[#101828] mb-1">{job.title}</h3>
        <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-3">{job.description}</p>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
          <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
          {job.location}
        </div>

        {/* Contact info — blurred / hidden */}
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 mb-4 relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-4 py-2 flex items-center gap-2 shadow-sm">
              <Lock className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-600">Datos de contacto bloqueados</span>
            </div>
          </div>
          <div className="space-y-2 blur-sm select-none pointer-events-none">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Phone className="w-4 h-4" />
              <span>+593 99 ••• ••••</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Mail className="w-4 h-4" />
              <span>cliente@•••••••.com</span>
            </div>
          </div>
        </div>

        {/* Budget & cost */}
        <div className="flex gap-3">
          <div className="flex-1 bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-0.5">Presupuesto estimado</p>
            <p className="font-bold text-[#101828]">${job.estimatedBudget.toLocaleString('es-EC', { minimumFractionDigits: 0 })} USD</p>
          </div>
          <div className="flex-1 bg-[#FFCA0C]/10 rounded-xl p-3">
            <p className="text-xs text-[#8B6B00] mb-0.5">Costo por contacto</p>
            <p className="font-bold text-[#101828]">${costUSD.toFixed(2)} USD</p>
          </div>
        </div>
      </div>

      {/* Competition bar */}
      <div className="px-5 pb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Profesionales interesados</span>
          <span className="font-semibold text-[#101828]">
            {job.purchaseCount} / {maxProfessionals} cupos
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${slotsLeft <= 1 ? 'bg-red-500' : 'bg-[#FFCA0C]'}`}
            style={{ width: `${(job.purchaseCount / maxProfessionals) * 100}%` }}
          />
        </div>
        {slotsLeft === 1 && (
          <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> ¡Solo queda 1 cupo!
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mb-3 p-3 rounded-lg text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* CTA */}
      <div className="p-4 bg-gray-50 border-t border-gray-100 mt-auto">
        {limitReached ? (
          <div className="w-full bg-gray-200 text-gray-400 font-bold py-3 px-4 rounded-xl text-center text-sm cursor-not-allowed">
            Cupos agotados — No disponible
          </div>
        ) : (
          <div className="grid gap-2">{payphoneAvailable && <button
            onClick={() => onPay(job.id)}
            disabled={isLoading}
            id={`btn-pay-lead-${job.id}`}
            className={`w-full font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm ${
              isLoading
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-[#101828] hover:bg-gray-800 text-white hover:shadow-lg active:scale-[0.98]'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Redirigiendo a PayPhone...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Ver datos del cliente — ${costUSD.toFixed(2)} USD
              </>
            )}
          </button>}{cardAvailable && <button disabled={isLoading} className="w-full border border-[#101828] text-[#101828] font-bold py-3 px-4 rounded-xl disabled:opacity-50" onClick={() => onCard(job.id)}>Pagar con tarjeta</button>}{transferAvailable && <button className="w-full border border-[#101828] text-[#101828] font-bold py-3 px-4 rounded-xl" onClick={() => { window.location.href = `/dashboard/transfer/${job.id}`; }}>Pagar por transferencia</button>}{!payphoneAvailable && !transferAvailable && !cardAvailable && <p className="text-sm text-gray-500">Pagos temporalmente no disponibles</p>}</div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-component: Unlocked Contact Card ─────────────────────────────────────

function UnlockedCard({ contact, index, total, quote, onSubmitQuote }: { contact: UnlockedContact; index: number; total: number; quote?: Quote; onSubmitQuote: (p: any) => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [price, setPrice] = useState<number | ''>('');
  const [days, setDays] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLast = index === total - 1;

  const handleSubmit = async () => {
    if (!message || price === '' || days === '') {
      alert('Por favor completa todos los campos de la cotización.');
      return;
    }
    setIsSubmitting(true);
    await onSubmitQuote({
      requestId: contact.purchase.requestId,
      message,
      estimatedPrice: Number(price),
      estimatedDays: Number(days)
    });
    setIsSubmitting(false);
  };

  return (
    <div className={`p-6 flex flex-col md:flex-row gap-6 ${!isLast ? 'border-b border-gray-100' : ''}`}>

      {/* Avatar + meta */}
      <div className="flex-1 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFCA0C] to-[#f5a900] flex items-center justify-center text-[#101828] font-bold text-lg shrink-0">
            {contact.clientName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-[#101828]">{contact.clientName}</h3>
              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full border border-green-200">
                <CheckCircle className="w-3 h-3" /> Desbloqueado
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {new Date(contact.purchase.purchasedAt).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric'
              })}
              {contact.purchase.costUSD > 0 && (
                <span className="ml-2 text-[#8B6B00] font-medium bg-[#FFCA0C]/20 px-2 py-0.5 rounded-full text-[11px]">
                  ${contact.purchase.costUSD.toFixed(2)} USD pagado
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Job info */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Trabajo solicitado</p>
          <p className="font-semibold text-[#101828]">{contact.requestTitle}</p>
          <p className="text-sm text-gray-500 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {contact.location}
          </p>
          {contact.estimatedBudget > 0 && (
            <p className="text-sm text-gray-500 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Presupuesto: ${contact.estimatedBudget.toLocaleString('es-EC')} USD
            </p>
          )}
        </div>

        {/* Contact buttons */}
        <div className="flex flex-wrap gap-2">
          {contact.clientPhone && (
            <a
              href={`https://wa.me/${contact.clientPhone.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noreferrer"
              id={`btn-whatsapp-${contact.purchase.id}`}
              className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              <Phone className="w-4 h-4" /> WhatsApp
            </a>
          )}
          {contact.clientEmail && (
            <a
              href={`mailto:${contact.clientEmail}`}
              id={`btn-email-${contact.purchase.id}`}
              className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-[#101828] text-[#101828] px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              <Mail className="w-4 h-4" /> {contact.clientEmail}
            </a>
          )}
          {contact.clientPhone && (
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-semibold">
              <Phone className="w-4 h-4" /> {contact.clientPhone}
            </div>
          )}
        </div>
      </div>

      {/* Quote UI */}
      <div className="w-full md:w-80 flex flex-col gap-3 bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
        <label className="text-xs font-bold text-[#101828] uppercase tracking-wide border-b border-gray-100 pb-2">
          {quote ? 'Cotización Enviada' : 'Enviar Cotización'}
        </label>
        
        {quote ? (
          <div className="space-y-3">
            <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700">
              {quote.message}
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Precio estimado:</span>
              <span className="font-bold text-[#101828]">${quote.estimatedPrice} USD</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Tiempo estimado:</span>
              <span className="font-medium text-gray-700">{quote.estimatedDays} días</span>
            </div>
            <div className="mt-2 text-center">
              <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                {quote.status === 'accepted' ? '¡Cotización Aceptada!' : 'Enviada al cliente'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <textarea
                className="w-full min-h-[80px] p-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 bg-white text-sm resize-none transition-colors"
                placeholder="Describe tu propuesta y experiencia..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  placeholder="Precio"
                  className="w-full pl-6 pr-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#101828]"
                  value={price}
                  onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : '')}
                />
              </div>
              <div className="flex-1 relative">
                <input
                  type="number"
                  placeholder="Días"
                  className="w-full pl-2 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#101828]"
                  value={days}
                  onChange={(e) => setDays(e.target.value ? Number(e.target.value) : '')}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">días</span>
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all ${
                isSubmitting 
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-[#FFCA0C] hover:bg-[#e6b600] text-[#101828]'
              }`}
            >
              {isSubmitting ? 'Enviando...' : 'Enviar Propuesta'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MyContacts() {
  const auth = getCurrentAuth();

  const [activeTab, setActiveTab] = useState<Tab>('inbox');
  const [searchTerm, setSearchTerm] = useState('');

  // Inbox (pending leads to pay)
  const [inboxJobs, setInboxJobs] = useState<ServiceRequest[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [transferAvailable, setTransferAvailable] = useState(false);
  const [payphoneAvailable, setPayphoneAvailable] = useState(false);
  const [cardAvailable, setCardAvailable] = useState(false);
  const [payError, setPayError] = useState<{ id: string; msg: string } | null>(null);

  // Unlocked contacts (already paid)
  const [unlockedContacts, setUnlockedContacts] = useState<UnlockedContact[]>([]);
  const [myQuotes, setMyQuotes] = useState<Quote[]>([]);
  const [unlockedLoading, setUnlockedLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!auth.userId) return;

    setInboxLoading(true);
    setUnlockedLoading(true);

    const [available, unlocked, sentQuotes] = await Promise.all([
      listMatchingRequestsForProfessional(auth.userId),
      listUnlockedContacts(auth.userId),
      listQuotesByProfessional(),
    ]);

    // Filter out already-purchased from inbox
    const unlockedRequestIds = new Set(unlocked.map((u) => u.purchase.requestId));
    setInboxJobs(available.filter((j) => !unlockedRequestIds.has(j.id)));
    setUnlockedContacts(unlocked);
    setMyQuotes(sentQuotes);

    setInboxLoading(false);
    setUnlockedLoading(false);
  }, [auth.userId]);

  useEffect(() => {
    loadData();
    getPaymentMethods().then(methods => { setTransferAvailable(methods.transfer); setPayphoneAvailable(methods.payphone); setCardAvailable(methods.card); }).catch(() => { setTransferAvailable(false); setPayphoneAvailable(false); setCardAvailable(false); });
  }, [loadData]);

  const handleQuoteSubmit = async (payload: any) => {
    try {
      const newQuote = await submitQuote(payload);
      setMyQuotes(prev => [...prev, newQuote]);
    } catch (err: any) {
      alert(err.message || 'Error al enviar cotización');
    }
  };

  const handlePay = async (jobId: string) => {
    setPayingId(jobId);
    setPayError(null);
    const result = await initiateLeadPayment(jobId);
    if (!result.success || !result.redirectUrl) {
      setPayError({ id: jobId, msg: result.error || 'Error al iniciar el pago.' });
      setPayingId(null);
      return;
    }
    trackMetaEvent('InitiateCheckout', {
      content_ids: [jobId],
      content_type: 'service',
      currency: 'USD',
      value: result.costUSD,
    });
    window.location.href = result.redirectUrl;
  };
  const handleCardPay = async (jobId: string) => {
    setPayingId(jobId); setPayError(null);
    try {
      const result = await createCardIntent(jobId);
      if (!result.checkoutUrl) throw new Error('El checkout está en preparación. Intenta de nuevo en unos segundos.');
      const job = inboxJobs.find((item) => item.id === jobId);
      trackMetaEvent('InitiateCheckout', {
        content_ids: [jobId],
        content_type: 'service',
        currency: 'USD',
        value: job?.costUSD ?? (job ? Math.max(job.estimatedBudget * 0.06, 3) : undefined),
      });
      window.location.href = result.checkoutUrl;
    } catch (error) { setPayError({ id: jobId, msg: (error as Error).message }); setPayingId(null); }
  };

  // Filtered inbox
  const filteredInbox = inboxJobs.filter((j) => {
    const q = searchTerm.toLowerCase();
    return (
      j.title.toLowerCase().includes(q) ||
      j.description.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q)
    );
  });

  // Filtered unlocked
  const filteredUnlocked = unlockedContacts.filter((c) => {
    const q = searchTerm.toLowerCase();
    return (
      c.clientName.toLowerCase().includes(q) ||
      c.requestTitle.toLowerCase().includes(q) ||
      c.location.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#101828]">Mis Contactos</h1>
          <p className="text-gray-500 mt-1">
            Solicitudes de clientes que buscan profesionales en tu área.
          </p>
        </div>
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar solicitudes o contactos..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#101828]/20 focus:border-[#101828] transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <div className="p-1.5 bg-blue-100 rounded-lg shrink-0">
          <Eye className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-800">¿Cómo funciona?</p>
          <p className="text-sm text-blue-700 mt-0.5">
            Ves la descripción y ubicación del trabajo. El nombre, teléfono y correo del cliente se revelan
            únicamente cuando pagas el <strong>costo indicado</strong> para ese contacto.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        <button
          id="tab-inbox"
          onClick={() => setActiveTab('inbox')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm border-b-2 transition-colors rounded-t-lg ${
            activeTab === 'inbox'
              ? 'border-[#101828] text-[#101828] bg-gray-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Inbox className="w-4 h-4" />
          Nuevas Solicitudes
          {inboxJobs.length > 0 && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              activeTab === 'inbox' ? 'bg-[#101828] text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {inboxJobs.length}
            </span>
          )}
        </button>
        <button
          id="tab-unlocked"
          onClick={() => setActiveTab('unlocked')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm border-b-2 transition-colors rounded-t-lg ${
            activeTab === 'unlocked'
              ? 'border-[#101828] text-[#101828] bg-gray-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Users className="w-4 h-4" />
          Contactos Desbloqueados
          {unlockedContacts.length > 0 && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              activeTab === 'unlocked' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {unlockedContacts.length}
            </span>
          )}
        </button>
      </div>

      {/* ─── TAB: INBOX ─────────────────────────────────────────── */}
      {activeTab === 'inbox' && (
        <>
          {inboxLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-2xl p-6 animate-pulse">
                  <div className="flex gap-2 mb-4">
                    <div className="h-6 bg-gray-200 rounded-full w-24"></div>
                    <div className="h-6 bg-gray-200 rounded-full w-20"></div>
                  </div>
                  <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-full mb-1"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
                  <div className="h-20 bg-gray-100 rounded-xl mb-4"></div>
                  <div className="h-10 bg-gray-200 rounded-xl"></div>
                </div>
              ))}
            </div>
          ) : filteredInbox.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Inbox className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-xl font-bold text-[#101828] mb-2">
                {searchTerm ? 'Sin resultados para tu búsqueda' : 'No hay nuevas solicitudes'}
              </h3>
              <p className="text-gray-500 max-w-sm mx-auto">
                {searchTerm
                  ? 'Prueba con otras palabras clave.'
                  : 'Cuando un cliente en tu zona busque un profesional de tu especialidad, aparecerá aquí.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredInbox.map((job) => (
                <InboxCard
                  key={job.id}
                  job={job}
                  isLoading={payingId === job.id}
                  error={payError?.id === job.id ? payError.msg : null}
                  onPay={handlePay}
                  onCard={handleCardPay}
                  transferAvailable={transferAvailable}
                  payphoneAvailable={payphoneAvailable}
                  cardAvailable={cardAvailable}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── TAB: UNLOCKED ──────────────────────────────────────── */}
      {activeTab === 'unlocked' && (
        <>
          {unlockedLoading ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-[#101828] border-t-transparent rounded-full mx-auto"></div>
              <p className="text-gray-400 mt-3 text-sm">Cargando contactos...</p>
            </div>
          ) : filteredUnlocked.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-xl font-bold text-[#101828] mb-2">
                {searchTerm ? 'Sin coincidencias' : 'Aún no has desbloqueado ningún contacto'}
              </h3>
              <p className="text-gray-500 max-w-sm mx-auto">
                {searchTerm
                  ? 'Prueba buscando por nombre o trabajo.'
                  : 'Ve a "Nuevas Solicitudes" y paga para revelar los datos de un cliente.'}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => setActiveTab('inbox')}
                  className="mt-6 bg-[#101828] hover:bg-gray-800 text-white font-bold py-3 px-6 rounded-xl transition-colors"
                >
                  Ver solicitudes disponibles
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
              {filteredUnlocked.map((contact, i) => (
                <UnlockedCard
                  key={contact.purchase.id}
                  contact={contact}
                  index={i}
                  total={filteredUnlocked.length}
                  quote={myQuotes.find(q => q.requestId === contact.purchase.requestId)}
                  onSubmitQuote={handleQuoteSubmit}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
