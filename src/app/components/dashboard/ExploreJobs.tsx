import React, { useState, useEffect } from 'react';
import { MapPin, Clock, Lock, Filter, Search, AlertTriangle, CheckCircle, DollarSign } from 'lucide-react';
import { MAX_PROFESSIONALS_PER_REQUEST } from '@/domain/constants';
import { ServiceRequest, UrgencyLevel, URGENCY_LABELS } from '@/domain/types';
import { listMatchingRequestsForProfessional } from '@/services/requestService';
import { initiateLeadPayment, hasPurchasedLead } from '@/services/leadService';
import { getCurrentAuth } from '@/services/authService';
import { getCategoryBySlug, getAllCategories } from '@/services/categoryService';
import { createCardIntent, getPaymentMethods } from '@/services/transferService';

export function ExploreJobs() {
  const [filterCategory, setFilterCategory] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [jobs, setJobs] = useState<ServiceRequest[]>([]);
  const [purchasedSet, setPurchasedSet] = useState<Set<string>>(new Set());
  const [loadingPayment, setLoadingPayment] = useState<string | null>(null);
  const [transferAvailable, setTransferAvailable] = useState(false);
  const [payphoneAvailable, setPayphoneAvailable] = useState(false);
  const [cardAvailable, setCardAvailable] = useState(false);
  const [errorMsg, setErrorMsg] = useState<{ id: string; msg: string } | null>(null);
  const auth = getCurrentAuth();
  const categories = getAllCategories();

  useEffect(() => {
    loadJobs();
    getPaymentMethods().then(methods => { setTransferAvailable(methods.transfer); setPayphoneAvailable(methods.payphone); setCardAvailable(methods.card); }).catch(() => { setTransferAvailable(false); setPayphoneAvailable(false); setCardAvailable(false); });
  }, []);

  const loadJobs = async () => {
    if (!auth.userId) return;
    const available = await listMatchingRequestsForProfessional(auth.userId);
    setJobs(available);
    // Cargar cuáles ya fueron comprados para marcar el botón
    const purchased = new Set<string>();
    for (const job of available) {
      const already = await hasPurchasedLead(job.id, auth.userId);
      if (already) purchased.add(job.id);
    }
    setPurchasedSet(purchased);
  };

  const handleUnlock = async (jobId: string) => {
    setLoadingPayment(jobId);
    setErrorMsg(null);

    const result = await initiateLeadPayment(jobId);

    if (!result.success || !result.redirectUrl) {
      setErrorMsg({ id: jobId, msg: result.error || 'Error al iniciar el pago.' });
      setLoadingPayment(null);
      return;
    }

    // Redirigir al profesional a PayPhone
    window.location.href = result.redirectUrl;
  };

  const handleCardUnlock = async (jobId: string) => {
    setLoadingPayment(jobId); setErrorMsg(null);
    try {
      const result = await createCardIntent(jobId);
      if (!result.checkoutUrl) throw new Error('El checkout está en preparación. Intenta de nuevo en unos segundos.');
      window.location.href = result.checkoutUrl;
    } catch (error) { setErrorMsg({ id: jobId, msg: (error as Error).message }); setLoadingPayment(null); }
  };

  const getUrgencyColor = (urgency: UrgencyLevel) => {
    switch (urgency) {
      case UrgencyLevel.HIGH: return 'bg-red-500';
      case UrgencyLevel.MEDIUM: return 'bg-orange-500';
      case UrgencyLevel.LOW: return 'bg-green-500';
    }
  };

  const getTimeAgo = (dateStr: string): string => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours} horas`;
    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays} días`;
  };

  const filteredJobs = jobs.filter((job) => {
    const matchCat = filterCategory === '' || job.categorySlug === filterCategory;
    const matchKeyword =
      searchKeyword === '' ||
      job.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      job.description.toLowerCase().includes(searchKeyword.toLowerCase());
    return matchCat && matchKeyword;
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#101828]">Mercado de Trabajos</h1>
          <p className="text-gray-500 mt-1">Paga directamente para desbloquear el contacto del cliente.</p>
        </div>
        {/* Info modelo de negocio */}
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          El costo por contacto se muestra en cada oportunidad
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por palabra clave..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#101828]"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>
        <div className="flex-1 relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#101828] appearance-none bg-white"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.slug} value={cat.slug}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-[#101828] mb-2">No hay trabajos disponibles ahora</h3>
          <p className="text-gray-500">Vuelve más tarde o amplía tus categorías de servicio para ver más oportunidades.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredJobs.map((job) => {
            const category = getCategoryBySlug(job.categorySlug);
            // costUSD viene del backend ya calculado; si no, calculamos localmente
            const costUSD = job.costUSD ?? Math.max(job.estimatedBudget * 0.06, 3);
            const already = purchasedSet.has(job.id);
            const maxProfessionals = job.maxProfessionalsPerLead || MAX_PROFESSIONALS_PER_REQUEST;
            const limitReached = job.purchaseCount >= maxProfessionals;
            const slotsLeft = maxProfessionals - job.purchaseCount;
            const isLoading = loadingPayment === job.id;

            return (
              <div key={job.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <div className="p-6 flex-grow">
                  <div className="flex justify-between items-start mb-3">
                    <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2.5 py-1 rounded">
                      {category?.name || job.categorySlug}
                    </span>
                    <span className="flex items-center text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5 mr-1" /> {getTimeAgo(job.createdAt)}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-[#101828] mb-2">{job.title}</h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{job.description}</p>

                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" /> {job.location}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${getUrgencyColor(job.urgency)}`}></span>
                      {URGENCY_LABELS[job.urgency]}
                    </div>
                  </div>

                  {/* Presupuesto y costo */}
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                    <div>
                      <p className="text-xs text-gray-500">Presupuesto del cliente</p>
                      <p className="font-bold text-[#101828]">${job.estimatedBudget.toFixed(2)} USD</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Costo por contacto</p>
                      <p className="font-bold text-green-700">${costUSD.toFixed(2)} USD</p>
                    </div>
                  </div>

                  {/* Competencia */}
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Competencia:</span>
                      <span className="text-sm font-bold text-[#101828]">
                        {job.purchaseCount} de {maxProfessionals} presupuestos
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${slotsLeft <= 1 ? 'bg-red-500' : 'bg-[#FFCA0C]'}`}
                        style={{ width: `${(job.purchaseCount / maxProfessionals) * 100}%` }}
                      ></div>
                    </div>
                    {slotsLeft === 1 && (
                      <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> ¡Solo queda 1 cupo disponible!
                      </p>
                    )}
                    {limitReached && (
                      <p className="text-xs text-red-600 font-medium mt-1">Límite de profesionales alcanzado.</p>
                    )}
                  </div>

                  {/* Error message */}
                  {errorMsg && errorMsg.id === job.id && (
                    <div className="mt-3 p-3 rounded-lg text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200">
                      <AlertTriangle className="w-4 h-4" /> {errorMsg.msg}
                    </div>
                  )}
                </div>

                {/* Action button */}
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  {already ? (
                    <div className="w-full bg-green-100 text-green-800 font-bold py-3 px-4 rounded-lg text-center flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" /> Contacto desbloqueado
                    </div>
                  ) : limitReached ? (
                    <div className="w-full bg-gray-200 text-gray-500 font-bold py-3 px-4 rounded-lg text-center cursor-not-allowed">
                      No disponible — Límite alcanzado
                    </div>
                  ) : (
                    <div className="grid gap-2">{payphoneAvailable && <button
                      onClick={() => handleUnlock(job.id)}
                      disabled={isLoading}
                      id={`btn-unlock-${job.id}`}
                      className={`w-full font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                        isLoading
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-[#101828] hover:bg-gray-800 text-white'
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
                          Pagar ${costUSD.toFixed(2)} USD — Desbloquear
                        </>
                      )}
                    </button>}{cardAvailable && <button disabled={isLoading} className="w-full border border-[#101828] text-[#101828] font-bold py-3 px-4 rounded-lg disabled:opacity-50" onClick={() => handleCardUnlock(job.id)}>Pagar con tarjeta</button>}{transferAvailable && <button className="w-full border border-[#101828] text-[#101828] font-bold py-3 px-4 rounded-lg" onClick={() => { window.location.href = `/dashboard/transfer/${job.id}`; }}>Pagar por transferencia</button>}{!payphoneAvailable && !transferAvailable && !cardAvailable && <p className="text-sm text-gray-500">Pagos temporalmente no disponibles</p>}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
