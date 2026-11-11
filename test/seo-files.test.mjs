import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readPublicFile = (filename) => readFile(path.join(root, 'public', filename), 'utf8');

test('robots publishes the sitemap and keeps private areas out of crawling', async () => {
  const robots = await readPublicFile('robots.txt');

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Sitemap: https:\/\/artocamello\.com\/sitemap\.xml$/m);
  for (const pathName of ['/dashboard/', '/mi-perfil', '/mis-solicitudes', '/onboarding', '/admin/']) {
    assert.match(robots, new RegExp(`^Disallow: ${pathName.replaceAll('/', '\\/')}$`, 'm'));
  }
});

test('sitemap includes only canonical public pages', async () => {
  const sitemap = await readPublicFile('sitemap.xml');

  for (const pathName of ['', '/pro', '/search']) {
    assert.match(sitemap, new RegExp(`<loc>https://artocamello\\.com${pathName ? pathName.replace('/', '\\/') : ''}</loc>`));
  }
  for (const privatePath of ['/dashboard', '/mi-perfil', '/mis-solicitudes', '/onboarding', '/recuperar-contrasena', '/verificar-correo']) {
    assert.doesNotMatch(sitemap, new RegExp(privatePath));
  }
});
