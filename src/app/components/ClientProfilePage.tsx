import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { User, MapPin, Bell, Save, Plus, Trash2, Edit2, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '@/shared/context/AuthContext';
import { requestPasswordReset } from '@/services/authService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface Address {
  id: string;
  name: string;
  address: string;
  city: string;
  isDefault: boolean;
}

export function ClientProfilePage() {
  const [activeTab, setActiveTab] = useState<'personal' | 'addresses' | 'notifications' | 'delete'>('personal');
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [accountProvider, setAccountProvider] = useState('local');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // States
  const [personalData, setPersonalData] = useState({
    name: '',
    email: '',
    phone: ''
  });

  const [addresses, setAddresses] = useState<Address[]>([]);

  const [notifications, setNotifications] = useState({
    emailQuotes: true,
    emailMessages: true,
    emailPromos: false
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/client/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error fetching profile');
      const data = await res.json();
      
      setPersonalData({
        name: data.user?.fullName || '',
        email: data.user?.email || '',
        phone: data.user?.phone || ''
      });
      setAccountProvider(data.user?.authProvider || 'local');

      if (data.profile?.addresses) {
        try {
          const parsedAddresses = data.profile.addresses.map((a: string) => JSON.parse(a));
          setAddresses(parsedAddresses);
        } catch (e) {
          console.error('Error parsing addresses', e);
        }
      }
      const preferencesResponse = await fetch(`${API_URL}/notifications/preferences`, { headers: { Authorization: `Bearer ${token}` } });
      if (preferencesResponse.ok) setNotifications(await preferencesResponse.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateNotification = async (key: 'emailQuotes' | 'emailMessages' | 'emailPromos', label: string) => {
    const token = sessionStorage.getItem('authToken');
    if (!token) return;
    const enabled = !notifications[key];
    setErrorMsg('');
    try {
      const res = await fetch(`${API_URL}/notifications/preferences`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preference: key, enabled, label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la preferencia.');
      setNotifications(previous => ({ ...previous, [key]: enabled }));
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'No se pudo guardar la preferencia.');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    try {
      const adrsStrings = addresses.map(a => JSON.stringify(a));
      const res = await fetch(`${API_URL}/client/profile`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          fullName: personalData.name,
          phone: personalData.phone,
          addresses: adrsStrings
        })
      });

      if (!res.ok) throw new Error('Error al guardar los datos');
      
      setSuccessMsg('¡Datos guardados correctamente!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error desconocido');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAddress = () => {
    const newId = Date.now().toString();
    setAddresses([...addresses, { 
      id: newId, 
      name: 'Nueva Dirección', 
      address: '', 
      city: 'Quito', 
      isDefault: addresses.length === 0 
    }]);
  };

  const handleDeleteAddress = (id: string) => {
    setAddresses(addresses.filter(a => a.id !== id));
  };

  const updateAddress = (id: string, field: keyof Address, value: any) => {
    setAddresses(addresses.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleDeleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (deleteConfirmation !== 'ELIMINAR' || !deletePassword || isDeleting) return;
    setIsDeleting(true);
    setErrorMsg('');
    try {
      const token = sessionStorage.getItem('authToken');
      if (!token) throw new Error('Tu sesiÃ³n ha terminado. Inicia sesiÃ³n nuevamente.');
      const response = await fetch(`${API_URL}/client/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo eliminar la cuenta.');
      }
      logout();
      navigate('/', { replace: true });
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'No se pudo eliminar la cuenta.');
    } finally {
      setIsDeleting(false);
      setDeletePassword('');
    }
  };

  const handleRequestPassword = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      setSuccessMsg(await requestPasswordReset(personalData.email));
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'No se pudo enviar el enlace.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-28 flex justify-center items-start">
        <Loader2 className="w-10 h-10 animate-spin text-[#101828]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-28 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-[#101828] mb-2">Mi Perfil</h1>
            <p className="text-gray-500 text-lg">Gestiona tu información personal, direcciones y preferencias.</p>
          </div>
          {activeTab !== 'delete' && <button
            onClick={handleSave}
            disabled={isSaving}
            className="hidden md:flex bg-[#101828] hover:bg-[#202c44] text-white font-bold py-2.5 px-6 rounded-lg transition-colors items-center gap-2"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Guardar todo
          </button>}
        </div>

        {/* Notificaciones */}
        {errorMsg && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 font-medium">
            <AlertCircle className="w-5 h-5" /> {errorMsg}
          </div>
        )}
        {successMsg && (
           <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-2 font-medium animate-in fade-in duration-300">
             <CheckCircle className="w-5 h-5" /> {successMsg}
           </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row min-h-[500px]">
          
          {/* Sidebar Navigation */}
          <div className="w-full md:w-64 bg-gray-50 border-r border-gray-200 p-4 space-y-2 flex-shrink-0">
            <button
              onClick={() => setActiveTab('personal')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left font-medium transition-colors ${
                activeTab === 'personal' ? 'bg-[#FFCA0C] text-[#101828]' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <User className="w-5 h-5" />
              Datos personales
            </button>
            <button
              onClick={() => setActiveTab('addresses')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left font-medium transition-colors ${
                activeTab === 'addresses' ? 'bg-[#FFCA0C] text-[#101828]' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <MapPin className="w-5 h-5" />
              Direcciones
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left font-medium transition-colors ${
                activeTab === 'notifications' ? 'bg-[#FFCA0C] text-[#101828]' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Bell className="w-5 h-5" />
              Notificaciones
            </button>
            <button
              onClick={() => { setActiveTab('delete'); setErrorMsg(''); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left font-medium transition-colors ${
                activeTab === 'delete' ? 'bg-red-50 text-red-700' : 'text-red-600 hover:bg-red-50'
              }`}
            >
              <Trash2 className="w-5 h-5" />
              Eliminar cuenta
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-6 sm:p-8">
            
            {/* Tab: Personal Data */}
            {activeTab === 'personal' && (
              <div className="animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-[#101828] mb-6">Datos Personales</h2>
                <div className="space-y-6 max-w-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                    <input 
                      type="text" 
                      value={personalData.name}
                      onChange={(e) => setPersonalData({...personalData, name: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
                    <input 
                      type="email" 
                      value={personalData.email}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-gray-50 text-gray-500 cursor-not-allowed"
                      disabled
                    />
                    <p className="text-xs text-gray-500 mt-1">El correo no puede modificarse. Contacta a soporte si necesitas cambiarlo.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono móvil</label>
                    <input 
                      type="tel" 
                      value={personalData.phone}
                      onChange={(e) => setPersonalData({...personalData, phone: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] focus:border-transparent"
                    />
                  </div>
                  
                  <div className="pt-4 md:hidden border-t border-gray-100">
                    <button 
                      onClick={handleSave}
                      disabled={isSaving}
                      className="w-full bg-[#101828] hover:bg-[#202c44] text-white font-bold py-2.5 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      Guardar cambios
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Addresses */}
            {activeTab === 'addresses' && (
              <div className="animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-[#101828]">Direcciones</h2>
                  <button 
                    onClick={handleAddAddress}
                    className="text-[#101828] font-semibold flex items-center gap-1.5 hover:text-[#FFCA0C] transition-colors text-sm bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-md"
                  >
                    <Plus className="w-4 h-4" /> Nueva
                  </button>
                </div>
                
                <p className="text-gray-500 mb-6">Tener tus direcciones preguardadas agiliza tus futuras solicitudes de servicios.</p>

                <div className="space-y-4">
                  {addresses.map((addr) => (
                    <div key={addr.id} className="border border-gray-200 rounded-lg p-5 hover:border-[#FFCA0C] transition-colors relative group bg-white shadow-sm">
                      {addr.isDefault && (
                        <span className="absolute top-4 right-4 bg-[#FFCA0C]/20 text-[#8B6B00] text-xs font-bold px-2.5 py-1 rounded-full">
                          Principal
                        </span>
                      )}
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                        <div>
                           <label className="text-xs text-gray-500 font-medium">Nombre (Ej: Casa, Oficina)</label>
                           <input 
                             type="text"
                             value={addr.name}
                             onChange={(e) => updateAddress(addr.id, 'name', e.target.value)}
                             className="w-full mt-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-[#FFCA0C] focus:border-transparent outline-none" 
                           />
                        </div>
                        <div>
                           <label className="text-xs text-gray-500 font-medium">Ciudad</label>
                           <input 
                             type="text"
                             value={addr.city}
                             onChange={(e) => updateAddress(addr.id, 'city', e.target.value)}
                             className="w-full mt-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-[#FFCA0C] focus:border-transparent outline-none" 
                           />
                        </div>
                        <div className="sm:col-span-2">
                           <label className="text-xs text-gray-500 font-medium">Dirección completa</label>
                           <input 
                             type="text"
                             value={addr.address}
                             onChange={(e) => updateAddress(addr.id, 'address', e.target.value)}
                             className="w-full mt-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-[#FFCA0C] focus:border-transparent outline-none" 
                           />
                        </div>
                      </div>

                      <div className="flex gap-4 mt-4 items-center justify-between border-t border-gray-100 pt-3">
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-600">
                          <input 
                             type="checkbox" 
                             checked={addr.isDefault}
                             onChange={(e) => {
                               // Si se marca como default, desmarcar los demás
                               if (e.target.checked) {
                                 setAddresses(addresses.map(a => ({...a, isDefault: a.id === addr.id})));
                               } else {
                                 updateAddress(addr.id, 'isDefault', false);
                               }
                             }}
                             className="text-[#FFCA0C] focus:ring-[#FFCA0C]" 
                          /> 
                          Dirección principal
                        </label>
                        
                        <button 
                          onClick={() => handleDeleteAddress(addr.id)}
                          className="text-sm text-red-600 font-medium hover:underline flex items-center gap-1"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {addresses.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                      <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No tienes direcciones guardadas.</p>
                      <button onClick={handleAddAddress} className="mt-3 text-[#101828] font-bold underline">Añadir una ahora</button>
                    </div>
                  )}

                  <div className="pt-4 md:hidden">
                    <button 
                      onClick={handleSave}
                      disabled={isSaving}
                      className="w-full bg-[#101828] hover:bg-[#202c44] text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"
                    >
                      Guardar cambios
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Notifications */}
            {activeTab === 'notifications' && (
              <div className="animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-[#101828] mb-6">Notificaciones</h2>
                <p className="text-gray-500 mb-8">Guarda tus preferencias para futuros avisos. Las comunicaciones de seguridad y pagos necesarios no dependen de estos ajustes.</p>

                <div className="space-y-6 max-w-lg">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-[#101828]">Nuevos presupuestos recibidos</h3>
                      <p className="text-sm text-gray-500 mt-1">Preferencia para futuros avisos sobre presupuestos.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={notifications.emailQuotes}
                        onChange={() => updateNotification('emailQuotes', 'Nuevos presupuestos recibidos')}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FFCA0C]"></div>
                    </label>
                  </div>

                  <div className="w-full h-px bg-gray-100"></div>

                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-[#101828]">Mensajes de chat</h3>
                      <p className="text-sm text-gray-500 mt-1">Preferencia para futuros avisos sobre mensajes.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={notifications.emailMessages}
                        onChange={() => updateNotification('emailMessages', 'Mensajes de chat')}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FFCA0C]"></div>
                    </label>
                  </div>
                </div>

                <div className="pt-8 md:hidden">
                    <button 
                      onClick={handleSave}
                      disabled={isSaving}
                      className="w-full bg-[#101828] text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2"
                    >
                      Guardar cambios
                    </button>
                  </div>
              </div>
            )}

            {activeTab === 'delete' && (
              <div className="max-w-lg animate-in fade-in duration-300">
                <h2 className="mb-4 text-2xl font-bold text-[#101828]">Eliminar mi cuenta</h2>
                <p className="mb-4 text-sm leading-relaxed text-gray-600">
                  Esta acciÃ³n es permanente. CerrarÃ¡ tu sesiÃ³n, eliminarÃ¡ tus datos de perfil y de contacto,
                  y cerrarÃ¡ tus solicitudes. Se conservan registros de pagos y cotizaciones sin tus datos de contacto.
                </p>
                {accountProvider !== 'local' ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                    <p className="mb-4 text-sm text-gray-700">Para confirmar tu identidad, establece primero una contraseÃ±a mediante el enlace que enviaremos a tu correo. DespuÃ©s inicia sesiÃ³n y vuelve a esta secciÃ³n.</p>
                    <button type="button" onClick={handleRequestPassword} className="rounded-lg bg-[#101828] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#202c44]">
                      Enviar enlace para establecer contraseÃ±a
                    </button>
                  </div>
                ) : <form onSubmit={handleDeleteAccount} className="space-y-5 rounded-xl border border-red-200 bg-red-50 p-5">
                  <div>
                    <label htmlFor="delete-confirmation" className="mb-1 block text-sm font-semibold text-gray-800">
                      Escribe ELIMINAR para confirmar
                    </label>
                    <input id="delete-confirmation" type="text" autoComplete="off" value={deleteConfirmation}
                      onChange={event => setDeleteConfirmation(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                  <div>
                    <label htmlFor="delete-password" className="mb-1 block text-sm font-semibold text-gray-800">ContraseÃ±a actual</label>
                    <input id="delete-password" type="password" autoComplete="current-password" value={deletePassword}
                      onChange={event => setDeletePassword(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                  <button type="submit" disabled={isDeleting || deleteConfirmation !== 'ELIMINAR' || !deletePassword}
                    className="flex items-center justify-center gap-2 rounded-lg bg-red-700 px-5 py-2.5 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Eliminar mi cuenta definitivamente
                  </button>
                </form>}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
