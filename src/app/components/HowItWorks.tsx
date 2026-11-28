import React from 'react';
import { MessageSquare, ClipboardList, CheckCircle } from 'lucide-react';

export function HowItWorks() {
  const steps = [
    {
      title: 'Dinos qué buscas',
      description: 'Responde unas breves preguntas sobre el servicio que necesitas para entender mejor tu proyecto.',
      icon: MessageSquare,
    },
    {
      title: 'Recibe propuestas si hay profesionales interesados',
      description: 'Publicar es gratis. La cantidad de propuestas y el tiempo de respuesta no están garantizados.',
      icon: ClipboardList,
    },
    {
      title: 'Elige al mejor profesional',
      description: 'Revisa sus perfiles, valoraciones de otros clientes y elige el que mejor encaje.',
      icon: CheckCircle,
    }
  ];

  return (
    <section className="py-24 bg-gray-50 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-20">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-4">
            ¿Cómo funciona?
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Conseguir al profesional adecuado nunca ha sido tan fácil y rápido.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
          {/* Connector line for desktop */}
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-gray-200 z-0"></div>

          {steps.map((step, index) => (
            <div key={index} className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-md mb-8 border-4 border-gray-50 z-10">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                  <step.icon className="w-8 h-8 text-blue-600" />
                </div>
              </div>
              <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm absolute top-0 right-1/2 translate-x-10 -translate-y-2 border-4 border-gray-50 z-20 shadow-sm">
                {index + 1}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
              <p className="text-gray-600 leading-relaxed max-w-sm mx-auto">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
