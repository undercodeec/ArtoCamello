import React, { useState, useEffect } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { Link } from 'react-router';
import { SignUpModal } from './SignUpModal';
import { POPULAR_SERVICES } from '../constants/services';
import logoArtocamello from '@/assets/logoartocamello.png';
import { adminRequest, AdminMe } from '@/services/adminService';
import { logout as logoutService } from '@/services/authService';
import { adminUrl } from '@/app/adminHost';

export function Header() {
  const [isSignUpModalOpen, setIsSignUpModalOpen] = useState(false);
  const [initialModalView, setInitialModalView] = useState<'login' | 'signup'>('signup');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState<string | null>(null);
  const [hasAdmin, setHasAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileServicesOpen, setIsMobileServicesOpen] = useState(false);

  const checkAuth = () => {
    const authStatus = sessionStorage.getItem('isAuthenticated') === 'true';
    setIsAuthenticated(authStatus);
    setUserType(sessionStorage.getItem('userType'));
    setHasAdmin(false);
    if (authStatus) adminRequest<AdminMe>('/me').then(() => setHasAdmin(true)).catch(() => setHasAdmin(false));
  };

  useEffect(() => {
    checkAuth();
    window.addEventListener('auth-status-changed', checkAuth);

    const handleOpenAuthModal = (e: CustomEvent<{ view: 'login' | 'signup' }>) => {
      openModal(e.detail.view);
    };

    window.addEventListener('open-auth-modal', handleOpenAuthModal as EventListener);
    return () => {
      window.removeEventListener('auth-status-changed', checkAuth);
      window.removeEventListener('open-auth-modal', handleOpenAuthModal as EventListener);
    };
  }, []);

  const openModal = (view: 'login' | 'signup') => {
    setInitialModalView(view);
    setIsSignUpModalOpen(true);
    setIsMobileMenuOpen(false); // Close mobile menu when opening modal
  };

  const serviceColumns = [
    POPULAR_SERVICES.slice(0, 6),
    POPULAR_SERVICES.slice(6, 12),
    POPULAR_SERVICES.slice(12, 18),
  ];

  return (
    <header className="fixed top-0 left-0 right-0 bg-white z-50 border-b border-gray-200 h-20">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-full bg-white relative z-20">
        <div className="flex justify-between items-center h-full">
          <div className="flex-shrink-0 flex items-center gap-6">
            <Link to="/" className="flex items-center" onClick={() => setIsMobileMenuOpen(false)}>
              <img src={logoArtocamello} alt="ArtoCamello" style={{ height: '75px', width: 'auto', objectFit: 'contain' }} />
            </Link>
          </div>

          <nav className="hidden lg:flex items-center space-x-6 h-full">

            {/* Servicios Dropdown */}
            <div className="relative group h-full flex items-center">
              <button className="flex items-center text-[#404145] font-semibold hover:text-[#FFCA0C] transition-colors gap-1 h-full cursor-pointer">
                Servicios <ChevronDown className="w-4 h-4 group-hover:rotate-180 transition-transform duration-200" />
              </button>

              <div className="absolute top-full right-0 w-max min-w-[750px] bg-white shadow-xl border border-gray-100 p-8 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 cursor-default">
                <div className="grid grid-cols-3 gap-x-8">
                  {serviceColumns.map((col, cIdx) => (
                    <ul key={cIdx} className="space-y-4 text-center">
                      {col.map((item, iIdx) => (
                        <li key={iIdx}>
                          <Link
                            to={item.slug ? `/search?c=${item.slug}` : '/search'}
                            className={`block font-medium ${item.active ? 'text-[#FFCA0C] hover:underline' : 'text-[#62646A] hover:text-[#FFCA0C]'} ${item.isLong ? 'leading-tight max-w-[200px] mx-auto' : ''}`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ))}
                </div>
              </div>
            </div>

            <Link to="/pro" className="text-[#62646A] font-medium hover:text-[#FFCA0C] transition-colors">
              ¿Eres un profesional?
            </Link>

            {hasAdmin && <a href={adminUrl()} className="text-[#62646A] font-medium hover:text-[#FFCA0C]">Administración</a>}

            {isAuthenticated && userType !== 'pro' && (
              <>
                <Link to="/mis-solicitudes" className="text-[#62646A] font-medium hover:text-[#FFCA0C] transition-colors">
                  Mis Solicitudes
                </Link>
                <Link to="/mi-perfil" className="text-[#62646A] font-medium hover:text-[#FFCA0C] transition-colors">
                  Mi Perfil
                </Link>
              </>
            )}

            {!isAuthenticated ? (
              <>
                <button
                  onClick={() => openModal('login')}
                  className="text-[#62646A] font-medium hover:text-[#FFCA0C] transition-colors cursor-pointer"
                >
                  Iniciar sesión
                </button>
                <button
                  onClick={() => openModal('signup')}
                  className="border border-[#FFCA0C] text-[#FFCA0C] hover:bg-[#FFCA0C] hover:text-black px-5 py-2 rounded-md font-semibold transition-colors cursor-pointer"
                >
                  Unete
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  logoutService();
                  window.location.href = '/';
                }}
                className="text-[#62646A] font-medium hover:text-red-500 transition-colors cursor-pointer"
              >
                Cerrar sesión
              </button>
            )}
          </nav>

          {/* Mobile Menu Toggle Button */}
          <div className="lg:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 -mr-2 text-[#404145] hover:text-[#FFCA0C] focus:outline-none transition-colors"
              aria-label="Toggle mobile menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-7 h-7" />
              ) : (
                <Menu className="w-7 h-7" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      <div
        className={`lg:hidden absolute top-20 left-0 right-0 bg-white border-b border-gray-200 shadow-xl overflow-y-auto transition-all duration-300 ease-in-out z-10 ${isMobileMenuOpen ? 'max-h-[calc(100vh-5rem)] opacity-100 visible' : 'max-h-0 opacity-0 invisible'
          }`}
      >
        <div className="px-6 py-8 space-y-6">
          <div className="space-y-4">
            <button
              onClick={() => setIsMobileServicesOpen(!isMobileServicesOpen)}
              className="flex items-center justify-between w-full text-left text-[#404145] font-semibold text-xl border-b border-gray-100 pb-2"
            >
              Servicios
              <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${isMobileServicesOpen ? 'rotate-180 text-[#FFCA0C]' : ''}`} />
            </button>

            {/* Mobile Services Submenu */}
            <div className={`pl-2 space-y-3 overflow-hidden transition-all duration-300 ${isMobileServicesOpen ? 'max-h-[1000px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
              <Link to="/search" onClick={() => setIsMobileMenuOpen(false)} className="block text-[#404145] font-medium py-1">Ver todos los servicios</Link>
              {POPULAR_SERVICES.slice(0, 8).map((item, idx) => (
                <Link
                  key={idx}
                  to={item.slug ? `/search?c=${item.slug}` : '/search'}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block text-[#62646A] py-1 hover:text-[#FFCA0C]"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <Link to="/pro" onClick={() => setIsMobileMenuOpen(false)} className="block text-[#404145] font-semibold text-xl border-b border-gray-100 pb-2">
              ¿Eres un profesional?
            </Link>

            {hasAdmin && <a href={adminUrl()} onClick={() => setIsMobileMenuOpen(false)} className="block text-[#404145] font-semibold text-xl border-b border-gray-100 pb-2">Administración</a>}

            {isAuthenticated && userType !== 'pro' && (
              <>
                <Link to="/mis-solicitudes" onClick={() => setIsMobileMenuOpen(false)} className="block text-[#404145] font-semibold text-xl border-b border-gray-100 pb-2">
                  Mis Solicitudes
                </Link>
                <Link to="/mi-perfil" onClick={() => setIsMobileMenuOpen(false)} className="block text-[#404145] font-semibold text-xl border-b border-gray-100 pb-2">
                  Mi Perfil
                </Link>
              </>
            )}
          </div>

          <div className="pt-6 flex flex-col gap-4">
            {!isAuthenticated ? (
              <>
                <button
                  onClick={() => openModal('login')}
                  className="w-full text-center text-[#62646A] font-semibold text-lg py-3 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Iniciar sesión
                </button>
                <button
                  onClick={() => openModal('signup')}
                  className="w-full text-center bg-[#FFCA0C] text-black font-semibold text-lg py-3 rounded-md hover:bg-[#e6b60b] transition-colors"
                >
                  Unete
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  logoutService();
                  window.location.href = '/';
                }}
                className="w-full text-center text-red-500 font-semibold text-lg py-3 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
              >
                Cerrar sesión
              </button>
            )}
          </div>
        </div>
      </div>

      <SignUpModal
        isOpen={isSignUpModalOpen}
        onClose={() => setIsSignUpModalOpen(false)}
        initialView={initialModalView}
      />
    </header>
  );
}
