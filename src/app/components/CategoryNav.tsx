import React from 'react';
import { HardHat, Leaf, Wrench, Paintbrush, Droplets, Zap, Sparkles, Hammer } from 'lucide-react';
import { Link } from 'react-router';

export function CategoryNav() {
  const categories = [
    { icon: HardHat, name: 'Albañiles', slug: 'albanileria' },
    { icon: Leaf, name: 'Jardineros', slug: 'jardineria' },
    { icon: Wrench, name: 'Manitas a\ndomicilio', slug: 'mantenimiento' },
    { icon: Paintbrush, name: 'Pintores', slug: 'pintura' },
    { icon: Droplets, name: 'Fontaneros', slug: 'fontaneria' },
    { icon: Zap, name: 'Electricistas', slug: 'electricidad' },
    { icon: Sparkles, name: 'Limpieza a\ndomicilio', slug: 'limpieza' },
    { icon: Hammer, name: 'Carpinteros', slug: 'carpinteria' }
  ];

  return (
    <section className="bg-white border-b border-gray-100 py-6 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-start gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {categories.map((cat, index) => (
            <Link 
              key={index} 
              to={`/search?c=${cat.slug}`}
              className="flex flex-col items-center justify-start min-w-[100px] text-center cursor-pointer group"
            >
              <div className="w-14 h-14 border border-gray-200 rounded-2xl flex items-center justify-center mb-3 group-hover:border-[#FFCA0C] transition-colors bg-white shadow-sm">
                <cat.icon className="w-6 h-6 text-gray-600 group-hover:text-[#FFCA0C]" strokeWidth={1.5} />
              </div>
              <span className="text-xs font-semibold text-[#62646A] whitespace-pre-line group-hover:text-[#FFCA0C] transition-colors">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
