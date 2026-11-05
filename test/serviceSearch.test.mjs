import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POPULAR_SERVICES } from '../src/app/constants/services.ts';
import { matchesProfessionalSearch, matchesServiceCategory, serviceId } from '../src/app/constants/serviceSearch.ts';

test('every header service has a category filter that matches its profile label', () => {
  for (const service of POPULAR_SERVICES) {
    assert.ok(service.slug, `${service.label} needs a category slug`);
    assert.equal(matchesServiceCategory([service.label], service.slug), true, service.label);
  }
});

test('saved labels, canonical slugs and accented search terms resolve consistently', () => {
  assert.equal(serviceId('Fontaneros'), 'fontaneria');
  assert.equal(matchesServiceCategory(['Fontaneros'], 'fontaneria'), true);
  assert.equal(matchesServiceCategory(['fontaneria'], 'Fontanería'), true);
  assert.equal(matchesServiceCategory(['Pintores'], 'pintura'), true);
  assert.equal(matchesServiceCategory(['Electricistas'], 'electricidad'), true);
});

test('dog trainer filter stays separate from other services', () => {
  assert.equal(matchesServiceCategory(['Adiestrador canino'], 'adiestrador-canino'), true);
  assert.equal(matchesServiceCategory(['Pintores'], 'adiestrador-canino'), false);
  assert.equal(matchesServiceCategory(['Cuidado de mascotas'], 'adiestrador-canino'), false);
});

test('free text searches categories, business names, bio and skills', () => {
  const professional = {
    fullName: 'Ana Torres',
    profile: {
      businessName: 'ElectriFix',
      bio: 'Instalaciones para hogares',
      categories: ['Electricistas'],
      skills: ['Paneles solares'],
    },
  };
  for (const query of ['electricidad', 'electricistas', 'electrifix', 'instalaciones', 'paneles solares', 'ana torres']) {
    assert.equal(matchesProfessionalSearch(professional, query), true, query);
  }
  assert.equal(matchesProfessionalSearch(professional, 'adiestrador canino'), false);
});
