import React, { useState } from 'react';
import { Search, User, Star, Check, ArrowLeft, Clock, X, Info, ShieldCheck, Check as CheckIcon, Pencil, MapPin, MessageCircle, Plus, MoreHorizontal, Camera, Users, Upload, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { useAuth } from '@/shared/context/AuthContext';
import { updateProfessionalProfile } from '@/services/professionalService';
import { UserRole } from '@/domain/types';

export function OnboardingPage() {
  const { updateRole, auth } = useAuth();
  const [selectedRole, setSelectedRole] = useState<'client' | 'freelancer' | null>(auth.role === UserRole.PROFESSIONAL ? 'freelancer' : null);
  const [step, setStep] = useState(auth.role === UserRole.PROFESSIONAL ? 4 : 1);
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro'>('pro'); // Default to pro since it's "Recomendado"
  const [isTeam, setIsTeam] = useState<'independent' | 'team' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [onboardingError, setOnboardingError] = useState('');
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [profileData, setProfileData] = useState({
    fullName: '',
    businessName: '',
    bio: '',
    experienceYears: 0,
    avatarUrl: '',
    skills: [] as string[],
    languages: [] as string[],
    city: '',
    address: '',
    phone: '',
    documentType: 'cedula',
    documentId: '',
    portfolioImages: [] as string[],
  });

  const AVAILABLE_LANGUAGES = [
    'Español', 'Inglés', 'Portugués', 'Francés', 'Alemán',
    'Italiano', 'Quechua', 'Mandarín', 'Japonés', 'Coreano',
    'Árabe', 'Ruso', 'Holandés', 'Sueco', 'Catalán',
  ];
  const navigate = useNavigate();
  
  const [newSkill, setNewSkill] = useState("");
  
  const handleAddSkill = () => {
    if(newSkill.trim() && !profileData.skills.includes(newSkill.trim())) {
      setProfileData(prev => ({ ...prev, skills: [...prev.skills, newSkill.trim()] }));
      setNewSkill("");
    }
  };

  const handleRemoveSkill = (idx: number) => {
    setProfileData(prev => ({ ...prev, skills: prev.skills.filter((_, i) => i !== idx) }));
  };

  const handleNext = async () => {
    setOnboardingError('');
    if (step === 1) {
      if (selectedRole === 'client') {
        setStep(2);
      } else if (selectedRole === 'freelancer') {
        try {
          setIsSubmitting(true);
          await updateRole('pro');
          setStep(4);
        } catch (e) {
          setOnboardingError(e instanceof Error ? e.message : 'No se pudo guardar tu elección. Intenta de nuevo.');
        } finally {
          setIsSubmitting(false);
        }
      }
    } else if (step === 2) {
      try {
        setIsSubmitting(true);
        await updateRole('client');
        navigate('/');
      } catch(e) {
        console.error("Error finalizing onboarding", e);
        setOnboardingError(e instanceof Error ? e.message : 'No se pudo completar el registro.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    } else if (step === 5) {
      setStep(6);
    } else if (step === 3 || step === 6) {
      try {
        setIsSubmitting(true);
        if (selectedRole === 'freelancer') {
          if (profileData.fullName || profileData.businessName || profileData.bio || profileData.portfolioImages.length > 0 || profileData.avatarUrl) {
            await updateProfessionalProfile(profileData);
          }
          navigate('/dashboard');
        } else {
          await updateRole('client');
          navigate('/');
        }
      } catch(e) {
        console.error("Error finalizing onboarding", e);
        setOnboardingError(e instanceof Error ? e.message : 'No se pudo completar el registro.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfileData(prev => ({
        ...prev,
        avatarUrl: reader.result as string
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileData(prev => ({
          ...prev,
          portfolioImages: [...prev.portfolioImages, reader.result as string]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setProfileData(prev => ({
      ...prev,
      portfolioImages: prev.portfolioImages.filter((_, i) => i !== index)
    }));
  };

  const togglePurpose = (purpose: string) => {
    setSelectedPurposes(prev => 
      prev.includes(purpose) 
        ? prev.filter(p => p !== purpose)
        : [...prev, purpose]
    );
  };

  if (step === 4) {
    return (
      <div className="min-h-screen bg-[#F7F7F7] flex flex-col relative pb-24">
        {/* Header content for Freelancer Profile */}
        <div className="flex justify-between items-center px-8 py-4 bg-white border-b border-gray-200">
          <div className="text-[22px] font-black tracking-tighter text-[#101828]">
            Arto<span className="text-[#FFCA0C]">Camello</span>.
          </div>
          <button onClick={() => navigate('/')} className="text-[14px] font-semibold text-[#404145] hover:text-[#101828]">
            Salida
          </button>
        </div>

        <div className="flex-1 w-full max-w-[800px] mx-auto pt-12 px-6">
          <div className="text-center mb-10">
            <h1 className="text-[#101828] text-[32px] font-bold mb-3">Revisa tu nuevo perfil</h1>
            <p className="text-gray-500 text-[16px]">Completa tu perfil con la información que falte. Puedes actualizarlo cuando quieras.</p>
          </div>

          <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm flex flex-col gap-6 mb-8">
            {/* Top Profile Section */}
            <div className="flex items-start gap-6 border-b border-gray-100 pb-6">
              <div className="relative">
                <div className="w-[120px] h-[120px] rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                  <img src={profileData.avatarUrl || "https://images.unsplash.com/photo-1610387694365-19fafcc86d86?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjB3b21hbiUyMHBvcnRyYWl0JTIwb2ZmaWNlfGVufDF8fHx8MTc3Mzg1NjUyOXww&ixlib=rb-4.1.0&q=80&w=1080"} alt="Profile" className="w-full h-full object-cover" />
                </div>
                <label className="absolute bottom-0 right-0 bg-white p-2 rounded-full border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors cursor-pointer">
                  <Camera className="w-4 h-4 text-gray-600" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                </label>
              </div>

              <div className="flex-1 pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    value={profileData.fullName}
                    onChange={(e) => setProfileData(prev => ({ ...prev, fullName: e.target.value }))}
                    className="text-[#101828] text-[24px] font-bold border-b border-dashed border-gray-300 focus:border-[#101828] outline-none bg-transparent placeholder-gray-300"
                  />
                  <Pencil className="w-4 h-4 text-gray-400" />
                </div>
                
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Título ej. Diseñador Gráfico"
                    value={profileData.businessName}
                    onChange={(e) => setProfileData(prev => ({ ...prev, businessName: e.target.value }))}
                    className="text-gray-600 text-[15px] font-medium border-b border-dashed border-gray-300 focus:border-[#101828] outline-none bg-transparent placeholder-gray-300 w-full max-w-[300px]"
                  />
                  <Pencil className="w-4 h-4 text-gray-400" />
                </div>

                <div className="flex items-center gap-6 text-[14px] text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    <input 
                      type="text" 
                      placeholder="Ciudad"
                      value={profileData.city}
                      onChange={(e) => setProfileData(prev => ({...prev, city: e.target.value}))}
                      className="bg-transparent border-b border-dashed border-gray-300 focus:border-[#101828] outline-none text-[#101828] font-medium w-[100px]"
                    />
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4" />
                      <button 
                        onClick={() => setShowLangDropdown(!showLangDropdown)} 
                        className="hover:underline font-medium"
                      >
                        {profileData.languages.length > 0 ? 'Editar idiomas' : 'Agregar idiomas'}
                      </button>
                      <Pencil className="w-3.5 h-3.5" />
                    </div>

                    {/* Language tags */}
                    {profileData.languages.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {profileData.languages.map((lang, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#FFCA0C]/15 border border-[#FFCA0C]/30 rounded-full text-[12px] font-semibold text-[#101828]">
                            {lang}
                            <button onClick={() => setProfileData(prev => ({ ...prev, languages: prev.languages.filter((_, i) => i !== idx) }))} className="text-gray-400 hover:text-red-500 ml-0.5">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Dropdown */}
                    {showLangDropdown && (
                      <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 w-[220px] max-h-[200px] overflow-y-auto">
                        {AVAILABLE_LANGUAGES.filter(l => !profileData.languages.includes(l)).map(lang => (
                          <button
                            key={lang}
                            onClick={() => {
                              setProfileData(prev => ({ ...prev, languages: [...prev.languages, lang] }));
                              setShowLangDropdown(false);
                            }}
                            className="w-full text-left px-4 py-2.5 text-[14px] text-gray-700 hover:bg-gray-50 hover:text-[#101828] font-medium transition-colors"
                          >
                            {lang}
                          </button>
                        ))}
                        {AVAILABLE_LANGUAGES.filter(l => !profileData.languages.includes(l)).length === 0 && (
                          <p className="px-4 py-3 text-[13px] text-gray-400">Todos los idiomas han sido agregados</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* About Section */}
            <div className="border border-gray-200 rounded-xl p-6">
              <h3 className="text-[#101828] text-[20px] font-bold mb-4">Acerca de</h3>
              <textarea 
                className="w-full text-gray-600 text-[15px] leading-relaxed resize-none bg-transparent outline-none min-h-[100px] placeholder:text-gray-400 border border-transparent hover:border-gray-200 focus:border-[#101828] p-2 rounded transition-colors"
                placeholder="Escribe un poco sobre ti y tus habilidades..."
                value={profileData.bio}
                onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
              />
            </div>

            {/* Skills & Experience */}
            <div className="border border-gray-200 rounded-xl p-6">
              <h3 className="text-[#101828] text-[20px] font-bold mb-4">Habilidades y experiencia</h3>
              
              <div className="flex gap-2 mb-6">
                <input 
                  type="text" 
                  placeholder="Ej. Diseño Gráfico, React, Node.js..."
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSkill()}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:border-[#101828] focus:ring-1 focus:ring-[#101828] outline-none"
                />
                <button 
                  onClick={handleAddSkill}
                  className="flex items-center gap-2 text-[#101828] font-semibold text-[14px] px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Agregar nuevo
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {profileData.skills.map((skill, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm font-medium text-gray-700">
                    <span>{skill}</span>
                    <button onClick={() => handleRemoveSkill(idx)} className="text-gray-400 hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Identity & Contact Section */}
            <div className="border border-gray-200 rounded-xl p-6 bg-white">
              <div className="flex items-center gap-2 mb-6">
                <ShieldCheck className="w-6 h-6 text-[#101828]" />
                <h3 className="text-[#101828] text-[20px] font-bold">Identidad y Contacto</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[14px] font-medium text-gray-700">Dirección Completa</label>
                  <input
                    type="text"
                    value={profileData.address}
                    onChange={(e) => setProfileData(prev => ({...prev, address: e.target.value}))}
                    className="px-4 py-2 border border-gray-300 rounded-md focus:border-[#101828] focus:ring-1 focus:ring-[#101828] outline-none"
                    placeholder="Calle Principal #123 y Secundaria"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[14px] font-medium text-gray-700">Teléfono Celular</label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) => setProfileData(prev => ({...prev, phone: e.target.value}))}
                    className="px-4 py-2 border border-gray-300 rounded-md focus:border-[#101828] focus:ring-1 focus:ring-[#101828] outline-none"
                    placeholder="0991234567"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[14px] font-medium text-gray-700">Tipo de Documento</label>
                  <select
                    value={profileData.documentType}
                    onChange={(e) => setProfileData(prev => ({...prev, documentType: e.target.value}))}
                    className="px-4 py-2 border border-gray-300 rounded-md focus:border-[#101828] focus:ring-1 focus:ring-[#101828] outline-none bg-white"
                  >
                    <option value="cedula">Cédula de Identidad</option>
                    <option value="pasaporte">Pasaporte</option>
                    <option value="licencia">Licencia de Conducir</option>
                  </select>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[14px] font-medium text-gray-700">Número de Documento</label>
                  <input
                    type="text"
                    value={profileData.documentId}
                    onChange={(e) => setProfileData(prev => ({...prev, documentId: e.target.value}))}
                    className="px-4 py-2 border border-gray-300 rounded-md focus:border-[#101828] focus:ring-1 focus:ring-[#101828] outline-none"
                    placeholder="0000000000"
                  />
                </div>
              </div>
            </div>

            {/* Work Experience */}
            <div className="border border-gray-200 rounded-xl p-6 relative overflow-hidden">
              <div className="w-2/3">
                <div className="flex items-baseline gap-2 mb-2">
                  <h3 className="text-[#101828] text-[20px] font-bold">Años de experiencia</h3>
                </div>
                <p className="text-gray-600 text-[15px] mb-6">Indica cuántos años de experiencia laboral tienes en tu área.</p>
                
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={profileData.experienceYears || ''}
                  onChange={(e) => setProfileData(prev => ({ ...prev, experienceYears: parseInt(e.target.value) || 0 }))}
                  className="w-24 px-4 py-2 border border-gray-300 rounded-md focus:border-[#101828] focus:ring-1 focus:ring-[#101828] outline-none"
                  placeholder="Ej. 5"
                />
              </div>
              
              {/* Illustration placeholder */}
              <div className="absolute right-6 top-1/2 -translate-y-1/2 w-[120px] h-[90px] bg-[#F5F5F5] rounded-xl flex items-center justify-center border border-gray-100">
                <div className="w-16 h-12 bg-white rounded shadow-sm border border-gray-200 p-1.5 flex flex-col gap-1 relative">
                  <div className="w-8 h-1.5 bg-[#E4E5E7] rounded-sm"></div>
                  <div className="w-12 h-1.5 bg-[#E4E5E7] rounded-sm"></div>
                  <div className="w-10 h-1.5 bg-[#E4E5E7] rounded-sm"></div>
                  <div className="absolute -bottom-2 -left-2 w-6 h-6 bg-[#FFCA0C] rounded shadow flex items-center justify-center text-[#101828]">
                    <Plus className="w-4 h-4" strokeWidth={3} />
                  </div>
                </div>
              </div>
            </div>

            {/* Documents & Portfolio */}
            <div className="border border-gray-200 rounded-xl p-6">
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="text-[#101828] text-[20px] font-bold">Documentos y Portafolio</h3>
                <span className="text-gray-400 text-[14px]">(Opcional)</span>
              </div>
              <p className="text-gray-600 text-[15px] mb-6">Sube fotos de tus trabajos anteriores o documentos que certifiquen tus habilidades.</p>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
                {profileData.portfolioImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg border border-gray-200 overflow-hidden group">
                    <img src={img} alt={`Portafolio ${idx}`} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeImage(idx)}
                      className="absolute top-2 right-2 p-1.5 bg-white/90 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                
                <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 hover:border-[#101828] transition-colors">
                  <Upload className="w-6 h-6 text-gray-400 mb-2" />
                  <span className="text-[13px] font-medium text-gray-500">Subir imagen</span>
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleFileChange} />
                </label>
              </div>
            </div>

          </div>
        </div>

        {/* Fixed Bottom Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-50">
          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-gray-200">
            <div className="h-full bg-[#101828] w-[40%] rounded-r-full"></div>
          </div>
          
          <div className="flex justify-between items-center px-8 py-4 max-w-[1200px] mx-auto">
            <button 
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-[#101828] font-bold text-[15px] hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Ir al panel
            </button>

            <button 
              onClick={() => setStep(5)}
              className="bg-[#101828] text-white px-8 py-2.5 rounded-md font-bold text-[15px] hover:bg-gray-800 transition-colors"
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center">
      {/* Top border bar (optional, like in ArtoCamello) */}
      <div className="w-full h-1 bg-[#E4E5E7]"></div>

      {step === 1 && (
        <div className="w-full max-w-[900px] px-6 pt-6 flex justify-start">
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-500 hover:text-[#101828] transition-colors font-medium text-[15px] group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            Volver al inicio
          </button>
        </div>
      )}

      {step >= 2 && (
        <div className="w-full max-w-[1000px] px-6 pt-6 flex justify-end">
          <button 
            onClick={() => navigate('/')}
            className="text-gray-500 hover:text-[#101828] transition-colors p-1"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}

      <div className={`w-full ${step >= 2 ? 'max-w-[1000px]' : 'max-w-[900px]'} px-6 pt-10 pb-10 flex flex-col items-center flex-grow`}>
        {onboardingError && <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{onboardingError}</p>}
        {step === 1 && (
          <>
            {/* Header Step 1 */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center w-full mb-10"
            >
              <h1 className="text-[#101828] text-[32px] font-bold leading-tight mb-3">
                usuario_prueba, ¡se ha creado tu cuenta! ¿Por qué has recurrido a nuestra plataforma?
              </h1>
              <p className="text-gray-600 text-[18px]">
                Personalizaremos tu experiencia según tus necesidades.
              </p>
            </motion.div>

            {/* Cards Container Step 1 */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-10"
            >
              {/* Card 1: Client */}
              <button
                onClick={() => setSelectedRole('client')}
                className={`relative flex flex-col h-[280px] p-6 rounded-lg border text-left transition-all duration-200 ${
                  selectedRole === 'client' 
                    ? 'border-[#101828] ring-1 ring-[#101828] shadow-md' 
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                {/* Checkbox */}
                <div className={`absolute top-6 right-6 w-[22px] h-[22px] rounded border flex items-center justify-center transition-colors ${
                  selectedRole === 'client'
                    ? 'bg-[#FFCA0C] border-[#FFCA0C]'
                    : 'bg-white border-gray-300'
                }`}>
                  {selectedRole === 'client' && <Check className="w-4 h-4 text-[#101828]" strokeWidth={3} />}
                </div>

                {/* Icon Group */}
                <div className="relative mt-8 mb-auto ml-4">
                  {/* Stacked background papers */}
                  <div className="absolute top-0 left-0 w-[64px] h-[74px] bg-[#E4E5E7] rounded transform -rotate-6 origin-bottom-left"></div>
                  <div className="absolute top-0 left-0 w-[64px] h-[74px] bg-[#F5F5F5] rounded border border-[#E4E5E7] transform rotate-3 origin-bottom-left"></div>
                  
                  {/* Front paper */}
                  <div className="relative z-10 w-[64px] h-[74px] bg-white rounded border border-[#E4E5E7] flex flex-col shadow-sm">
                    <div className="h-[60%] m-1 rounded-[2px] flex items-center justify-center bg-[#ffca0c]">
                      <Search className="w-6 h-6 text-white" strokeWidth={3} />
                    </div>
                    <div className="px-1.5 pb-1 flex-1 flex flex-col justify-center gap-1.5">
                      <div className="w-full h-1 bg-[#E4E5E7] rounded-full"></div>
                      <div className="w-2/3 h-1 bg-[#E4E5E7] rounded-full"></div>
                    </div>
                  </div>
                  
                  {/* Star Badge */}
                  <div className="absolute -bottom-2 -right-2 z-20 w-6 h-6 bg-white rounded-full flex items-center justify-center border border-[#E4E5E7] shadow-sm">
                    <Star className="w-3.5 h-3.5 text-[#101828]" fill="currentColor" />
                  </div>
                </div>

                <h3 className="text-[#101828] text-[20px] font-bold">Soy un cliente</h3>
              </button>

              {/* Card 2: Freelancer */}
              <button
                onClick={() => setSelectedRole('freelancer')}
                className={`relative flex flex-col h-[280px] p-6 rounded-lg border text-left transition-all duration-200 ${
                  selectedRole === 'freelancer' 
                    ? 'border-[#101828] ring-1 ring-[#101828] shadow-md' 
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                {/* Checkbox */}
                <div className={`absolute top-6 right-6 w-[22px] h-[22px] rounded border flex items-center justify-center transition-colors ${
                  selectedRole === 'freelancer'
                    ? 'bg-[#FFCA0C] border-[#FFCA0C]'
                    : 'bg-white border-gray-300'
                }`}>
                  {selectedRole === 'freelancer' && <Check className="w-4 h-4 text-[#101828]" strokeWidth={3} />}
                </div>

                {/* Icon Group */}
                <div className="relative mt-8 mb-auto ml-4">
                  {/* Outer white ring/halo effect for circle */}
                  <div className="absolute inset-0 bg-white rounded-full scale-110 shadow-[0_0_15px_rgba(0,0,0,0.05)]"></div>
                  
                  {/* Main Green Circle with User */}
                  <div className="relative z-10 w-[74px] h-[74px] rounded-full border-4 border-white shadow-sm overflow-hidden flex flex-col items-center justify-end bg-[#ffca0c]">
                    <div className="w-[28px] h-[28px] bg-white rounded-full mb-1"></div>
                    <div className="w-[50px] h-[24px] bg-white rounded-t-[30px]"></div>
                  </div>
                  
                  {/* Star Badge */}
                  <div className="absolute bottom-0 right-0 z-20 w-7 h-7 bg-[#F5F5F5] rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                    <Star className="w-3.5 h-3.5 text-[#101828]" fill="currentColor" />
                  </div>
                </div>

                <h3 className="text-[#101828] text-[20px] font-bold">Soy un profesional</h3>
              </button>
            </motion.div>

            {/* Footer actions Step 1 */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="w-full flex justify-end mt-4"
            >
              <button
                onClick={handleNext}
                disabled={!selectedRole || isSubmitting}
                className={`px-8 py-3 rounded text-[16px] font-semibold transition-all duration-200 ${
                  selectedRole
                    ? 'bg-[#101828] text-white hover:bg-gray-800'
                    : 'bg-[#E4E5E7] text-[#B5B6BA] cursor-not-allowed'
                }`}
              >
                {isSubmitting ? 'Guardando...' : selectedRole === 'freelancer' ? 'Continuar como profesional' : 'Siguiente'}
              </button>
            </motion.div>
          </>
        )}
        
        {step === 2 && (
          <>
            {/* Header Step 2 */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center w-full mb-10"
            >
              <h1 className="text-[#101828] text-[28px] md:text-[32px] font-bold leading-tight mb-3">
                ¿Para qué planeas encargar servicios?
              </h1>
              <p className="text-gray-500 text-[16px] md:text-[18px]">
                Hay algo para todos.
              </p>
            </motion.div>

            {/* Cards Container Step 2 */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-10"
            >
              {/* Card 1: Principal */}
              <button
                onClick={() => togglePurpose('principal')}
                className={`relative flex flex-col h-[280px] p-6 rounded-xl border text-left transition-all duration-200 ${
                  selectedPurposes.includes('principal')
                    ? 'border-[#101828] ring-1 ring-[#101828] shadow-md' 
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <div className={`absolute top-6 right-6 w-[22px] h-[22px] rounded border flex items-center justify-center transition-colors ${
                  selectedPurposes.includes('principal')
                    ? 'bg-[#101828] border-[#101828]'
                    : 'bg-white border-gray-400'
                }`}>
                  {selectedPurposes.includes('principal') && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </div>

                <div className="mt-8 mb-auto relative w-20 h-20">
                  <div className="absolute inset-0 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
                    <div className="h-4 border-b border-gray-200 flex items-center px-1.5 gap-1">
                      <div className="w-[3px] h-[3px] bg-gray-400 rounded-full"></div>
                      <div className="w-[3px] h-[3px] bg-gray-400 rounded-full"></div>
                      <div className="w-[3px] h-[3px] bg-gray-400 rounded-full"></div>
                    </div>
                    <div className="flex-1 flex gap-1 p-1.5 bg-white">
                      <div className="flex-1 bg-[#FFCA0C] rounded-sm"></div>
                      <div className="flex-1 bg-[#FFCA0C] rounded-sm"></div>
                      <div className="flex-1 bg-[#FFCA0C] rounded-sm"></div>
                      <div className="flex-1 bg-[#FFCA0C] rounded-sm"></div>
                    </div>
                  </div>
                  <div className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-gray-100">
                    <Star className="w-4 h-4 text-[#101828]" fill="currentColor" />
                  </div>
                </div>

                <h3 className="text-[#101828] text-[17px] font-bold mt-4 leading-snug">Trabajo o negocio<br/>principal</h3>
              </button>

              {/* Card 2: Secundarios */}
              <button
                onClick={() => togglePurpose('secundario')}
                className={`relative flex flex-col h-[280px] p-6 rounded-xl border text-left transition-all duration-200 ${
                  selectedPurposes.includes('secundario')
                    ? 'border-[#101828] ring-1 ring-[#101828] shadow-md' 
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <div className={`absolute top-6 right-6 w-[22px] h-[22px] rounded border flex items-center justify-center transition-colors ${
                  selectedPurposes.includes('secundario')
                    ? 'bg-[#101828] border-[#101828]'
                    : 'bg-white border-gray-400'
                }`}>
                  {selectedPurposes.includes('secundario') && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </div>

                <div className="mt-8 mb-auto relative w-20 h-20">
                  <div className="absolute inset-0 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
                    <div className="h-4 border-b border-gray-200 flex items-center px-1.5 gap-1">
                      <div className="w-[3px] h-[3px] bg-gray-400 rounded-full"></div>
                      <div className="w-[3px] h-[3px] bg-gray-400 rounded-full"></div>
                      <div className="w-[3px] h-[3px] bg-gray-400 rounded-full"></div>
                    </div>
                    <div className="flex-1 flex p-1.5 gap-1.5">
                      <div className="w-1/3 bg-[#EAEAEA] rounded-sm"></div>
                      <div className="flex-1 flex flex-col gap-1.5">
                        <div className="flex-1 bg-[#FFCA0C] rounded-sm"></div>
                        <div className="flex-1 bg-[#EAEAEA] rounded-sm"></div>
                      </div>
                      <div className="w-1/3 bg-[#EAEAEA] rounded-sm"></div>
                    </div>
                  </div>
                  <div className="absolute -top-3 -right-3 bg-[#FFCA0C] text-[#101828] rounded-full p-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.15)] border-2 border-white">
                    <Clock className="w-4 h-4" strokeWidth={3} />
                  </div>
                </div>

                <h3 className="text-[#101828] text-[17px] font-bold mt-4 leading-snug">Negocios secundarios</h3>
              </button>

              {/* Card 3: Fuera del trabajo */}
              <button
                onClick={() => togglePurpose('fuera')}
                className={`relative flex flex-col h-[280px] p-6 rounded-xl border text-left transition-all duration-200 ${
                  selectedPurposes.includes('fuera')
                    ? 'border-[#101828] ring-1 ring-[#101828] shadow-md' 
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <div className={`absolute top-6 right-6 w-[22px] h-[22px] rounded border flex items-center justify-center transition-colors ${
                  selectedPurposes.includes('fuera')
                    ? 'bg-[#101828] border-[#101828]'
                    : 'bg-white border-gray-400'
                }`}>
                  {selectedPurposes.includes('fuera') && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </div>

                <div className="mt-8 mb-auto relative w-[60px] h-20 ml-2">
                  <div className="absolute inset-0 bg-[#FFF3C4] rounded-lg shadow-sm border border-[#FFE580] flex flex-col items-center py-2">
                    <div className="w-4 h-1 bg-white/80 rounded-full mb-1"></div>
                    <div className="flex-1 w-full"></div>
                    <div className="w-6 h-1 bg-white/80 rounded-full mt-1"></div>
                  </div>
                  <div className="absolute -top-3 -right-5 bg-[#FFCA0C] text-[#101828] rounded-full p-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.15)] border-2 border-white">
                    <User className="w-4 h-4" strokeWidth={3} />
                  </div>
                </div>

                <h3 className="text-[#101828] text-[17px] font-bold mt-4 leading-snug">Necesidades fuera del<br/>trabajo</h3>
              </button>
            </motion.div>

            {/* Footer actions Step 2 */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="w-full flex justify-between items-center mt-auto pt-6"
            >
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 text-[#101828] font-bold text-[15px] hover:text-gray-600 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Volver
              </button>

              <button
                onClick={handleNext}
                disabled={isSubmitting}
                className={`px-8 py-2.5 rounded-md text-[15px] font-bold transition-all duration-200 ${
                  selectedPurposes.length > 0
                    ? 'bg-[#101828] text-white hover:bg-gray-800'
                    : 'bg-[#F5F5F5] text-[#404145] hover:bg-[#EAEAEA]'
                }`}
              >
                {selectedPurposes.length > 0 ? 'Siguiente' : 'Omitir'}
              </button>
            </motion.div>
          </>
        )}



        {step === 5 && (
          <>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center w-full mb-6"
            >
              <h1 className="text-[#101828] text-[32px] font-bold leading-tight mb-3">
                ¿Formas parte de un equipo?
              </h1>
              <p className="text-gray-600 text-[18px]">
                Cuéntanos un poco más sobre cómo trabajas.
              </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full mb-6"
            >
              <button
                onClick={() => setIsTeam('independent')}
                className={`relative flex flex-col items-center justify-center min-h-[210px] md:min-h-[240px] p-6 rounded-lg border text-center transition-all duration-200 ${
                  isTeam === 'independent' 
                    ? 'border-[#101828] ring-1 ring-[#101828] shadow-md' 
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <div className={`absolute top-6 right-6 w-[22px] h-[22px] rounded border flex items-center justify-center transition-colors ${
                  isTeam === 'independent'
                    ? 'bg-[#FFCA0C] border-[#FFCA0C]'
                    : 'bg-white border-gray-300'
                }`}>
                  {isTeam === 'independent' && <Check className="w-4 h-4 text-[#101828]" strokeWidth={3} />}
                </div>

                <div className="mb-6">
                  <div className="w-[80px] h-[80px] rounded-full bg-[#f5f5f5] flex items-center justify-center border border-gray-200 shadow-sm">
                    <User className="w-10 h-10 text-[#101828]" />
                  </div>
                </div>
                <h3 className="text-[#101828] text-[20px] font-bold">No - Trabajo de forma independiente</h3>
              </button>

              <button
                onClick={() => setIsTeam('team')}
                className={`relative flex flex-col items-center justify-center min-h-[210px] md:min-h-[240px] p-6 rounded-lg border text-center transition-all duration-200 ${
                  isTeam === 'team' 
                    ? 'border-[#101828] ring-1 ring-[#101828] shadow-md' 
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <div className={`absolute top-6 right-6 w-[22px] h-[22px] rounded border flex items-center justify-center transition-colors ${
                  isTeam === 'team'
                    ? 'bg-[#FFCA0C] border-[#FFCA0C]'
                    : 'bg-white border-gray-300'
                }`}>
                  {isTeam === 'team' && <Check className="w-4 h-4 text-[#101828]" strokeWidth={3} />}
                </div>

                <div className="mb-6">
                  <div className="w-[80px] h-[80px] rounded-full bg-[#f5f5f5] flex items-center justify-center border border-gray-200 shadow-sm relative">
                    <Users className="w-10 h-10 text-[#101828]" />
                    <div className="absolute -bottom-1 -right-1 bg-[#FFCA0C] w-7 h-7 rounded-full border-2 border-white flex items-center justify-center shadow-sm">
                      <Plus className="w-3.5 h-3.5 text-[#101828]" strokeWidth={3} />
                    </div>
                  </div>
                </div>
                <h3 className="text-[#101828] text-[20px] font-bold">Sí - Soy parte de un equipo</h3>
              </button>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="w-full flex justify-between items-center pt-4"
            >
              <button
                onClick={() => setStep(4)}
                className="flex items-center gap-2 text-[#101828] font-bold text-[15px] hover:text-gray-600 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Volver
              </button>

              <button
                onClick={handleNext}
                disabled={!isTeam}
                className={`px-8 py-3 rounded text-[16px] font-semibold transition-all duration-200 ${
                  isTeam
                    ? 'bg-[#101828] text-white hover:bg-gray-800'
                    : 'bg-[#E4E5E7] text-[#B5B6BA] cursor-not-allowed'
                }`}
              >
                Continuar
              </button>
            </motion.div>
          </>
        )}

        {step === 6 && (
          <>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center w-full mb-10"
            >
              <h1 className="text-[#101828] text-[32px] font-bold leading-tight mb-3">
                ¿Tienes portafolio o sitio web?
              </h1>
              <p className="text-gray-600 text-[18px]">
                Esto no se compartirá públicamente.
              </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="w-full max-w-[600px] mb-10"
            >
              <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-8">
                <div className="mb-2">
                  <span className="text-[#101828] font-bold text-[16px]">Agregar enlaces</span>
                  <span className="text-gray-500 text-[16px] ml-1">(Opcional)</span>
                </div>
                
                <div className="relative mb-6">
                  <input 
                    type="text" 
                    placeholder="mipáginapersonal.com"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-[#101828] focus:ring-1 focus:ring-[#101828] outline-none text-[#101828] placeholder-gray-400 transition-shadow"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#EA4335] rounded px-1.5 py-1 flex items-center justify-center">
                    <div className="flex gap-0.5">
                      <div className="w-1 h-1 bg-white rounded-full"></div>
                      <div className="w-1 h-1 bg-white rounded-full"></div>
                      <div className="w-1 h-1 bg-white rounded-full"></div>
                    </div>
                  </div>
                </div>

                <button className="px-6 py-2.5 rounded-lg border border-[#101828] text-[#101828] font-semibold text-[15px] hover:bg-gray-50 transition-colors">
                  Agregar
                </button>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="w-full max-w-[600px] flex justify-between items-center mt-auto pt-6"
            >
              <button
                onClick={() => setStep(5)}
                className="flex items-center gap-2 text-[#101828] font-bold text-[15px] hover:text-gray-600 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Volver
              </button>

              <button
                onClick={handleNext}
                disabled={isSubmitting}
                className="bg-[#101828] text-white px-8 py-3 rounded text-[16px] font-semibold hover:bg-gray-800 transition-colors"
              >
                Continuar
              </button>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
