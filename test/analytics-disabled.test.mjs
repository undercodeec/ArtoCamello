import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('el sitio no carga Analytics ni Meta Pixel ni envía eventos de Meta', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const tracker = await readFile(new URL('../src/shared/lib/metaPixel.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|fbq\s*\(/i);
  assert.doesNotMatch(tracker, /window\.fbq\s*\(/);
});
