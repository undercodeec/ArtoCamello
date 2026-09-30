import image_2fa8bfa24ba21b2ae0f081e8c66f8320be367828 from 'figma:asset/2fa8bfa24ba21b2ae0f081e8c66f8320be367828.png';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import imgImage10 from "figma:asset/c714e6b5e013ec4783b25610571c36c0ff7e46d4.png";
import imgImage7 from "figma:asset/60e86eabff847504d6a2f7515fbf32d0d1075f41.png";
import imgImage9 from "figma:asset/c8e19162b118a801b65c6bdbc1478e9d2e583c63.png";
import imgImage11 from "figma:asset/197099b651bf18fcb1d85ab16ca8104070a1fbfe.png";
import imgLines from "figma:asset/1235960c853e4ffc1ac70448229c23186476987b.png";
import heroImg from "figma:asset/4e44d32049e658e4c05e192a6ab06f363c43770e.png";
import cleaningProImg from "figma:asset/e7d3b4d03246799841013cb238327ea13858e691.png";
import thirdProImg from "figma:asset/1f0130be5e7c4531bfc89f6ceb57e9559eff3c81.png";
import fourthProImg from "figma:asset/6c9ec248209cd638bab7c28104e14ffc77a7cdfb.png";

export function Hero() {
  const [currentImgIndex, setCurrentImgIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate('/search');
    }
  };

  // Lista de las 4 imágenes para el Hero
  // Aquí es DONDE PUEDES EDITAR el tamaño y posición de CADA IMAGEN INDIVIDUALMENTE.
  // Puedes usar libremente cualquier propiedad CSS para ajustar la foto exactamente como necesites.
  // Propiedades útiles: top, bottom, left, right, height, width, objectPosition.
  const heroImages: Array<{ src: string; bottom?: string; top?: string; left?: string; right?: string; height?: string; width?: string; objectPosition?: string; objectFit?: React.CSSProperties['objectFit'] }> = [
    {
      src: image_2fa8bfa24ba21b2ae0f081e8c66f8320be367828,
      bottom: '-150px',
      left: '0px',
      height: '110%',
      // También podrías usar: top: '10px', right: '5%'
    },
    {
      src: cleaningProImg,
      bottom: '-150px',
      left: '0px',
      height: '110%'
    },
    {
      src: thirdProImg,
      bottom: '-150px',
      left: '0px',
      height: '110%'
    },
    {
      src: fourthProImg,
      bottom: '-150px', // Te recomiendo usar bottom para que apoye bien
      left: '-300px', 
      height: '120%',  // ¡Ahora sí crecerá sin restricciones!
      width: 'auto',   // Deja width en auto para que escale con el height
      objectPosition: 'bottom center'
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImgIndex((prev) => (prev + 1) % heroImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="solicitar" className="bg-[#FFCA0C] relative overflow-hidden pt-32 pb-16 lg:py-32 min-h-[700px] flex items-center">
      {/* Background Dark Circle - Bottom Left */}
      <div className="absolute -left-20 -bottom-16 w-56 h-56 bg-black/5 rounded-full z-0 pointer-events-none"></div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 w-full relative z-10 flex flex-col lg:flex-row items-center gap-12 lg:gap-4">
        
        {/* Left Column - Text & Search */}
        <div className="w-full lg:w-[55%] z-20 flex flex-col justify-center">
          <h1 className="text-5xl md:text-6xl lg:text-[64px] font-extrabold text-gray-900 mb-6 leading-[1.15] tracking-tight">
            Encuentra a los mejores profesionales para tu hogar o negocio
          </h1>
          <p className="text-lg md:text-xl text-gray-800 mb-10 max-w-[650px] leading-relaxed font-medium">
            Recibe presupuestos gratuitos y sin compromiso de profesionales locales verificados que irán directamente a tu puerta. Desde reformas integrales, pintores y limpieza, hasta reparaciones urgentes y mudanzas.
          </p>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="bg-white rounded-full p-2 flex items-center max-w-[550px] shadow-lg mb-8">
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='¿Qué servicio necesitas hoy?'
              className="flex-grow bg-transparent border-none focus:ring-0 px-6 text-gray-800 placeholder-gray-500 text-base md:text-lg outline-none"
            />
            <button type="submit" className="bg-gray-900 hover:bg-black text-[#FFCA0C] w-14 h-14 rounded-full flex items-center justify-center transition-colors shrink-0 shadow-md">
              <Search className="w-6 h-6" strokeWidth={2.5} />
            </button>
          </form>

          {/* Additional Content - Popular Searches */}
          <div className="flex flex-wrap items-center gap-3 text-sm md:text-base">
            <span className="font-semibold text-gray-900">Servicios más solicitados:</span>
            <div className="flex flex-wrap gap-2">
              {['Pintores', 'Reformas', 'Limpieza', 'Mudanzas'].map(term => (
                <span 
                  key={term}
                  onClick={() => navigate(`/search?c=${term.toLowerCase()}`)} 
                  className="bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-gray-800 font-medium shadow-sm hover:bg-white transition-colors cursor-pointer border border-transparent hover:border-gray-200"
                >
                  {term}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Image Collage */}
        <div className="w-full lg:w-[45%] relative h-[500px] lg:h-[600px] flex items-center justify-center">
          
          {/* Main Hero Image */}
          <div className="relative z-10 w-full h-full flex items-center justify-center drop-shadow-2xl">
            {heroImages.map((img, index) => (
              <img 
                key={index}
                src={img.src} 
                alt={`Profesional de servicios a domicilio ${index + 1}`} 
                className={`absolute max-w-none object-contain transform hover:scale-105 transition-all duration-1000 ease-in-out ${
                  index === currentImgIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
                style={{ 
                  maxWidth: 'none',
                  objectPosition: img.objectPosition || 'bottom center',
                  objectFit: img.objectFit || 'contain',
                  bottom: img.bottom,
                  top: img.top,
                  left: img.left,
                  right: img.right,
                  height: img.height || '110%',
                  width: img.width || 'auto'
                }}
              />
            ))}
          </div>
          
          {/* Background Polygon Line */}
          <div className="absolute top-[-10%] bottom-[0%] left-[45%] w-[40px] bg-white/30 rotate-[4deg] -skew-x-[8deg] z-0 transform -translate-x-1/2 rounded-full origin-bottom"></div>
          
          {/* Connecting Lines */}
          

          {/* Abstract dots grid */}
          <div className="absolute top-[35%] left-[10%] grid grid-cols-4 gap-2 opacity-30 pointer-events-none z-0">
            {[...Array(16)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-white"></div>
            ))}
          </div>

                    
        </div>
      </div>
    </section>
  );
}
