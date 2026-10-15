import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { Star, Trophy, ChevronLeft, ChevronRight, Play, Check, ArrowRight, ChevronDown, Clock, RefreshCw, Languages, HelpCircle, X, MapPin, Calendar, Map, Heart, Video } from 'lucide-react';
import mapImage from 'figma:asset/217acabfcd1de0fb0c010dbd96a25fa14b2c6b3f.png';
import { SignUpModal } from './SignUpModal';
import { getProfessionalById, PublicProfessional, postReview, getPublicProfessionals } from '@/services/professionalService';
import { toast } from 'sonner';
import { getQuestionsForCategories } from '../constants/serviceQuestions';
import { trackMetaEvent } from '@/shared/lib/metaPixel';

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1771122453274-d3270e73cf94?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwbHVtYmVyJTIwd29ya2luZ3xlbnwxfHx8fDE3NzQwMTI5NzV8MA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1771232217622-5f267b1f46df?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYXRocm9vbSUyMHJlcGFpcnxlbnwxfHx8fDE3NzQxMTM3ODl8MA&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1765518440022-10242cc86895?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3cmVuY2glMjB0b29sfGVufDF8fHx8MTc3NDA4NTgzOHww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1734689604220-712f496a9e21?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmaXhpbmclMjBzaW5rfGVufDF8fHx8MTc3NDExMzc5NXww&ixlib=rb-4.1.0&q=80&w=1080",
  "https://images.unsplash.com/photo-1771122453274-d3270e73cf94?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwbHVtYmVyJTIwdG9vbHN8ZW58MXx8fHwxNzc0MTA1Nzc5fDA&ixlib=rb-4.1.0&q=80&w=1080"
];

export function ProProfilePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const [pro, setPro] = useState<PublicProfessional | null>(null);
  const [loadingPro, setLoadingPro] = useState(true);
  const [recommendedPros, setRecommendedPros] = useState<PublicProfessional[]>([]);

  useEffect(() => {
    if (id) {
      setLoadingPro(true);
      Promise.all([
        getProfessionalById(id),
        getPublicProfessionals().catch(() => [])
      ])
        .then(([p, allPros]) => {
          setPro(p);
          const others = allPros.filter(ap => ap.id !== id);
          const shuffled = others.sort(() => 0.5 - Math.random());
          setRecommendedPros(shuffled.slice(0, 3));
          setLoadingPro(false);
        })
        .catch(err => {
          console.error(err);
          setLoadingPro(false);
        });
    } else {
      setLoadingPro(false);
    }
  }, [id]);
  const [activeTab, setActiveTab] = useState<'Basico' | 'Estandar' | 'Premium'>('Basico');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentClientIndex, setCurrentClientIndex] = useState(0);

  // Drawer states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  
  // Contact info state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  
  const checkAuth = () => {
    const authStatus = sessionStorage.getItem('isAuthenticated') === 'true';
    setIsAuthenticated(authStatus);
    
    if (authStatus) {
      const email = sessionStorage.getItem('userEmail');
      if (email) setContactEmail(email);
    }
  };

  useEffect(() => {
    checkAuth();
    
    // Listen for the custom event we added in SignUpModal
    window.addEventListener('auth-status-changed', checkAuth);
    
    return () => {
      window.removeEventListener('auth-status-changed', checkAuth);
    };
  }, []);

  // Dynamic form answers keyed by question id
  const [formAnswers, setFormAnswers] = useState<Record<string, string>>({});
  const [additionalInfo, setAdditionalInfo] = useState('');

  // Compute the right question set based on the pro's categories
  const questionSet = useMemo(
    () => getQuestionsForCategories(pro?.profile?.categories || []),
    [pro?.profile?.categories]
  );

  const updateAnswer = (questionId: string, value: string) => {
    setFormAnswers(prev => ({ ...prev, [questionId]: value }));
  };
  
  // New state for multi-step form
  const [formStep, setFormStep] = useState(1);
  const [locationCity, setLocationCity] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [serviceTime, setServiceTime] = useState('');

  // Review Form State
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const handlePostReview = async () => {
    if (!id || !pro) return;
    if (newRating === 0) {
      toast.error("Por favor selecciona una calificación de estrellas.");
      return;
    }
    if (newComment.trim().length < 5) {
      toast.error("El comentario es muy corto.");
      return;
    }

    try {
      setIsSubmittingReview(true);
      const review = await postReview(id, newRating, newComment);
      toast.success("¡Gracias por tu reseña!");
      
      // Refresh pro data to show new review and updated rating
      const updatedPro = await getProfessionalById(id);
      setPro(updatedPro);
      
      // Reset form
      setNewRating(0);
      setNewComment('');
    } catch (err: any) {
      toast.error(err.message || "Error al publicar la reseña");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  useEffect(() => {
    if (!pro) return;

    trackMetaEvent('ViewContent', {
      content_ids: [pro.id],
      content_name: pro.profile?.businessName || pro.fullName,
      content_type: 'service',
    });
  }, [pro]);

  const images = pro?.profile?.portfolioImages && pro.profile.portfolioImages.length > 0 ? pro.profile.portfolioImages : FALLBACK_IMAGES;

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  if (loadingPro) {
    return <div className="flex justify-center items-center h-screen"><div className="w-10 h-10 border-4 border-gray-200 border-t-[#FFCA0C] rounded-full animate-spin" /></div>;
  }

  if (!pro) {
    return <div className="flex justify-center items-center h-screen text-xl text-gray-400 font-medium">Profesional no encontrado o enlace incorrecto.</div>;
  }

  const title = pro.profile?.businessName || (pro.profile?.categories?.[0] ? `Servicio de ${pro.profile.categories.join(', ')}` : "Servicios profesionales");
  const bio = pro.profile?.bio || `Profesional verificado en ArtoCamello con ${pro.profile?.experienceYears || 0} años de experiencia. Listo para brindar el mejor servicio a tu medida.`;
  const rating = pro.profile?.rating || 5.0;
  const reviews = pro.profile?.reviewCount || 0;
  const queuedJobs = pro.profile?.completedJobs ? Math.max(1, Math.floor(pro.profile.completedJobs * 0.1)) : 1; 
  const avatar = pro.avatarUrl || "https://images.unsplash.com/photo-1622812947502-0a643f17387e?crop=entropy&cs=tinysrgb&fit=facearea&facepad=2&w=256&h=256&q=80";
  const firstName = pro.fullName.split(' ')[0];
  const cityQuery = pro.profile?.city ? `${pro.profile.city}, Ecuador` : 'Quito, Ecuador';

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-10 mt-4">
      <div className="flex flex-col lg:flex-row gap-12">
        
        {/* Left Column: Main Content */}
        <div className="w-full lg:w-[65%]">
          {/* Breadcrumbs / Navigation */}
          <nav className="flex items-center text-sm text-[#62646A] mb-6">
            <a href="/" className="hover:underline">Inicio</a>
            <span className="mx-2">/</span>
            <a href="/search" className="hover:underline">Profesionales</a>
            <span className="mx-2">/</span>
            <span className="text-gray-400 capitalize">{pro.profile?.categories?.[0] || 'Servicios'}</span>
          </nav>

          {/* Title */}
          <h1 className="text-3xl sm:text-[32px] font-bold text-[#404145] leading-tight mb-6">
            {title}
          </h1>

          {/* Pro Header Info */}
          <div className="flex items-center gap-4 mb-6">
            <img 
              src={avatar} 
              alt={firstName} 
              className="w-14 h-14 rounded-full object-cover border border-gray-200"
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold text-[#404145] text-lg">{pro.fullName}</span>
                {pro.profile?.experienceYears && pro.profile.experienceYears > 5 && (
                  <span className="bg-[#FFCA0C]/20 text-[#8B6B00] text-xs font-bold px-2 py-0.5 rounded-sm flex items-center gap-1">
                    Top Rated
                    <div className="flex">
                      <span className="w-1.5 h-1.5 bg-[#8B6B00] rotate-45 inline-block mx-0.5"></span>
                      <span className="w-1.5 h-1.5 bg-[#8B6B00] rotate-45 inline-block mx-0.5"></span>
                      <span className="w-1.5 h-1.5 bg-[#8B6B00] rotate-45 inline-block mx-0.5"></span>
                    </div>
                  </span>
                )}
                {pro.profile?.verified && (
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-sm">
                    Verificado
                  </span>
                )}
                <span className="text-[#62646A] text-sm border-l border-gray-300 pl-2">
                  {queuedJobs} pedidos en cola
                </span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i >= Math.round(rating) ? 'text-gray-300 fill-gray-300' : 'text-black fill-black'}`} />
                  ))}
                </div>
                <span className="font-bold text-[#FFCA0C] ml-1">{rating.toFixed(1)}</span>
                <span className="text-[#62646A] hover:underline cursor-pointer">({reviews} reseñas)</span>
              </div>
            </div>
          </div>

          {/* Info Boxes */}
          <div className="flex flex-col sm:flex-row border border-gray-200 rounded-md mb-6 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
            <div className="flex items-center gap-4 p-4 flex-1">
              <div className="w-12 h-12 flex-shrink-0 bg-yellow-50 rounded-full flex items-center justify-center relative">
                <Trophy className="w-6 h-6 text-[#404145]" />
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                  <Star className="w-3 h-3 text-[#FFCA0C] fill-[#FFCA0C]" />
                </div>
              </div>
              <div>
                <p className="font-bold text-[#404145] text-sm leading-tight">¡La gente continúa<br/>regresando!</p>
                <p className="text-xs text-[#62646A] mt-1">Este freelancer tiene muchos compradores recurrentes.</p>
              </div>
            </div>
            <div className="p-4 flex-1">
              <div className="flex items-center gap-1 mb-2">
                <p className="font-bold text-[#404145] text-sm">Algunos de mis clientes</p>
                <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
              </div>
              {pro.reviews && pro.reviews.length > 0 ? (
                <div className="flex items-center text-sm text-[#62646A] gap-4 mt-2">
                  <ChevronLeft 
                    className={`w-4 h-4 cursor-pointer ${pro.reviews.length <= 1 ? 'opacity-50' : 'hover:text-[#404145]'}`} 
                    onClick={() => pro.reviews && pro.reviews.length > 1 && setCurrentClientIndex(prev => (prev - 1 + pro.reviews.length) % pro.reviews.length)}
                  />
                  <span className="font-medium flex-1 text-center line-clamp-1">{pro.reviews[currentClientIndex].client.fullName}</span>
                  <span className="font-medium flex-1 text-center flex items-center justify-center gap-1 line-clamp-1">
                    <Star className="w-3 h-3 fill-current text-[#FFCA0C]" /> {pro.reviews[currentClientIndex].rating} / 5
                  </span>
                  <ChevronRight 
                    className={`w-4 h-4 cursor-pointer ${pro.reviews.length <= 1 ? 'opacity-50' : 'hover:text-[#404145]'}`} 
                    onClick={() => pro.reviews && pro.reviews.length > 1 && setCurrentClientIndex(prev => (prev + 1) % pro.reviews.length)}
                  />
                </div>
              ) : (
                <div className="flex items-center text-sm text-[#62646A] gap-4 mt-2">
                  <span className="font-medium flex-1 text-center opacity-70">Aún no hay clientes registrados</span>
                </div>
              )}
            </div>
          </div>

          {/* Translation Notice */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Languages className="w-4 h-4 text-gray-400" />
            <p>Parte de la información se ha traducido automáticamente. <a href="#" className="font-medium underline hover:text-gray-800">Mostrar versión en inglés</a></p>
          </div>

          {/* Media Gallery */}
          <div className="mb-10 relative">
            {/* Main Image Container */}
            <div className="relative aspect-video w-full bg-gray-100 rounded-sm overflow-hidden group">
              <img 
                src={images[currentImageIndex]} 
                alt="Servicio destacado" 
                className="w-full h-full object-cover"
              />
              
              {/* Play Button Overlay (mock video) */}
              {currentImageIndex === 0 && images.length === FALLBACK_IMAGES.length && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 bg-black/50 rounded-full flex items-center justify-center cursor-pointer hover:bg-black/60 transition-colors">
                    <Play className="w-8 h-8 text-white ml-1 fill-white" />
                  </div>
                </div>
              )}

              {/* Navigation Arrows */}
              {images.length > 1 && (
                <>
                  <button 
                    onClick={prevImage}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronLeft className="w-6 h-6 text-[#404145]" />
                  </button>
                  <button 
                    onClick={nextImage}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronRight className="w-6 h-6 text-[#404145]" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto pb-2 scrollbar-hide">
                {images.map((img, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`relative w-24 h-16 flex-shrink-0 rounded-sm overflow-hidden ${currentImageIndex === idx ? 'ring-2 ring-black' : 'opacity-60 hover:opacity-100 transition-opacity'}`}
                  >
                    <img src={img} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx === 0 && images.length === FALLBACK_IMAGES.length && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Play className="w-5 h-5 text-white fill-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* About This Service */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-[#404145] mb-6">Acerca de este servicio</h2>
            <div className="text-[#62646A] text-[16px] leading-relaxed space-y-4">
              <p className="whitespace-pre-wrap">{bio}</p>
              
              {pro.profile?.skills && pro.profile.skills.length > 0 && (
                <div className="mt-8">
                  <h3 className="font-bold text-[#404145] mb-3">Habilidades destacadas</h3>
                  <div className="flex flex-wrap gap-2">
                    {pro.profile.skills.map((skill, idx) => (
                      <span key={idx} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-medium border border-gray-200">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Work Area */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-[#101828] mb-6">Área de trabajo de {firstName}</h2>
            <div className="w-full relative bg-[#F9F9F9] border border-gray-200 overflow-hidden rounded-sm">
              <iframe 
                src={`https://maps.google.com/maps?q=${encodeURIComponent(cityQuery)}&t=&z=12&ie=UTF8&iwloc=&output=embed`}
                title={`Mapa del área de trabajo en ${cityQuery}`}
                className="w-full h-[350px] sm:h-[400px] border-0"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          {/* Reviews Section */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-[#404145] mb-6">Reseñas</h2>
            
            <div className="flex flex-col gap-8">
              {/* Reviews Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-[16px] font-bold text-[#404145]">{reviews} comentarios sobre este Servicio</h3>
                <div className="flex items-center gap-1">
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-4 h-4 ${i >= Math.round(rating) ? 'text-gray-200 fill-gray-200' : 'text-black fill-black'}`} />
                    ))}
                  </div>
                  <span className="font-bold text-[#404145] ml-2">{rating.toFixed(1)}</span>
                </div>
              </div>

              {/* Reviews Breakdown */}
              <div className="flex flex-col md:flex-row gap-12">
                {/* Left side: Star distribution */}
                <div className="flex-1 space-y-3">
                  {[5, 4, 3, 2, 1].map((stars) => {
                    const count = pro.reviews?.filter(r => r.rating === stars).length || 0;
                    const percent = reviews > 0 ? (count / reviews) * 100 : 0;
                    return (
                      <div key={stars} className="flex items-center gap-4 text-[15px] font-semibold text-[#404145]">
                        <span className="w-[75px] flex-shrink-0 text-[#121212]">{stars} {stars === 1 ? 'estrella' : 'estrellas'}</span>
                        <div className="flex-1 h-2 bg-[#E4E5E7] rounded-full overflow-hidden">
                          <div className="h-full bg-[#222325] rounded-full" style={{ width: `${percent}%` }}></div>
                        </div>
                        <span className="w-10 text-right font-medium text-[#62646A]">({count})</span>
                      </div>
                    );
                  })}
                </div>

                {/* Right side: Detailed Breakdown (Mocked as breakdown is deep logic) */}
                <div className="flex-1">
                  <h4 className="font-bold text-[#404145] text-[16px] mb-5">Desglose de calificaciones</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-[#95979D] font-medium text-[15px]">
                      <span>Nivel de comunicación</span>
                      <span className="flex items-center gap-1.5 font-bold text-[#404145]">
                        <Star className="w-4 h-4 fill-[#222325] text-[#222325]" />
                        {rating.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#95979D] font-medium text-[15px]">
                      <span>Calidad de la entrega</span>
                      <span className="flex items-center gap-1.5 font-bold text-[#404145]">
                        <Star className="w-4 h-4 fill-[#222325] text-[#222325]" />
                        {rating.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#95979D] font-medium text-[15px]">
                      <span>Valor de la entrega</span>
                      <span className="flex items-center gap-1.5 font-bold text-[#404145]">
                        <Star className="w-4 h-4 fill-[#222325] text-[#222325]" />
                        {rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Leave a Review Form */}
          <div className="mb-12 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-xl font-bold text-[#404145] mb-4">Deja tu reseña</h3>
            
            {isAuthenticated ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[#404145] font-medium">Tu calificación:</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star 
                        key={star} 
                        onClick={() => setNewRating(star)}
                        className={`w-6 h-6 cursor-pointer transition-colors ${star <= newRating ? 'text-[#FFCA0C] fill-[#FFCA0C]' : 'text-gray-300 hover:text-[#FFCA0C]'}`} 
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <textarea 
                    rows={4}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="¿Cómo fue tu experiencia trabajando con este profesional? Cuéntanos los detalles..."
                    className="w-full border border-gray-300 rounded-lg p-3 text-[#404145] placeholder-gray-400 focus:outline-none focus:border-[#FFCA0C] focus:ring-1 focus:ring-[#FFCA0C] resize-none"
                  />
                </div>
                <div className="flex justify-end">
                  <button 
                    onClick={handlePostReview}
                    disabled={isSubmittingReview}
                    className="bg-[#FFCA0C] hover:bg-[#e6b600] text-[#101828] font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmittingReview ? "Publicando..." : "Publicar reseña"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <p className="text-gray-600 mb-4">Debes iniciar sesión y verificar tu correo para poder dejar una reseña.</p>
                <button 
                  onClick={() => window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { view: 'login' } }))}
                  className="bg-[#101828] hover:bg-[#202c44] text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  Iniciar sesión para evaluar
                </button>
              </div>
            )}
          </div>

          {/* User Comments */}
          <div className="mb-12 space-y-6">
            {!pro.reviews || pro.reviews.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl bg-gray-50">
                <p className="text-gray-500 font-medium">Aún no hay reseñas para este profesional. ¡Sé el primero en calificar!</p>
              </div>
            ) : (
              pro.reviews.map((rev) => (
                <div key={rev.id} className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    {rev.client.avatarUrl ? (
                      <img src={rev.client.avatarUrl} alt={rev.client.fullName} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#183153] flex items-center justify-center text-white font-bold text-lg">
                        {rev.client.fullName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-[#404145] text-[16px]">{rev.client.fullName}</div>
                      <div className="flex items-center gap-1.5 text-sm text-[#62646A]">
                        <span>Cliente Verificado</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t border-gray-100 pt-5 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className={`w-4 h-4 ${i >= rev.rating ? 'text-gray-200 fill-gray-200' : 'text-[#121212] fill-[#121212]'}`} />
                        ))}
                      </div>
                      <span className="font-bold text-[#404145]">{rev.rating}</span>
                      <span className="text-gray-300 text-xs">•</span>
                      <span className="text-[#62646A] text-sm font-medium">
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
                      <div className="flex-1">
                        <p className="text-[#404145] text-[15px] leading-relaxed">
                          {rev.comment}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Recommended for You Section */}
          <div className="mb-12">
            <h2 className="text-[22px] font-bold text-[#404145] mb-6">Recomendado para ti</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6 pb-6">
              
              {recommendedPros.map(recPro => (
                <div key={recPro.id} onClick={() => navigate(`/profile/${recPro.id}`)} className="w-full cursor-pointer group">
                  {/* Thumbnail */}
                  <div className="relative h-[168px] rounded-lg overflow-hidden mb-4 bg-gray-100">
                    <img 
                      src={recPro.profile?.portfolioImages?.[0] || FALLBACK_IMAGES[Math.floor(Math.random() * FALLBACK_IMAGES.length)]} 
                      alt={`Thumbnail ${recPro.fullName}`} 
                      className="w-full h-full object-cover group-hover:opacity-95 transition" 
                    />
                    <Heart className="absolute top-3 right-3 w-5 h-5 text-white drop-shadow-md cursor-pointer hover:fill-black/30 transition-all" />
                  </div>
                  
                  {/* User Info */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        {recPro.avatarUrl ? (
                          <img 
                            src={recPro.avatarUrl} 
                            alt={`${recPro.fullName} Avatar`} 
                            className="w-6 h-6 rounded-full object-cover" 
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[#183153] flex items-center justify-center text-white font-bold text-[10px]">
                            {recPro.fullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="absolute bottom-0 right-0 w-2 h-2 bg-[#1dbf73] border border-white rounded-full"></div>
                      </div>
                      <span className="font-bold text-[#404145] text-[15px]">{recPro.fullName.split(' ')[0]}</span>
                    </div>
                    {recPro.profile?.rating && recPro.profile.rating >= 4.5 && (
                      <span className="bg-[#FFE0B2] text-[#8A5A19] text-[13px] font-bold px-1.5 py-[1px] rounded">Top</span>
                    )}
                  </div>
                  
                  {/* Title */}
                  <h3 className="text-[#404145] text-[16px] leading-snug mb-3 group-hover:underline line-clamp-2">
                    {recPro.profile?.bio || `Servicios profesionales de ${recPro.profile?.categories?.[0] || 'mantenimiento'}`}
                  </h3>
                  
                  {/* Rating */}
                  <div className="flex items-center gap-1 mb-3">
                    <Star className="w-4 h-4 text-[#121212] fill-[#121212]" />
                    <span className="font-bold text-[#404145] text-[15px]">{recPro.profile?.rating?.toFixed(1) || '5.0'}</span>
                    <span className="text-[#62646A] text-[15px]">({recPro.profile?.reviewCount || 0})</span>
                  </div>
                  
                  {/* Price */}
                  <div className="font-bold text-[#404145] text-[16px]">
                    Desde {Math.floor(Math.random() * 80) + 20} US$
                  </div>
                </div>
              ))}
              
              {recommendedPros.length === 0 && (
                <div className="col-span-3 text-center py-8 text-gray-500">
                  Explora más profesionales en nuestra búsqueda.
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Right Column: Sticky Sidebar */}
        <div className="w-full lg:w-[35%] relative">
          <div className="sticky top-28 bg-white border border-gray-200 rounded-sm">
            
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {(['Basico', 'Estandar', 'Premium'] as const).map((tab) => (
                null
              ))}
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                
              </div>
              
              <p className="text-[#62646A] text-sm mb-4">
                Ahorra hasta un 10 % con <span className="font-semibold text-[#1dbf73] cursor-pointer hover:underline">las suscripciones.</span> <HelpCircle className="w-3.5 h-3.5 inline text-gray-400" />
              </p>

              <p className="text-[#404145] text-sm font-semibold mb-6">
                <span className="font-bold">El paquete mínimo</span> Reparaciones avanzadas, sellado, cambios de tuberías, revisión de presión y limpieza del área (hasta 4 horas)
              </p>

              <div className="flex items-center gap-4 text-[#404145] font-bold text-sm mb-6">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>Entrega en 4 día/s</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4" />
                  <span>1 revisión</span>
                </div>
              </div>

              {/* Features List */}
              <ul className="space-y-3 mb-8 text-sm">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  <span className="text-[#62646A]">Hasta 15 metros cuadrados de área proporcionada</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-black flex-shrink-0" />
                  <span className="text-[#62646A]">Hasta 4 horas de duración</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-black flex-shrink-0" />
                  <span className="text-[#62646A]">Materiales básicos incluidos</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-black flex-shrink-0" />
                  <span className="text-[#62646A]">Limpieza del área de trabajo</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-black flex-shrink-0" />
                  <span className="text-[#62646A]">Revisión de fugas</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-black flex-shrink-0" />
                  <span className="text-[#62646A]">Garantía de 30 días</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  <span className="text-[#62646A]">Visita de seguimiento incluida</span>
                </li>
              </ul>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button 
                  onClick={() => setIsDrawerOpen(true)}
                  className="w-full bg-[#101828] hover:bg-gray-800 text-white font-bold py-3.5 px-4 rounded-md transition-colors flex items-center justify-between group"
                >
                  <span className="text-[15px]">Contactar</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                
              </div>
            </div>

            {/* Bottom Note */}
            <div className="p-6 border-t border-gray-200 bg-[#FAFAFA] mt-2">
              <div className="flex gap-3 mb-2">
                <img 
                  src={avatar} 
                  alt={firstName} 
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <h4 className="font-bold text-[#404145] text-[15px] leading-tight mt-1">
                  ¿Necesitas flexibilidad a la hora de contratar?
                </h4>
              </div>
              <p className="text-sm text-[#62646A] leading-relaxed pl-13">
                Contrata por horas, ideal para proyectos a largo plazo con horarios flexibles y pagos semanales.
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Navigation Drawer para el Formulario */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-[#101828]/50 z-40 backdrop-blur-sm"
              onClick={() => setIsDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white z-50 shadow-xl overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  {formStep > 1 && (
                    <button 
                      onClick={() => setFormStep(formStep - 1)}
                      className="p-2 -ml-2 mr-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-[#101828]"
                      aria-label="Volver atrás"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}
                  <h2 className="text-xl font-bold text-[#101828] flex-1">
                    {formStep === 1 && "Detalles del servicio"}
                    {formStep === 2 && "Ubicación y Fecha"}
                    {formStep === 3 && "Tus datos"}
                  </h2>
                  <button 
                    onClick={() => {
                      setIsDrawerOpen(false);
                      setTimeout(() => {
                        setFormStep(1);
                        setFormAnswers({});
                        setAdditionalInfo('');
                      }, 300); // Reset after animation
                    }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-8">
                  <AnimatePresence mode="wait">
                    {formStep === 1 ? (
                      <motion.div
                        key="step1"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        {/* Dynamic questions based on service category */}
                        {questionSet.questions.map((q) => (
                          <div key={q.id}>
                            <label className="block text-sm font-semibold text-[#101828] mb-3">
                              {q.label}
                            </label>

                            {/* Radio options */}
                            {q.type === 'radio' && q.options && (
                              <div className="space-y-2">
                                {q.options.map((opt) => (
                                  <label
                                    key={opt.value}
                                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                                      formAnswers[q.id] === opt.value
                                        ? 'border-[#FFCA0C] bg-[#FFCA0C]/5'
                                        : 'border-gray-200 hover:border-[#FFCA0C]'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={q.id}
                                      value={opt.value}
                                      checked={formAnswers[q.id] === opt.value}
                                      onChange={() => updateAnswer(q.id, opt.value)}
                                      className="w-4 h-4 text-[#FFCA0C] focus:ring-[#FFCA0C] accent-[#FFCA0C]"
                                    />
                                    <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                                  </label>
                                ))}
                              </div>
                            )}

                            {/* Counter / pill buttons */}
                            {q.type === 'counter' && q.options && (
                              <div className="flex gap-2">
                                {q.options.map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => updateAnswer(q.id, opt.value)}
                                    className={`flex-1 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                                      formAnswers[q.id] === opt.value
                                        ? 'border-[#FFCA0C] bg-[#FFCA0C]/10 text-[#8B6B00]'
                                        : 'border-gray-200 text-gray-600 hover:border-[#FFCA0C]'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Free text input */}
                            {q.type === 'text' && (
                              <input
                                type="text"
                                value={formAnswers[q.id] || ''}
                                onChange={(e) => updateAnswer(q.id, e.target.value)}
                                placeholder={q.placeholder || ''}
                                className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] focus:border-transparent"
                              />
                            )}

                            {/* Select dropdown */}
                            {q.type === 'select' && q.options && (
                              <select
                                value={formAnswers[q.id] || ''}
                                onChange={(e) => updateAnswer(q.id, e.target.value)}
                                className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] bg-white appearance-none"
                              >
                                <option value="">Selecciona una opción</option>
                                {q.options.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        ))}

                        {/* Información Adicional — always shown */}
                        <div className="pt-4 border-t border-gray-100">
                          <label className="block text-sm font-semibold text-[#101828] mb-3">
                            ¿Necesitas darnos más información?
                          </label>
                          <textarea
                            value={additionalInfo}
                            onChange={(e) => setAdditionalInfo(e.target.value)}
                            placeholder="Describe los detalles de tu problema..."
                            className="w-full p-3 border border-gray-200 rounded-lg min-h-[120px] focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] focus:border-transparent resize-y"
                          ></textarea>
                        </div>

                        <div className="pt-4">
                          <button
                            onClick={() => setFormStep(2)}
                            className="w-full bg-[#101828] hover:bg-[#101828]/90 text-white font-bold py-4 px-4 rounded-lg transition-colors flex items-center justify-center"
                          >
                            Siguiente
                          </button>
                        </div>
                      </motion.div>
                ) : formStep === 2 ? (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-8"
                >
                  {/* Dónde quieres tu servicio */}
                  <div>
                    <h3 className="text-lg font-bold text-[#101828] flex items-center gap-2 mb-4 border-b pb-2">
                      <MapPin className="w-5 h-5 text-[#FFCA0C]" />
                      ¿Dónde quieres tu servicio?
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Ciudad
                        </label>
                        <select 
                          className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] bg-white appearance-none"
                          value={locationCity}
                          onChange={(e) => setLocationCity(e.target.value)}
                        >
                          <option value="">Selecciona una ciudad / localidad</option>
                          <option value="aloag">Alóag</option>
                          <option value="amaguana">Amaguaña</option>
                          <option value="calderon">Calderón</option>
                          <option value="cayambe">Cayambe</option>
                          <option value="conocoto">Conocoto</option>
                          <option value="cumbaya">Cumbayá</option>
                          <option value="el_quinche">El Quinche</option>
                          <option value="machachi">Machachi</option>
                          <option value="mindo">Mindo</option>
                          <option value="nanegalito">Nanegalito</option>
                          <option value="pedro_vicente_maldonado">Pedro Vicente Maldonado</option>
                          <option value="pifo">Pifo</option>
                          <option value="pintag">Píntag</option>
                          <option value="puembo">Puembo</option>
                          <option value="puerto_quito">Puerto Quito</option>
                          <option value="quito">Quito</option>
                          <option value="san_antonio_pichincha">San Antonio de Pichincha</option>
                          <option value="san_miguel_bancos">San Miguel de los Bancos</option>
                          <option value="sangolqui">Sangolquí</option>
                          <option value="tabacundo">Tabacundo</option>
                          <option value="tambillo">Tambillo</option>
                          <option value="tumbaco">Tumbaco</option>
                          <option value="yaruqui">Yaruquí</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Dirección
                        </label>
                        <input 
                          type="text" 
                          placeholder="Ej: Calle Gran Vía 12, Piso 4B"
                          className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFCA0C]"
                          value={locationAddress}
                          onChange={(e) => setLocationAddress(e.target.value)}
                        />
                      </div>

                      <div className="pt-2">
                        <button className="flex items-center gap-2 text-sm text-[#101828] font-medium hover:text-[#FFCA0C] transition-colors p-2 border border-dashed border-gray-300 rounded-lg w-full justify-center bg-gray-50 hover:bg-white">
                          <Map className="w-4 h-4" />
                          Seleccionar ubicación en el mapa
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Fecha y Hora */}
                  <div>
                    <h3 className="text-lg font-bold text-[#101828] flex items-center gap-2 mb-4 border-b pb-2">
                      <Calendar className="w-5 h-5 text-[#FFCA0C]" />
                      Fecha y Hora
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Seleccione un día
                        </label>
                        <div className="relative">
                          <input 
                            type="date" 
                            className="w-full p-3 pl-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] bg-white [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full"
                            value={serviceDate}
                            onChange={(e) => setServiceDate(e.target.value)}
                          />
                          <Calendar className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Seleccione un horario
                        </label>
                        <select 
                          className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] bg-white appearance-none"
                          value={serviceTime}
                          onChange={(e) => setServiceTime(e.target.value)}
                        >
                          <option value="">Selecciona una hora</option>
                          <option value="morning">Mañana (08:00 - 12:00)</option>
                          <option value="afternoon">Tarde (13:00 - 17:00)</option>
                          <option value="evening">Noche (18:00 - 21:00)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                      <button 
                        onClick={() => setFormStep(3)}
                        className="w-full bg-[#101828] hover:bg-[#101828]/90 text-white font-bold py-4 px-4 rounded-lg transition-colors flex items-center justify-center"
                      >
                        Siguiente
                      </button>
                  </div>
                </motion.div>
                ) : (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-8"
                >
                  <div>
                    <h3 className="text-xl font-bold text-[#101828] mb-6">
                      Tus datos
                    </h3>
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Por favor, indica tu nombre
                        </label>
                        <input 
                          type="text" 
                          placeholder="Tu nombre completo"
                          className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] transition-shadow"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          ¿En qué email quieres recibir las propuestas y/o presupuestos?
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                          No lo compartiremos con nadie salvo a los profesionales interesados.
                        </p>
                        <input 
                          type="email" 
                          placeholder="ejemplo@email.com"
                          className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] transition-shadow"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          Por favor, indica tu número de teléfono
                        </label>
                        <p className="text-xs text-gray-500 mb-2">
                          Recibirás presupuestos más r��pido. No compartiremos tu teléfono.
                        </p>
                        <input 
                          type="tel" 
                          placeholder="+593 XXX XXX XXX"
                          className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFCA0C] transition-shadow"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100">
                      <button 
                        onClick={() => {
                          if (!isAuthenticated) {
                            setIsLoginModalOpen(true);
                            return;
                          }
                          // Submit form action here
                          setIsDrawerOpen(false);
                          setTimeout(() => setFormStep(1), 300);
                        }}
                        className="w-full bg-[#101828] hover:bg-[#101828]/90 text-white font-bold py-4 px-4 rounded-lg transition-colors flex items-center justify-center"
                      >
                        {isAuthenticated ? 'Enviar solicitud' : 'Inicia sesión para enviar'}
                      </button>
                  </div>
                </motion.div>
                )}
                </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SignUpModal 
        isOpen={isLoginModalOpen} 
        onClose={() => setIsLoginModalOpen(false)} 
        initialView="login" 
      />
    </div>
  );
}
