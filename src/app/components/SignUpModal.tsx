import image_62a7846a80b09f8084074694693eb26e2a63983f from 'figma:asset/62a7846a80b09f8084074694693eb26e2a63983f.png'
import React, { useEffect, useState } from 'react';
import { Mail, Check, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import image_fb32730281815c0feebcfe4031ae69e8b144e389 from 'figma:asset/fb32730281815c0feebcfe4031ae69e8b144e389.png';
import { useAuth } from '@/shared/context/AuthContext';
import { UserRole } from '@/domain/types';

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'login' | 'signup';
}

export function SignUpModal({ isOpen, onClose, initialView = 'signup' }: SignUpModalProps) {
  const [isLoginView, setIsLoginView] = useState(false);
  const [isEmailFlow, setIsEmailFlow] = useState(false);
  const [isProLogin, setIsProLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const navigate = useNavigate();
  const { login, register } = useAuth();

  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reset view to initial state when modal opens
      setIsLoginView(initialView === 'login');
      setIsEmailFlow(true);
      setIsProLogin(false);
      setVerificationSent(false);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, initialView]);

  useEffect(() => {
    // We remove the auto-fill demo logic since we are using real backend now!
    // But we still set it for convenience if you want.
    if (isEmailFlow && !isLoginView) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } else if (isEmailFlow && isLoginView) {
      setEmail('');
      setPassword('');
    }
  }, [isEmailFlow, isLoginView]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    
    try {
      if (isLoginView) {
        const user = await login(email, password);
        onClose();
        if (user.role === UserRole.PROFESSIONAL) {
          navigate('/dashboard');
        } else {
          // Si es cliente, se queda donde está o va a perfil
        }
      } else {
        // Validación de coincidencia de contraseñas
        if (password !== confirmPassword) {
          setErrorMsg('Las contraseñas no coinciden.');
          setIsLoading(false);
          return;
        }

        // En registro, asignamos fullName provisional desde email
        const defaultName = email.split('@')[0];
        const result = await register({ 
          email, 
          password, 
          fullName: defaultName,
          role: UserRole.GUEST 
        });
        
        if (result.requiresVerification) {
           setVerificationSent(true);
        } else {
           onClose();
           navigate('/onboarding');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocurrió un error. Verifica tus datos.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      {/* Overlay click to close */}
      <div className="absolute inset-0" onClick={onClose} />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-[850px] max-h-[100dvh] sm:max-h-[90dvh] bg-white sm:rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 hover:bg-gray-200 text-gray-500 transition-colors backdrop-blur-sm shadow-sm"
          aria-label="Cerrar"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 1L1 13M1 1L13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Scrollable content wrapper */}
        <div className="flex flex-col md:flex-row w-full h-full overflow-y-auto overflow-x-hidden">

        {/* Left Panel - Dark Red Background */}
        <div className="w-full md:w-[45%] bg-[#FFCA0C] flex flex-col relative overflow-hidden shrink-0">
          <div className="p-10 pb-0 z-10 flex-grow">
            <h2 className="text-[#101828] text-[32px] font-bold leading-tight mb-8">
              El éxito comienza aquí
            </h2>
            
            <div className="space-y-6 text-[#101828] font-medium text-[17px] leading-snug">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={2} />
                <span>Más de 700 categorías</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={2} />
                <span>Trabajo de calidad realizado con mayor rapidez</span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={2} />
                <span>Acceso a talento profesional y negocios de todo el mundo</span>
              </div>
            </div>
          </div>
          
          {/* Image at bottom */}
          <div className="mt-8 relative z-0">
            <img 
              src={image_62a7846a80b09f8084074694693eb26e2a63983f} 
              alt="Mujer trabajando" 
              className="w-full h-auto object-cover object-bottom"
              style={{ maxHeight: '280px' }}
            />
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="w-full md:w-[55%] p-10 lg:p-14 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            {isEmailFlow && (
              <button 
                onClick={() => setIsEmailFlow(false)}
                className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                aria-label="Volver"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            )}
            <h2 className="text-[#404145] text-[28px] font-bold">
              {isEmailFlow 
                ? (isLoginView ? 'Inicia sesión con tu correo' : 'Continuar con tu correo electrónico')
                : (isLoginView ? 'Inicia sesión en tu cuenta' : 'Crear una cuenta nueva')}
            </h2>
          </div>
          <p className="text-gray-600 mb-8 text-[15px]">
            {isLoginView ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}{' '}
            <button 
              onClick={() => {
                setIsLoginView(!isLoginView);
                setIsEmailFlow(false);
              }} 
              className="text-[#404145] font-semibold underline hover:text-[#1DBF73] transition-colors"
            >
              {isLoginView ? 'Únete aquí' : 'Iniciar sesión'}
            </button>
          </p>

          {!isEmailFlow ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
              {/* Email access */}
              <button 
                onClick={() => setIsEmailFlow(true)}
                className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-md py-3 px-4 hover:bg-gray-50 transition-colors font-semibold text-[#404145]"
              >
                <Mail className="w-5 h-5" />
                Continuar con el correo electrónico
              </button>

              {/* Email Button */}
              <button 
                onClick={() => setIsEmailFlow(true)}
                className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-md py-3 px-4 hover:bg-gray-50 transition-colors font-semibold text-[#404145]"
              >
                <Mail className="w-5 h-5" />
                Continuar con el correo electrónico
              </button>

              {/* Divider */}
              <div className="flex items-center gap-4 py-2">
                <div className="flex-grow h-px bg-gray-200"></div>
                <div className="w-2 h-2 rounded-full border-2 border-gray-300"></div>
                <div className="flex-grow h-px bg-gray-200"></div>
              </div>

              {/* Row Buttons: Apple & Facebook */}
              
            </div>
          ) : verificationSent ? (
            <div className="flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in zoom-in-95 duration-500 py-10">
               <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-2 shadow-sm">
                 <Mail className="w-10 h-10 text-[#1DBF73]" />
               </div>
               <h3 className="text-2xl font-bold text-[#101828]">¡Revisa tu correo!</h3>
               <p className="text-gray-600 text-[15px] max-w-sm">
                 Hemos enviado un enlace mágico a <span className="font-semibold text-gray-800">{email}</span>. Haz clic en él para verificar tu identidad y acceder a tu panel.
               </p>
               <button 
                  onClick={onClose}
                  className="w-full text-white bg-[#101828] hover:bg-gray-800 rounded-md py-3 px-4 font-semibold transition-colors mt-4"
               >
                 Aceptar
               </button>
            </div>
          ) : (
            <form className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300" onSubmit={handleSubmit}>
              
              {/* Error Alert */}
              {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm text-center font-medium animate-in fade-in zoom-in-95">
                  {errorMsg}
                </div>
              )}
              
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-[#404145]">Correo electrónico</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@email.com"
                  className="w-full border border-gray-300 rounded-md px-4 py-3 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828] transition-all"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-[#404145]">Contraseña</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-4 py-3 pr-10 focus:outline-none focus:border-[#101828] focus:ring-1 focus:ring-[#101828] transition-all"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {!isLoginView && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-[#404145]">Repetir contraseña</label>
                  <div className="relative">
                    <input 
                      type={showConfirmPassword ? "text" : "password"} 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full border rounded-md px-4 py-3 pr-10 focus:outline-none transition-all ${
                        confirmPassword && password !== confirmPassword 
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                        : 'border-gray-300 focus:border-[#101828] focus:ring-[#101828]'
                      }`}
                      required
                    />
                    <button 
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}
              
              {!isLoginView && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm mt-3">
                  <div className={`flex items-center gap-2 ${password.length >= 8 ? 'text-[#1DBF73]' : 'text-gray-500'}`}>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Al menos 8 caracteres</span>
                  </div>
                  <div className={`flex items-center gap-2 ${/[A-Z]/.test(password) ? 'text-[#1DBF73]' : 'text-gray-500'}`}>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Al menos 1 letra mayúscula</span>
                  </div>
                  <div className={`flex items-center gap-2 ${/[a-z]/.test(password) ? 'text-[#1DBF73]' : 'text-gray-500'}`}>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Al menos 1 letra minúscula</span>
                  </div>
                  <div className={`flex items-center gap-2 ${/[0-9]/.test(password) ? 'text-[#1DBF73]' : 'text-gray-500'}`}>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Al menos 1 número</span>
                  </div>
                </div>
              )}
              
              <button 
                type="submit"
                disabled={isLoading}
                className={`w-full text-white rounded-md py-3 px-4 font-semibold hover:bg-gray-800 transition-colors mt-6 flex items-center justify-center ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#101828]'}`}
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLoginView ? 'Iniciar sesión' : 'Continuar')}
              </button>
            </form>
          )}

          <p className="mt-8 text-[13px] text-gray-500 leading-relaxed">
            Al unirte, aceptas los <a href="#" className="text-[#1DBF73] hover:underline font-medium">Términos de servicio</a> de ArtoCamello, así como recibir correos electrónicos ocasionales de nuestra parte. Lee nuestra <a href="#" className="text-[#1DBF73] hover:underline font-medium">Política de privacidad</a> para saber cómo utilizamos tus datos personales.
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}
