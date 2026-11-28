import React from 'react';
import { UserPlus, ShieldCheck, CreditCard, HeadphonesIcon } from 'lucide-react';
import { motion } from 'motion/react';

export function ProHowItWorks() {
  const steps = [
    {
      icon: UserPlus,
      title: "Crea una cuenta",
       description: "Crea tu cuenta gratuita y configura los servicios y las zonas que puedes atender. Tu perfil deberá verificarse antes de acceder a las solicitudes."
    },
    {
      icon: ShieldCheck,
       title: "Explora solicitudes disponibles",
       description: "Consulta las oportunidades de tus categorías. Las zonas declaradas ayudan a excluir otras ciudades; confirma el sector exacto y la conveniencia del trabajo antes de pagar."
    },
    {
      icon: CreditCard,
      title: "Paga por los que interesan",
       description: "Paga el costo indicado por el contacto que te interese. Tras validar el pago podrás comunicarte con el cliente y enviar una cotización; no se garantiza respuesta ni contratación."
    },
    {
      icon: HeadphonesIcon,
       title: "Propón tu servicio",
       description: "Si el cliente está interesado, acuerda con él las condiciones del trabajo. El pago del servicio final se realiza directamente entre ambas partes."
    }
  ];

  return (
    <section className="py-20 md:py-28 bg-gray-50 overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mb-16 md:mb-20"
        >
          <h2 className="text-3xl md:text-4xl lg:text-[40px] font-bold text-[#101828]">
            Cómo funciona ArtoCamello
          </h2>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {steps.map((step, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="flex flex-col items-start text-left group"
            >
              <div className="mb-6 group-hover:-translate-y-1 transition-transform duration-300">
                <step.icon className="w-12 h-12 text-[#101828]" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl md:text-2xl font-bold text-[#101828] mb-4">
                {step.title}
              </h3>
              <p className="text-gray-600 text-base md:text-[17px] leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
