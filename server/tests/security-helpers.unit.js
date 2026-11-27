const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRecaptchaVerifier, CaptchaConfigurationError } = require('../dist/captcha');
const { escapeHtml } = require('../dist/htmlEscape');
const { createEmailVerificationToken, verifyEmailVerificationToken } = require('../dist/emailVerification');
const { leadAmount, settingsOf } = require('../dist/payments');

test('lead fee uses tenant percentage, minimum and cents rounding instead of a payer-entered amount', () => {
  const defaults = settingsOf({});
  assert.equal(defaults.leadFeeRate, 0.06);
  assert.equal(leadAmount(20, defaults).toFixed(2), '3.00');
  assert.equal(leadAmount(100, defaults).toFixed(2), '6.00');
  assert.equal(leadAmount(101, defaults).toFixed(2), '6.06');
  assert.equal(leadAmount(100, settingsOf({ leadFeeRate: 0.1, leadMinCostUSD: 4 })).toFixed(2), '10.00');
});

const validCaptcha = {
  success: true,
  challenge_ts: '2026-11-10T12:00:00Z',
  hostname: 'artocamello.com',
  'error-codes': [],
};

function captchaFetch(body, status = 200) {
  return async () => ({ ok: status >= 200 && status < 300, json: async () => body });
}

test('CAPTCHA accepts a fresh successful answer for the expected hostname', async () => {
  const verify = createRecaptchaVerifier({
    secret: 'server-secret',
    fetchImpl: captchaFetch(validCaptcha),
    now: () => Date.parse('2026-11-10T12:01:00Z'),
  });
  assert.equal(await verify('browser-token', 'artocamello.com'), true);
});

test('CAPTCHA rejects absent and reused tokens', async () => {
  const verify = createRecaptchaVerifier({ secret: 'secret', fetchImpl: captchaFetch({ ...validCaptcha, success: false, 'error-codes': ['timeout-or-duplicate'] }) });
  assert.equal(await verify('', 'artocamello.com'), false);
  assert.equal(await verify('reused', 'artocamello.com'), false);
});

test('CAPTCHA rejects an answer solved on another hostname', async () => {
  const verify = createRecaptchaVerifier({ secret: 'secret', fetchImpl: captchaFetch(validCaptcha), now: () => Date.parse('2026-11-10T12:01:00Z') });
  assert.equal(await verify('token', 'attacker.example'), false);
});

test('CAPTCHA rejects an expired challenge even if success is true', async () => {
  const verify = createRecaptchaVerifier({ secret: 'secret', fetchImpl: captchaFetch(validCaptcha), now: () => Date.parse('2026-11-10T12:03:00Z') });
  assert.equal(await verify('token', 'artocamello.com'), false);
});

test('CAPTCHA fails closed on missing secret and provider errors', async () => {
  const unconfigured = createRecaptchaVerifier({ secret: '' });
  await assert.rejects(unconfigured('token', 'artocamello.com'), CaptchaConfigurationError);
  const unavailable = createRecaptchaVerifier({ secret: 'secret', fetchImpl: captchaFetch(validCaptcha, 503) });
  assert.equal(await unavailable('token', 'artocamello.com'), false);
});

test('CAPTCHA sends secret, response and optional IP to Google siteverify', async () => {
  let request;
  const verify = createRecaptchaVerifier({
    secret: 'server-secret',
    fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, json: async () => validCaptcha }; },
    now: () => Date.parse('2026-11-10T12:01:00Z'),
  });
  assert.equal(await verify('browser-token', 'artocamello.com', '203.0.113.7'), true);
  assert.equal(request.url, 'https://www.google.com/recaptcha/api/siteverify');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.body.get('secret'), 'server-secret');
  assert.equal(request.options.body.get('response'), 'browser-token');
  assert.equal(request.options.body.get('remoteip'), '203.0.113.7');
});

test('HTML escaping neutralizes tags, attributes and entity syntax', () => {
  assert.equal(escapeHtml(`<img src="x" onerror='alert(1)'>&`), '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;');
});

test('email verification tokens are random and validated by hash before expiry', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const first = createEmailVerificationToken(now);
  const second = createEmailVerificationToken(now);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(first.tokenHash.includes(first.token), false);
  assert.equal(verifyEmailVerificationToken(first.token, first.tokenHash, first.expiresAt, new Date('2026-11-10T12:01:00Z')), true);
  assert.equal(verifyEmailVerificationToken(second.token, first.tokenHash, first.expiresAt, now), false);
  assert.equal(verifyEmailVerificationToken(first.token, first.tokenHash, first.expiresAt, first.expiresAt), false);
});
