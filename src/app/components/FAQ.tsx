import React from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

export function FAQ() {
  const faqs = [
    {
       q: '¿Cómo funciona una solicitud de servicio?',
       a: 'Publicas gratis una necesidad o solicitas directamente a un profesional. Los profesionales interesados pueden desbloquear tu contacto y enviarte una propuesta, sin cantidad ni plazo de respuesta garantizados.'
    },
    {
       q: '¿Quién paga en la plataforma?',
       a: 'Publicar una solicitud es gratis para el cliente. Los profesionales pagan el costo mostrado para desbloquear datos de contacto. El pago del trabajo se acuerda directamente entre cliente y profesional.'
    },
    {
       q: '¿Se garantizan presupuestos o la contratación?',
       a: 'No. La cantidad de propuestas, el tiempo de respuesta y la contratación dependen de los profesionales y del acuerdo entre las partes. ArtoCamello no retiene el pago del trabajo en garantía.'
    },
    {
       q: '¿En qué moneda se muestra el costo de un contacto?',
       a: 'El costo para desbloquear un contacto se muestra en dólares estadounidenses (USD).'
    },
    {
       q: '¿Cómo funcionan las reseñas?',
       a: 'Las reseñas vinculadas a solicitudes completadas y cotizaciones aceptadas cuentan en el promedio verificado. Las reseñas históricas sin esa vinculación se muestran como contratación no verificada y no cuentan en ese promedio.'
    },
    {
      q: '¿Qué sucede si necesito comunicarme con un profesional?',
       a: 'Un profesional que desbloquea tu contacto puede comunicarse contigo por teléfono o correo. También puede enviarte una cotización en la plataforma; las conversaciones externas no se reflejan en el contador de cotizaciones.'
    }
  ];

  return (
    <section id="faq" className="py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-[#404145] mb-10">Preguntas frecuentes</h2>

        <Accordion.Root type="single" collapsible className="w-full">
          {faqs.map((faq, i) => (
            <Accordion.Item key={i} value={`item-${i}`} className="border-b border-gray-200">
              <Accordion.Header>
                <Accordion.Trigger className="flex justify-between items-center w-full py-5 text-left text-[#404145] font-semibold hover:text-[#FFCA0C] transition-colors group">
                  {faq.q}
                  <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-[#FFCA0C] transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden text-[#62646A] text-base pb-5 leading-relaxed data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                {faq.a}
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>


      </div>
    </section>
  );
}
