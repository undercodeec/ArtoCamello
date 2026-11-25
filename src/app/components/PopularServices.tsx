import image_f9af766baac4c7a398bd50709fc731854a1d22fd from 'figma:asset/f9af766baac4c7a398bd50709fc731854a1d22fd.png'
import image_20cfaa17ccb824b0f00b8e7abaa02c099d83ff63 from 'figma:asset/20cfaa17ccb824b0f00b8e7abaa02c099d83ff63.png'
import image_step3 from 'figma:asset/62a7846a80b09f8084074694693eb26e2a63983f.png'
import React, { useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import svgPaths from "../../imports/svg-8jlxif1gds";
import { imgImage14 } from "../../imports/svg-t0i7q";

// Assets for Carousel
import imgImage15 from "figma:asset/e583c98e4a8a41c2c69bb09d4e724626bcfcc3e2.png";
import imgImage17 from "figma:asset/b783dbc0fe6ab1d54ea8e632d91db6c5af2d5dff.png";
import imgImage18 from "figma:asset/ee7b3f21755c0583670d0770f8f988bd0f43ca20.png";
import imgImage19 from "figma:asset/145be0e8d656092f89db7f124fdb63b8e65ea705.png";

// Assets for Features section
import imgEllipse21 from "figma:asset/bb5424569636d43ff63c8a2c13270db3bf276ce3.png";
import imgRectangle2932 from "figma:asset/9f8402efb0f622b74f48bb89c63a8a80e3f15924.png";
import imgRectangle2931 from "figma:asset/8b242b40fd7db34e2b44829244b4a52aa0773b92.png";

export function PopularServices() {
   const scrollRef = useRef<HTMLDivElement>(null);
   const [activeStep, setActiveStep] = useState(1);

   const services = [
      {
         title: 'FONTANERÍA',
         category: 'fontaneria',
         img: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=800&q=80',
         icon: (
            <svg className="w-[60px] h-[40px] mb-8" fill="none" viewBox="0 0 64 42">
               <path d="M21 3L3 21L21 39" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6" />
               <path d={svgPaths.p102a7480} stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6" />
            </svg>
         )
      },
      {
         title: 'LIMPIEZA',
         category: 'limpieza',
         img: 'https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?auto=format&fit=crop&w=800&q=80',
         icon: (
            <svg className="w-[36px] h-[36px] mb-8" fill="none" viewBox="0 0 40 40">
               <path d={svgPaths.pf16580} stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
               <path d="M28 8L32 12" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
               <path d={svgPaths.p422a140} stroke="white" strokeLinecap="round" strokeWidth="4" />
            </svg>
         )
      },
      {
         title: 'PINTURA',
         category: 'pintura',
         img: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=800&q=80',
         icon: (
            <svg className="w-[37px] h-[37px] mb-8" fill="none" viewBox="0 0 38 38">
               <path d={svgPaths.p110e0e80} fill="white" stroke="white" strokeWidth="0.6" />
            </svg>
         )
      },
      {
         title: 'ELECTRICIDAD',
         category: 'electricidad',
         img: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
         icon: (
            <svg className="w-[54px] h-[36px] mb-8" fill="none" viewBox="0 0 58 40">
               <path d={svgPaths.p26970e80} stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            </svg>
         )
      }
   ];

   const scroll = (direction: 'left' | 'right') => {
      if (scrollRef.current) {
         const scrollAmount = direction === 'left' ? -400 : 400;
         scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
   };

   return (
      <section className="bg-white">
         {/* Popular Services Top Section */}
         <div className="pt-24 pb-12 relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">

            {/* Header */}
            <div className="flex justify-between items-center mb-12">
               <div className="flex items-center gap-4">
                  <h2 className="text-[40px] font-semibold text-black">Servicios mas populares</h2>
                  <svg className="w-[45px] h-[25px]" fill="none" viewBox="0 0 50 30">
                     <path d={svgPaths.p3f319a80} stroke="#FFCA0C" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                  </svg>
               </div>


            </div>

            {/* Carousel */}
            <div className="relative group">
               {/* Scroll Left Button */}
               <div className="absolute top-1/2 -translate-y-1/2 -left-6 z-20 hidden md:flex">
                  <button
                     onClick={() => scroll('left')}
                     className="w-[45px] h-[45px] rounded-full bg-white shadow-[0px_1px_5px_rgba(0,0,0,0.25)] flex items-center justify-center text-[#121212] hover:bg-gray-50 transition-colors border border-gray-100"
                  >
                     <ChevronLeft strokeWidth={2} className="w-6 h-6" />
                  </button>
               </div>

               {/* Scroll Right Button */}
               <div className="absolute top-1/2 -translate-y-1/2 -right-6 z-20 hidden md:flex">
                  <button
                     onClick={() => scroll('right')}
                     className="w-[45px] h-[45px] rounded-full bg-white shadow-[0px_1px_5px_rgba(0,0,0,0.25)] flex items-center justify-center text-[#121212] hover:bg-gray-50 transition-colors border border-gray-100"
                  >
                     <ChevronRight strokeWidth={2} className="w-6 h-6" />
                  </button>
               </div>

               <div
                  ref={scrollRef}
                  className="flex gap-8 overflow-x-auto pb-10 scrollbar-hide snap-x scroll-smooth"
                  style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
               >
                  {services.map((service, idx) => (
                     <Link
                        key={idx}
                        to={`/search?c=${service.category}`}
                        className="min-w-[340px] h-[335px] snap-start relative flex-shrink-0 group/card cursor-pointer"
                     >
                        {/* Mask and Background Wrapper */}
                        <div
                           className="absolute inset-0"
                           style={{ maskImage: `url('${imgImage14}')`, WebkitMaskImage: `url('${imgImage14}')`, maskSize: '100% 100%', WebkitMaskSize: '100% 100%', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}
                        >
                           {/* Image Layer */}
                           <img
                              src={service.img}
                              alt={service.title.replace('\n', ' ')}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-110"
                           />
                           {/* Dark Overlay for Text Readability */}
                           <div
                              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30 group-hover/card:bg-black/40 transition-colors duration-300"
                           />
                        </div>

                        {/* Content Layer */}
                        <div className="absolute inset-0 flex flex-col items-center justify-end pb-12 z-10 pointer-events-none transition-transform duration-300 group-hover/card:-translate-y-2">
                           <div className="mb-4 drop-shadow-lg">
                              {service.icon}
                           </div>
                           <h3 className="text-[27px] font-bold text-white whitespace-pre-line text-center leading-tight tracking-wide drop-shadow-xl">
                              {service.title}
                           </h3>
                        </div>
                     </Link>
                  ))}
               </div>

               {/* Pagination Dots */}
               <div className="flex justify-center gap-2.5 mt-2">
                  <div className="w-[36px] h-[7px] bg-[#FFCA0C] rounded-full"></div>
                  <div className="w-[27px] h-[7px] bg-[#9d9d9d] rounded-full"></div>
                  <div className="w-[27px] h-[7px] bg-[#9d9d9d] rounded-full"></div>
               </div>
            </div>
         </div>

         {/* Features Bottom Section */}
         <div id="como-funciona" className="w-full bg-[#FFCA0C]/5 py-24 relative overflow-hidden mt-12">
            {/* Dot Pattern Background Left */}
            <div className="absolute top-[30%] left-[85%] opacity-30">
               <div className="grid grid-cols-5 gap-3">
                  {[...Array(20)].map((_, i) => (
                     <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#FFCA0C]"></div>
                  ))}
               </div>
               <div className="grid grid-cols-5 gap-3 mt-3">
                  {[...Array(20)].map((_, i) => (
                     <div key={i + 20} className="w-1.5 h-1.5 rounded-full bg-[#FFCA0C]"></div>
                  ))}
               </div>
               <div className="grid grid-cols-5 gap-3 mt-3">
                  {[...Array(20)].map((_, i) => (
                     <div key={i + 40} className="w-1.5 h-1.5 rounded-full bg-[#FFCA0C]"></div>
                  ))}
               </div>
               <div className="grid grid-cols-5 gap-3 mt-3">
                  {[...Array(20)].map((_, i) => (
                     <div key={i + 60} className="w-1.5 h-1.5 rounded-full bg-[#FFCA0C]"></div>
                  ))}
               </div>
            </div>

            {/* Decorative Polygon */}
            <div className="absolute left-[50%] top-[40%] transform rotate-[32deg] opacity-20 pointer-events-none">
               <svg className="w-[110px] h-[187px]" fill="none" viewBox="0 0 112 201">
                  <path d={svgPaths.p28827100} fill="none" stroke="#FFCA0C" strokeWidth={3} />
               </svg>
            </div>

            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

               <motion.div
                  className="text-center mb-16 max-w-3xl mx-auto"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6 }}
               >
                  <h2 className="text-[36px] font-extrabold text-gray-900 mb-5 tracking-tight">
                     Encontrar un profesional de confianza nunca ha sido tan fácil
                  </h2>
                  <p className="text-[18px] text-gray-600 font-medium">
                     No pierdas tiempo buscando en tablones de anuncios o preguntando a tus vecinos. Sigue estos simples pasos.
                  </p>
               </motion.div>

               <div className="flex flex-col lg:flex-row gap-16 items-center">

                  {/* Left Column - Feature List */}
                  <div className="w-full lg:w-1/2 flex flex-col pl-4 lg:pl-16 relative">

                     {/* Continuous Vertical Line - Progress Bar Animation */}
                     <motion.div
                        className="absolute left-[39px] lg:left-[87px] top-[30px] bottom-[50px] w-1 bg-gradient-to-b from-[#FFCA0C] via-[#FFCA0C] to-transparent z-0 hidden sm:block rounded-full origin-top"
                        initial={{ scaleY: 0 }}
                        whileInView={{ scaleY: 1 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                     />

                     {/* Feature 1 */}
                     <motion.div
                        className="relative z-10 flex flex-col sm:flex-row gap-4 sm:gap-6 items-start group mb-8 cursor-pointer"
                        onMouseEnter={() => setActiveStep(1)}
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                     >
                        <div className="w-12 h-12 shrink-0 rounded-full bg-[#FFCA0C] text-gray-900 shadow-md flex items-center justify-center font-bold text-xl transition-all duration-300 group-hover:scale-110 group-hover:shadow-[#FFCA0C]/40 group-hover:shadow-lg ring-4 ring-white">
                           1
                        </div>
                        <div className="bg-white/60 hover:bg-white backdrop-blur-md transition-all duration-300 rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-xl border border-gray-100 flex-1 relative overflow-hidden group-hover:-translate-y-1">
                           <div className="absolute inset-0 bg-gradient-to-r from-[#FFCA0C]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                           <div className="relative z-10">
                              <span className="text-[#FFCA0C] text-xs font-bold tracking-widest uppercase mb-2 block">Primer Paso</span>
                              <h3 className="text-[22px] font-bold text-gray-900 mb-2">Nos dices qué profesional buscas</h3>
                              <p className="text-[16px] text-gray-600 leading-relaxed font-medium">
                                 Responde unas pocas preguntas y dinos qué servicio o profesional estás buscando.
                              </p>
                           </div>
                        </div>
                     </motion.div>

                     {/* Feature 2 */}
                     <motion.div
                        className="relative z-10 flex flex-col sm:flex-row gap-4 sm:gap-6 items-start group mb-8 cursor-pointer"
                        onMouseEnter={() => setActiveStep(2)}
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.5, delay: 0.7 }}
                     >
                        <div className="w-12 h-12 shrink-0 rounded-full bg-white border-[3px] border-[#FFCA0C] text-gray-900 shadow-sm flex items-center justify-center font-bold text-xl transition-all duration-300 group-hover:bg-[#FFCA0C] group-hover:scale-110 group-hover:shadow-[#FFCA0C]/40 group-hover:shadow-lg ring-4 ring-white">
                           2
                        </div>
                        <div className="bg-white/60 hover:bg-white backdrop-blur-md transition-all duration-300 rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-xl border border-gray-100 flex-1 relative overflow-hidden group-hover:-translate-y-1">
                           <div className="absolute inset-0 bg-gradient-to-r from-[#FFCA0C]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                           <div className="relative z-10">
                              <span className="text-[#FFCA0C] text-xs font-bold tracking-widest uppercase mb-2 block">Segundo Paso</span>
                              <h3 className="text-[22px] font-bold text-gray-900 mb-2">Recibe hasta 4 presupuestos gratis</h3>
                              <p className="text-[16px] text-gray-600 leading-relaxed font-medium">
                                 En pocas horas, recibirás presupuestos personalizados sin compromiso.
                              </p>
                           </div>
                        </div>
                     </motion.div>

                     {/* Feature 3 */}
                     <motion.div
                        className="relative z-10 flex flex-col sm:flex-row gap-4 sm:gap-6 items-start group cursor-pointer"
                        onMouseEnter={() => setActiveStep(3)}
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.5, delay: 1.1 }}
                     >
                        <div className="w-12 h-12 shrink-0 rounded-full bg-white border-[3px] border-[#FFCA0C] text-gray-900 shadow-sm flex items-center justify-center font-bold text-xl transition-all duration-300 group-hover:bg-[#FFCA0C] group-hover:scale-110 group-hover:shadow-[#FFCA0C]/40 group-hover:shadow-lg ring-4 ring-white">
                           3
                        </div>
                        <div className="bg-white/60 hover:bg-white backdrop-blur-md transition-all duration-300 rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-xl border border-[#FFCA0C]/30 flex-1 relative overflow-hidden group-hover:-translate-y-1">
                           <div className="absolute inset-0 bg-gradient-to-r from-[#FFCA0C]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                           <div className="relative z-10">
                              <span className="text-[#FFCA0C] text-xs font-bold tracking-widest uppercase mb-2 block">Tercer Paso</span>
                              <h3 className="text-[22px] font-bold text-gray-900 mb-2">Elige al profesional más adecuado</h3>
                              <p className="text-[16px] text-gray-600 leading-relaxed font-medium">
                                 Compara presupuestos, opiniones y perfiles para elegir el más adecuado para ti.
                              </p>
                           </div>
                        </div>
                     </motion.div>

                  </div>

                  {/* Right Column - Single Illustration */}
                  <motion.div
                     className="w-full lg:w-1/2 relative flex items-center justify-center p-8"
                     initial={{ opacity: 0, scale: 0.95 }}
                     whileInView={{ opacity: 1, scale: 1 }}
                     viewport={{ once: true, margin: "-100px" }}
                     transition={{ duration: 0.7, delay: 0.5 }}
                  >
                     {/* Decorative Background Blob */}
                     <div className="absolute inset-0 bg-gradient-to-tr from-[#FFCA0C]/20 to-transparent rounded-full blur-3xl opacity-60 transform scale-90"></div>

                     {/* Main Illustration Container */}
                     <div className="relative w-full max-w-[500px] aspect-square rounded-[40px] overflow-hidden shadow-2xl border-8 border-white group transition-transform duration-700 hover:-translate-y-2">
                        <AnimatePresence mode="wait">
                           <motion.img
                              key={activeStep}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              src={
                                 activeStep === 1 ? image_f9af766baac4c7a398bd50709fc731854a1d22fd :
                                    activeStep === 2 ? image_20cfaa17ccb824b0f00b8e7abaa02c099d83ff63 :
                                       image_step3
                              }
                              alt={`Ilustración de servicios a domicilio paso ${activeStep}`}
                              className="absolute max-w-none transition-transform duration-700 group-hover:scale-105"
                              style={{
                                 width: '100%',
                                 height: '100%',
                                 objectFit: 'cover',
                                 top: 0,
                                 left: 0
                              }}
                           />
                        </AnimatePresence>
                     </div>
                  </motion.div>
               </div>
            </div>
         </div>
      </section>
   );
}
