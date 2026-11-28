import React, { useState, useEffect, useRef } from 'react';
import {
  Camera, MapPin, Wrench, Image as ImageIcon, Bell, Lock,
  Save, CheckCircle, AlertCircle, Loader2, X, Plus, Phone, Mail, User
} from 'lucide-react';
import { getCurrentAuth, requestPasswordReset, logout } from '@/services/authService';
import { useNavigate } from 'react-router';
import { SERVICE_OPTIONS, serviceId } from '@/app/constants/serviceSearch';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// ─── Zonas de Ecuador disponibles ─────────────────────────────────────────────
const AVAILABLE_ZONES = [
  'Quito - Norte', 'Quito - Centro', 'Quito - Sur', 'Quito - Valles',
  'Cumbayá', 'Tumbaco', 'Sangolquí', 'Guayaquil', 'Cuenca', 'Ambato',
  'Loja', 'Ibarra', 'Latacunga', 'Riobamba', 'Portoviejo', 'Manta',
  'Quevedo', 'Santo Domingo', 'Esmeraldas', 'Machala',
];

// ─── Toast component ──────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'loading';
interface Toast { type: ToastType; message: string }

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProfileData {
  // User fields
  fullName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  // ProfessionalProfile fields
  businessName: string;
  bio: string;
  categories: string[];
  serviceZones: string[];
  experienceYears: number;
  portfolioImages: string[];
  skills: string[];
  city: string;
  address: string;
  documentType: string;
  documentId: string;
}

const EMPTY_PROFILE: ProfileData = {
  fullName: '', email: '', phone: '', avatarUrl: '',
  businessName: '', bio: '', categories: [], serviceZones: [],
  experienceYears: 0, portfolioImages: [],
  skills: [], city: '', address: '', documentType: 'cedula', documentId: ''
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProProfileSettings() {
  const auth = getCurrentAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'profile' | 'settings'>('profile');
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [verificationPending, setVerificationPending] = useState(false);

  // Password change state
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, boolean> | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [accountProvider, setAccountProvider] = useState('local');
  
  const [newSkill, setNewSkill] = useState("");

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);

  // ── Load profile from backend ─────────────────────────────────────────────
  useEffect(() => {
    const token = sessionStorage.getItem('authToken');
    if (!token) { setLoading(false); return; }

    fetch(`${API_URL}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setVerificationPending(data.profile?.verified === false);
          setAccountProvider(data.user.authProvider || 'local');
          setProfile({
            fullName:        data.user.fullName        || '',
            email:           data.user.email           || '',
            phone:           data.user.phone           || '',
            avatarUrl:       data.user.avatarUrl       || '',
            businessName:    data.profile?.businessName || '',
            bio:             data.profile?.bio          || '',
            categories:      [...new Set<string>((data.profile?.categories || []).map((category: string) => serviceId(category) || category))],
            serviceZones:    data.profile?.serviceZones || [],
            experienceYears: data.profile?.experienceYears || 0,
            portfolioImages: data.profile?.portfolioImages || [],
            skills:          data.profile?.skills || [],
            city:            data.profile?.city || '',
            address:         data.profile?.address || '',
            documentType:    data.profile?.documentType || 'cedula',
            documentId:      data.profile?.documentId || '',
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    fetch(`${API_URL}/notifications/preferences`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { if (!response.ok) throw new Error('No se pudieron cargar las preferencias.'); return response.json(); })
      .then(setPreferences).catch(() => showToast('error', 'No se pudieron cargar las preferencias.'));
  }, []);

  const handleDeleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (deleting || deleteConfirmation !== 'ELIMINAR' || !deletePassword) return;
    setDeleting(true);
    try {
      const response = await fetch(`${API_URL}/pro/account`, { method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('authToken')}` },
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cerrar la cuenta.');
      logout();
      navigate('/', { replace: true });
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'No se pudo cerrar la cuenta.');
    } finally { setDeleting(false); setDeletePassword(''); }
  };

  const showToast = (type: ToastType, message: string) => {
    setToast({ type, message });
    if (type !== 'loading') setTimeout(() => setToast(null), 4000);
  };

  // ── Save profile ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    const token = sessionStorage.getItem('authToken');
    if (!token) return;
    if (profile.categories.length === 0) {
      showToast('error', 'Selecciona al menos un servicio antes de guardar el perfil.');
      document.getElementById('professional-services')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    showToast('loading', 'Guardando cambios...');
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fullName:        profile.fullName,
          phone:           profile.phone,
          avatarUrl:       profile.avatarUrl,
          businessName:    profile.businessName,
          bio:             profile.bio,
          categories:      profile.categories,
          serviceZones:    profile.serviceZones,
          experienceYears: profile.experienceYears,
          portfolioImages: profile.portfolioImages,
          skills:          profile.skills,
          city:            profile.city,
          address:         profile.address,
          documentType:    profile.documentType,
          documentId:      profile.documentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      // Update session cache with new name
      try {
        const cached = sessionStorage.getItem('cachedUser');
        if (cached) {
          const u = JSON.parse(cached);
          sessionStorage.setItem('cachedUser', JSON.stringify({ ...u, fullName: profile.fullName, avatarUrl: profile.avatarUrl, phone: profile.phone }));
        }
      } catch { /* ignore */ }

       if (data.requiresVerification) setVerificationPending(true);
       showToast('success', data.requiresVerification ? 'Cambios guardados. El perfil requiere nueva verificación antes de recibir solicitudes.' : '¡Perfil guardado correctamente!');
    } catch (err: any) {
      showToast('error', err.message || 'Error al guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('error', 'La foto debe pesar menos de 2 MB.'); return; }
    const base64 = await fileToBase64(file);
    setProfile((p) => ({ ...p, avatarUrl: base64 }));
  };

  // ── Portfolio image upload ────────────────────────────────────────────────
  const handlePortfolioAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (profile.portfolioImages.length + files.length > 8) {
      showToast('error', 'Máximo 8 fotos de portafolio.');
      return;
    }
    const newImgs = await Promise.all(files.map(fileToBase64));
    setProfile((p) => ({ ...p, portfolioImages: [...p.portfolioImages, ...newImgs] }));
    e.target.value = '';
  };

  const handlePortfolioRemove = (idx: number) => {
    setProfile((p) => ({ ...p, portfolioImages: p.portfolioImages.filter((_, i) => i !== idx) }));
  };

  // ── Category toggle ───────────────────────────────────────────────────────
  const toggleCategory = (slug: string) => {
    setProfile((p) => ({
      ...p,
      categories: p.categories.includes(slug)
        ? p.categories.filter((c) => c !== slug)
        : [...p.categories, slug],
    }));
  };
  
  const handleAddSkill = () => {
    if(newSkill.trim() && !profile.skills.includes(newSkill.trim())) {
      setProfile(prev => ({ ...prev, skills: [...prev.skills, newSkill.trim()] }));
      setNewSkill("");
    }
  };

  const handleRemoveSkill = (idx: number) => {
    setProfile(prev => ({ ...prev, skills: prev.skills.filter((_, i) => i !== idx) }));
  };

  // ── Zone toggle ───────────────────────────────────────────────────────────
  const toggleZone = (zone: string) => {
    setProfile((p) => ({
      ...p,
      serviceZones: p.serviceZones.includes(zone)
        ? p.serviceZones.filter((z) => z !== zone)
        : [...p.serviceZones, zone],
    }));
  };

  // ── Password change ───────────────────────────────────────────────────────
  const handlePasswordChange = async () => {
    if (!currentPwd || !newPwd || !confirmPwd) { showToast('error', 'Completa todos los campos de contraseña.'); return; }
    if (newPwd !== confirmPwd) { showToast('error', 'Las contraseñas nuevas no coinciden.'); return; }
    if (newPwd.length < 8) { showToast('error', 'La nueva contraseña debe tener al menos 8 caracteres.'); return; }

    const token = sessionStorage.getItem('authToken');
    setPwdSaving(true);
    try {
      const res = await fetch(`${API_URL}/profile/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('success', 'Contraseña actualizada correctamente.');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      showToast('error', err.message || 'Error al cambiar contraseña.');
    } finally {
      setPwdSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="w-10 h-10 text-[#101828] animate-spin" />
        <p className="text-gray-500">Cargando tu perfil...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 transition-all animate-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-green-600 text-white' :
          toast.type === 'error'   ? 'bg-red-600 text-white' :
                                     'bg-[#101828] text-white'
        }`}>
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 shrink-0" />}
          {toast.type === 'error'   && <AlertCircle className="w-5 h-5 shrink-0" />}
          {toast.type === 'loading' && <Loader2 className="w-5 h-5 animate-spin shrink-0" />}
          <span className="font-medium text-sm">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#101828]">Mi Perfil y Configuración</h1>
          <p className="text-gray-500 mt-1">Gestiona cómo te ven los clientes y tus preferencias de cuenta.</p>
        </div>
        {activeTab === 'profile' && (
          <button
            id="btn-save-profile"
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 font-bold py-3 px-6 rounded-xl transition-all ${
              saving ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[#101828] hover:bg-gray-800 text-white hover:shadow-lg'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Guardando...' : 'Guardar Perfil'}
          </button>
        )}
      </div>

      {verificationPending && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-950">Tu perfil está pendiente de verificación. No aparecerá en las búsquedas ni podrá recibir o comprar nuevas solicitudes hasta que administración lo apruebe.</div>}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['profile', 'settings'] as const).map((tab) => (
          <button key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-semibold text-sm border-b-2 transition-colors ${
              activeTab === tab ? 'border-[#101828] text-[#101828]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'profile' ? 'Perfil Público' : 'Configuración de Cuenta'}
          </button>
        ))}
      </div>

      {/* ─── TAB: PERFIL ─────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left — Main Info */}
          <div className="lg:col-span-2 space-y-6">

            {/* Basic Info Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-lg text-[#101828] mb-5">Información Básica</h3>

              {/* Avatar */}
              <div className="flex items-start gap-6 mb-6">
                <div className="relative shrink-0">
                  <div className="w-24 h-24 rounded-full bg-gray-100 overflow-hidden border-4 border-white shadow-md">
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-400">
                        {profile.fullName.charAt(0).toUpperCase() || <User className="w-10 h-10" />}
                      </div>
                    )}
                  </div>
                  <button
                    id="btn-change-avatar"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full border border-gray-200 shadow-sm text-gray-600 hover:text-[#101828] hover:border-[#101828] transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>

                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#404145] mb-1.5">Nombre Completo *</label>
                      <input
                        id="input-fullname"
                        type="text"
                        value={profile.fullName}
                        onChange={(e) => setProfile(p => ({ ...p, fullName: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all"
                        placeholder="Ej: Juan Carlos Pérez"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#404145] mb-1.5">Nombre del Negocio</label>
                      <input
                        id="input-business-name"
                        type="text"
                        value={profile.businessName}
                        onChange={(e) => setProfile(p => ({ ...p, businessName: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all"
                        placeholder="Ej: Servicios Eléctricos JC"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#404145] mb-1.5 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" /> Teléfono
                      </label>
                      <input
                        id="input-phone"
                        type="tel"
                        value={profile.phone}
                        onChange={(e) => setProfile(p => ({ ...p, phone: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all"
                        placeholder="+593 99 123 4567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#404145] mb-1.5 flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" /> Correo Electrónico
                      </label>
                      <input
                        type="email"
                        value={profile.email}
                        disabled
                        className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-gray-400 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-400 mt-1">El correo no se puede cambiar.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#404145] mb-1.5">Ciudad</label>
                      <input
                        type="text"
                        value={profile.city}
                        onChange={(e) => setProfile(p => ({ ...p, city: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all"
                        placeholder="Quito, Ecuador"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#404145] mb-1.5">Dirección Completa</label>
                      <input
                        type="text"
                        value={profile.address}
                        onChange={(e) => setProfile(p => ({ ...p, address: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all"
                        placeholder="Av. Principal y Secundaria"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#404145] mb-1.5">Tipo de Documento</label>
                      <select
                        value={profile.documentType}
                        onChange={(e) => setProfile(p => ({ ...p, documentType: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all bg-white"
                      >
                        <option value="cedula">Cédula de Identidad</option>
                        <option value="pasaporte">Pasaporte</option>
                        <option value="licencia">Licencia de Conducir</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#404145] mb-1.5">Número de Documento</label>
                      <input
                        type="text"
                        value={profile.documentId}
                        onChange={(e) => setProfile(p => ({ ...p, documentId: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all"
                        placeholder="1102934..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bio / Pitch */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-[#404145]">
                  Descripción / "Pitch" — ¿Por qué deberían elegirte?
                </label>
                <textarea
                  id="input-bio"
                  value={profile.bio}
                  onChange={(e) => setProfile(p => ({ ...p, bio: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 h-32 resize-none transition-all"
                  placeholder="Cuéntale a los clientes quién eres, tu experiencia, garantías y por qué eres la mejor opción..."
                />
                <p className="text-xs text-gray-400">{profile.bio.length} / 500 caracteres</p>
              </div>

              {/* Experience */}
              <div className="mt-4">
                <label className="block text-sm font-semibold text-[#404145] mb-1.5">Años de experiencia</label>
                <input
                  id="input-experience"
                  type="number"
                  min="0"
                  max="50"
                  value={profile.experienceYears}
                  onChange={(e) => setProfile(p => ({ ...p, experienceYears: parseInt(e.target.value) || 0 }))}
                  className="w-32 border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all"
                />
              </div>
            </div>

            {/* Portfolio */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-lg text-[#101828]">Portafolio — Fotos de trabajos realizados</h3>
                <span className="text-sm text-gray-400">{profile.portfolioImages.length} / 8</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                {/* Upload slot */}
                {profile.portfolioImages.length < 8 && (
                  <button
                    id="btn-add-portfolio"
                    onClick={() => portfolioInputRef.current?.click()}
                    className="aspect-square bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-100 hover:border-[#101828] hover:text-[#101828] cursor-pointer transition-all"
                  >
                    <Plus className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">Añadir foto</span>
                  </button>
                )}
                <input
                  ref={portfolioInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePortfolioAdd}
                />

                {/* Existing images */}
                {profile.portfolioImages.map((img, idx) => (
                  <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-gray-200 relative group">
                    <img src={img} className="w-full h-full object-cover" alt={`Portfolio ${idx + 1}`} />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <button
                        id={`btn-remove-portfolio-${idx}`}
                        onClick={() => handlePortfolioRemove(idx)}
                        className="bg-white text-red-600 p-1.5 rounded-full shadow-md hover:bg-red-600 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Añade hasta 8 fotos de trabajos anteriores. Máx 2 MB por imagen.
              </p>
            </div>
          </div>

          {/* Right — Categories & Zones */}
          <div className="space-y-6">

            {/* Skills */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-[#101828] mb-4">Habilidades Extras</h3>
              <div className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSkill()}
                  placeholder="Ej. Photoshop, React..."
                  className="flex-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all"
                />
                <button 
                  onClick={handleAddSkill}
                  className="bg-gray-100 text-[#101828] font-bold py-2 px-3 hover:bg-gray-200 transition-colors rounded-lg flex items-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs font-medium text-gray-700">
                    <span>{skill}</span>
                    <button onClick={() => handleRemoveSkill(idx)} className="text-gray-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div id="professional-services" className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-[#101828] flex items-center gap-2 mb-4">
                <Wrench className="w-5 h-5 text-[#FFCA0C]" /> Servicios que ofreces <span className="text-xs font-medium text-red-700">Obligatorio</span>
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                Los clientes podrán encontrarte según estas categorías.
              </p>
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {SERVICE_OPTIONS.map(({ slug, label }) => (
                  <label key={slug} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      id={`cat-${slug}`}
                      checked={profile.categories.includes(slug)}
                      onChange={() => toggleCategory(slug)}
                      className="w-4 h-4 rounded border-gray-300 text-[#101828] focus:ring-[#101828]"
                    />
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
              {profile.categories.filter(category => !SERVICE_OPTIONS.some(option => option.slug === category)).map(category => <span key={category} className="mt-2 mr-2 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">{category}<button type="button" onClick={() => toggleCategory(category)} aria-label={`Quitar ${category}`}><X className="h-3 w-3" /></button></span>)}
              {profile.categories.length === 0 && <p className="mt-3 text-xs font-medium text-amber-800">Elige al menos un servicio para recibir solicitudes de tu especialidad.</p>}
              {profile.categories.length > 0 && (
                <p className="text-xs text-green-600 font-medium mt-3">
                  ✓ {profile.categories.length} {profile.categories.length === 1 ? 'servicio seleccionado' : 'servicios seleccionados'}
                </p>
              )}
            </div>

            {/* Service Zones */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-bold text-[#101828] flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-blue-500" /> Zonas de trabajo
              </h3>
               <p className="text-xs text-gray-500 mb-3">Usamos estas zonas para excluir solicitudes de otras ciudades cuando sea posible. Las zonas por sector no verifican el barrio exacto; confirma la cobertura antes de pagar. Sin zonas o con ciudades no reconocidas pueden aparecer solicitudes de otras áreas.</p>
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {AVAILABLE_ZONES.map((zone) => (
                  <label key={zone} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      id={`zone-${zone}`}
                      checked={profile.serviceZones.includes(zone)}
                      onChange={() => toggleZone(zone)}
                      className="w-4 h-4 rounded border-gray-300 text-[#101828] focus:ring-[#101828]"
                    />
                    <span className="text-sm font-medium text-gray-700">{zone}</span>
                  </label>
                ))}
              </div>
              {profile.serviceZones.length > 0 && (
                <p className="text-xs text-green-600 font-medium mt-3">
                  ✓ {profile.serviceZones.length} {profile.serviceZones.length === 1 ? 'zona seleccionada' : 'zonas seleccionadas'}
                </p>
              )}
            </div>

            {/* Save (mobile) */}
            <button
              onClick={handleSave}
              disabled={saving}
              className={`w-full flex items-center justify-center gap-2 font-bold py-3 px-6 rounded-xl transition-all lg:hidden ${
                saving ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#101828] hover:bg-gray-800 text-white'
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Guardando...' : 'Guardar Perfil'}
            </button>
          </div>
        </div>
      )}

      {/* ─── TAB: CONFIGURACIÓN ──────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-6">

          {/* Notifications */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-lg text-[#101828] flex items-center gap-2 mb-5">
              <Bell className="w-5 h-5" /> Notificaciones y Alertas
            </h3>
            <div className="space-y-4">
              {[
                { id: 'notif-new-jobs',     label: 'Nuevas solicitudes directas',   desc: 'Recibe un email si un cliente envía una solicitud directamente a tu perfil. No incluye el contacto del cliente.' },
                { id: 'notif-client-msgs',  label: 'Mensajes de clientes',         desc: 'Preferencia para futuros avisos de mensajes.' },
                { id: 'notif-newsletter',   label: 'Boletín y consejos',           desc: 'Preferencia para futuros boletines (no habilitados todavía).' },
              ].map((item, i) => (
                <div key={item.id} className={`flex items-center justify-between py-4 ${i < 2 ? 'border-b border-gray-100' : ''}`}>
                  <div>
                    <p className="font-semibold text-[#101828] text-sm">{item.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-4">
                    <input 
                      id={item.id} 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={preferences?.[item.id] ?? false}
                      disabled={!preferences}
                      onChange={async (e) => {
                        const enabled = e.target.checked;
                        const token = sessionStorage.getItem('authToken');
                        try {
                          showToast('loading', enabled ? `Activando "${item.label}"...` : `Desactivando "${item.label}"...`);
                          const res = await fetch(`${API_URL}/notifications/preferences`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ preference: item.id, enabled, label: item.label }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error);
                          setPreferences(previous => ({ ...previous, [item.id]: enabled }));
                          showToast('success', data.message || (enabled ? `"${item.label}" activada` : `"${item.label}" desactivada`));
                        } catch (err: any) {
                          showToast('error', err.message || 'Error al actualizar la preferencia.');
                        }
                      }}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#101828]"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-lg text-red-800 mb-3">Cerrar mi cuenta profesional</h3>
            <p className="text-sm text-gray-600 mb-4">El perfil dejará de ser público y se retirarán sus datos personales. Se conservan compras, pagos y cotizaciones históricas para trazabilidad; no se eliminan las copias de seguridad. Si tienes pagos pendientes, deberás resolverlos primero.</p>
            {accountProvider !== 'local' ? <button type="button" onClick={async () => { try { showToast('success', await requestPasswordReset(profile.email)); } catch (error) { showToast('error', error instanceof Error ? error.message : 'No se pudo enviar el enlace.'); } }} className="text-sm font-semibold underline">Establecer contraseña por correo antes de cerrar la cuenta</button> :
              <form onSubmit={handleDeleteAccount} className="space-y-3">
                <label className="block text-sm font-medium">Escribe ELIMINAR<input type="text" autoComplete="off" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} className="mt-1 block w-full border rounded-lg p-2" /></label>
                <label className="block text-sm font-medium">Contraseña actual<input type="password" autoComplete="current-password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} className="mt-1 block w-full border rounded-lg p-2" /></label>
                <button type="submit" disabled={deleting || deleteConfirmation !== 'ELIMINAR' || !deletePassword} className="bg-red-700 text-white rounded-lg px-4 py-2 disabled:opacity-50">{deleting ? 'Cerrando...' : 'Cerrar cuenta definitivamente'}</button>
              </form>}
          </div>

          {/* Password */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-lg text-[#101828] flex items-center gap-2 mb-5">
              <Lock className="w-5 h-5" /> Cambiar Contraseña
            </h3>
            <div className="space-y-4 max-w-sm">
              <div>
                <label className="block text-sm font-semibold text-[#404145] mb-1.5">Contraseña Actual</label>
                <input
                  id="input-current-password"
                  type="password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#404145] mb-1.5">Nueva Contraseña</label>
                <input
                  id="input-new-password"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828]/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#404145] mb-1.5">Confirmar Nueva Contraseña</label>
                <input
                  id="input-confirm-password"
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 transition-all ${
                    confirmPwd && confirmPwd !== newPwd
                      ? 'border-red-400 focus:ring-red-400/20'
                      : 'border-gray-300 focus:border-[#101828] focus:ring-[#101828]/20'
                  }`}
                />
                {confirmPwd && confirmPwd !== newPwd && (
                  <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden.</p>
                )}
              </div>
              <button
                id="btn-change-password"
                onClick={handlePasswordChange}
                disabled={pwdSaving}
                className={`flex items-center gap-2 font-bold py-2.5 px-6 rounded-xl transition-all ${
                  pwdSaving
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 hover:bg-[#101828] hover:text-white text-[#101828]'
                }`}
              >
                {pwdSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {pwdSaving ? 'Actualizando...' : 'Actualizar Contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
