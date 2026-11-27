import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('SEPS snapshot has complete unique entries that fit the transfer API', async () => {
  const entities = JSON.parse(await readFile(new URL('../src/app/constants/seps-financial-entities.json', import.meta.url), 'utf8'));
  assert.equal(entities.length, 393);
  assert.equal(new Set(entities.map(entity => entity.ruc)).size, entities.length);
  const names = entities.map(entity => entity.name.replace(/^COOPERATIVA DE AHORRO Y CR[EÉ]DITO /, 'COAC ')
    .replace(/^ASOCIACION MUTUALISTA DE AHORRO Y CREDITO PARA LA VIVIENDA /, 'MUTUALISTA '));
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every(name => name.trim() && name.length <= 100));
  assert.ok(names.some(name => name.includes('JARDIN AZUAYO')));
  assert.ok(names.some(name => name.includes('KASAMA')));
});
