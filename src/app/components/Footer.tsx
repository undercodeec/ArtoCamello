import React from 'react';
import { Twitter, Facebook, Linkedin, Instagram } from 'lucide-react';
import { Link } from 'react-router';
import { POPULAR_SERVICES } from '../constants/services';
import logoArtocamello from '@/assets/logoartocamello.png';

export function Footer() {
  // Link map for plain-string links → destinations
  const linkMap: Record<string, string> = {
    // Para Clientes
    'Cómo funciona': '/#como-funciona',
    'Solicitar presupuesto': '/#solicitar',
    'Mis solicitudes': '/mis-solicitudes',
    'Comparar profesionales': '/search',
    'Preguntas frecuentes': '/#faq',
    // Para Profesionales
    'Registrarte gratis': '#open-login',
    'Área profesional': '/pro',
    // ArtoCamello
    'Términos de servicio': '/terminos-de-servicio',
    'Política de privacidad': '/politica-de-privacidad',
    'Ayuda y soporte': '/#ayuda',
  };

  const sections = [
    {
      title: 'Servicios Populares',
      links: POPULAR_SERVICES
    },
    {
      title: 'Para Clientes',
      links: ['Cómo funciona', 'Solicitar presupuesto', 'Mis solicitudes', 'Comparar profesionales', 'Preguntas frecuentes']
    },
    {
      title: 'Para Profesionales',
      links: ['Registrarte gratis', 'Área profesional']
    },
    {
      title: 'ArtoCamello',
      links: ['Términos de servicio', 'Política de privacidad', 'Ayuda y soporte']
    },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, to: string) => {
    if (to === '#open-login') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { view: 'login' } }));
      return;
    }
    if (to.startsWith('/#')) {
      e.preventDefault();
      const id = to.replace('/#', '');
      // If we're already on the homepage, scroll directly
      if (window.location.pathname === '/') {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        // Navigate to home, then scroll after page loads
        window.location.href = '/' + '#' + id;
      }
    }
  };

  return (
    <footer className="bg-white border-t border-gray-200 pt-16 pb-8">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {sections.map((section, idx) => (
            <div key={idx}>
              <h4 className="text-[#404145] font-bold mb-6">{section.title}</h4>
              <ul className="space-y-4">
                {section.links.map((link, lIdx) => {
                  const label = typeof link === 'string' ? link : link.label;
                  const to = typeof link === 'string'
                    ? (linkMap[link] || '#')
                    : (link.slug ? `/search?c=${link.slug}` : '/search');

                  return (
                    <li key={lIdx}>
                      <Link
                        to={to}
                        onClick={(e) => handleNavClick(e, to)}
                        className="text-[#74767e] hover:underline text-sm font-medium"
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 text-[#74767e]">
            <img src={logoArtocamello} alt="ArtoCamello" style={{ height: '75px', width: 'auto', objectFit: 'contain' }} />
            <span className="text-sm">© ArtoCamello {new Date().getFullYear()}</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex gap-4 text-[#74767e]">
              <a href="#" className="hover:bg-gray-100 p-2 rounded-full transition-colors"><Twitter className="w-5 h-5" /></a>
              <a href="#" className="hover:bg-gray-100 p-2 rounded-full transition-colors"><Facebook className="w-5 h-5" /></a>
              <a href="#" className="hover:bg-gray-100 p-2 rounded-full transition-colors"><Linkedin className="w-5 h-5" /></a>
              <a href="#" className="hover:bg-gray-100 p-2 rounded-full transition-colors"><Instagram className="w-5 h-5" /></a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
