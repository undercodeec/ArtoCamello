import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateClientOnboarding } from '../src/app/constants/clientOnboarding.ts';

test('client onboarding requires a real name and reachable phone', () => {
  assert.equal(validateClientOnboarding({ fullName: 'Ana Pérez', phone: '+593 99 123 4567' }), null);
  assert.match(validateClientOnboarding({ fullName: ' ', phone: '0991234567' }), /nombre/i);
  assert.match(validateClientOnboarding({ fullName: 'Ana Pérez', phone: 'abc' }), /teléfono/i);
  assert.match(validateClientOnboarding({ fullName: 'Ana Pérez', phone: '123' }), /teléfono/i);
});
