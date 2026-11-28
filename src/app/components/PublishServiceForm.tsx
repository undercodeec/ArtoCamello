import React, { useEffect, useRef, useState } from 'react';
import { getAllCategories } from '@/services/categoryService';
import { getCurrentUser } from '@/services/authService';
import { createServiceRequest } from '@/services/requestService';
import { UrgencyLevel } from '@/domain/types';
import { RequestFormValues, toRequestPayload, validateRequestForm } from '@/app/constants/requestForm';
import { useAuth } from '@/shared/context/AuthContext';

const DRAFT_KEY = 'marketplaceRequestDraft';
const KEY_KEY = 'marketplaceRequestIdempotencyKey';
const initial: RequestFormValues = {
  categorySlug: '', title: '', description: '', city: '', location: '', urgency: UrgencyLevel.MEDIUM,
  preferredDate: '', estimatedBudget: '', contactName: '', contactEmail: '', contactPhone: '',
};

export function PublishServiceForm({ onPublished }: { onPublished: () => void | Promise<void> }) {
  const { auth } = useAuth();
  const [values, setValues] = useState<RequestFormValues>(() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) return { ...initial, ...JSON.parse(draft) };
    } catch { /* invalid draft */ }
    const user = getCurrentUser();
    return { ...initial, contactName: user?.fullName || '', contactEmail: user?.email || '', contactPhone: user?.phone || '' };
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const categories = getAllCategories();

  useEffect(() => { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values)); }, [values]);
  const set = (name: keyof RequestFormValues, value: string) => {
    sessionStorage.removeItem(KEY_KEY);
    setSuccess('');
    setValues(current => ({ ...current, [name]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const problem = validateRequestForm(values);
    if (problem) { setError(problem); return; }
    if (!auth.isAuthenticated || auth.role !== 'client') { setError('Inicia sesión como cliente para publicar una solicitud.'); return; }
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    setSuccess('');
    let idempotencyKey = sessionStorage.getItem(KEY_KEY);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      sessionStorage.setItem(KEY_KEY, idempotencyKey);
    }
    try {
      await createServiceRequest(toRequestPayload(values), idempotencyKey);
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(KEY_KEY);
      const user = getCurrentUser();
      setValues({ ...initial, contactName: user?.fullName || '', contactEmail: user?.email || '', contactPhone: user?.phone || '' });
      await onPublished();
      setSuccess('Solicitud publicada. Ya aparece en tu historial de abajo.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo publicar la solicitud.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const field = (name: keyof RequestFormValues, label: string, type = 'text', required = true) => (
    <div><label htmlFor={`publish-${name}`} className="mb-1 block text-sm font-semibold text-[#101828]">{label}</label>
      <input id={`publish-${name}`} type={type} value={values[name]} onChange={e => set(name, e.target.value)} required={required}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FFCA0C]" /></div>
  );

  return <section id="publicar-solicitud" aria-labelledby="publish-heading" className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 id="publish-heading" className="text-2xl font-bold text-[#101828]">Publica el servicio que necesitas</h2>
       <p className="mt-2 text-gray-600">Publicar es gratis. Los profesionales elegibles de la categoría verán una vista previa sin tu dirección ni datos de contacto. Podrán contactarte tras pagar por desbloquearlos; las conversaciones pueden ocurrir fuera de la plataforma. No se garantiza una cantidad de propuestas ni un plazo de respuesta.</p>
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Borrador guardado en esta sesión. Solo será visible para profesionales cuando pulses Publicar solicitud.</p>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div><label htmlFor="publish-categorySlug" className="mb-1 block text-sm font-semibold">Categoría</label>
          <select id="publish-categorySlug" value={values.categorySlug} onChange={e => set('categorySlug', e.target.value)} required className="w-full rounded-lg border border-gray-300 px-4 py-3">
            <option value="">Selecciona una categoría</option>{categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select></div>
        {field('title', 'Título de la necesidad')}
        <div><label htmlFor="publish-description" className="mb-1 block text-sm font-semibold">Descripción</label>
          <textarea id="publish-description" value={values.description} onChange={e => set('description', e.target.value)} required rows={4} className="w-full rounded-lg border border-gray-300 px-4 py-3" /></div>
        <div className="grid gap-5 sm:grid-cols-2"><div>{field('city', 'Ciudad')}<p className="mt-1 text-xs text-gray-500">Escribe solo la ciudad (por ejemplo, Quito); la dirección se mantiene privada.</p></div>{field('location', 'Dirección privada')}</div>
        <div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="publish-urgency" className="mb-1 block text-sm font-semibold">Urgencia</label>
          <select id="publish-urgency" value={values.urgency} onChange={e => set('urgency', e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-3">
            <option value="low">Flexible</option><option value="medium">Próximos días</option><option value="high">Lo antes posible</option>
          </select></div>{field('preferredDate', 'Fecha preferida (opcional)', 'date', false)}</div>
        {field('estimatedBudget', 'Presupuesto estimado (USD)', 'number')}
        <h2 className="border-t pt-5 text-xl font-bold">Tus datos de contacto</h2>
        <div className="grid gap-5 sm:grid-cols-2">{field('contactName', 'Nombre')}{field('contactEmail', 'Correo', 'email')}</div>
        {field('contactPhone', 'Teléfono', 'tel')}
        {success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{success}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={submitting} className="w-full rounded-lg bg-[#101828] px-6 py-4 font-bold text-white disabled:opacity-60">{submitting ? 'Publicando...' : 'Publicar solicitud'}</button>
      </form>
  </section>;
}
