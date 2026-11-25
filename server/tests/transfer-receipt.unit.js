const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const nodemailer = require('nodemailer');
const messages = [];
nodemailer.createTransport = () => ({ sendMail: async message => messages.push(message) });
const { sendTransferReceipt } = require('../dist/transferReceipt.js');

test('envía recibo seguro con logo y evita un segundo envío', async () => {
  let claimed = false;
  const db = {
    payment: { findFirst: async query => {
      assert.equal(query.where.tenantId, 'tenant-a');
      assert.equal(query.where.status, 'allocated');
      return { payer: { fullName: '<Cliente>', email: 'pro@example.test', professionalProfile: { businessName: 'Mi negocio', city: 'Quito' } }, allocations: [{ leadPurchase: { request: { title: '<script>servicio</script>' } } }], confirmedAt: new Date('2026-11-24T12:00:00Z'), amount: { toFixed: () => '6.00' }, currency: 'USD', reference: 'AC-123' };
    } },
    paymentEvent: { create: async () => { if (claimed) throw { code: 'P2002' }; claimed = true; } },
  };
  await sendTransferReceipt(db, 'tenant-a', 'payment-1');
  await sendTransferReceipt(db, 'tenant-a', 'payment-1');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'pro@example.test');
  assert.match(messages[0].html, /&lt;script&gt;servicio&lt;\/script&gt;/);
  assert.ok(!messages[0].html.includes('<script>'));
  assert.match(messages[0].text, /6\.00 USD/);
  assert.match(messages[0].text, /Profesional: <Cliente>/);
  assert.match(messages[0].text, /Negocio: Mi negocio/);
  assert.match(messages[0].text, /Ciudad: Quito/);
  assert.match(messages[0].text, /no una factura tributaria/);
  assert.equal(messages[0].attachments[0].cid, 'artocamello-logo');
  assert.ok(fs.existsSync(messages[0].attachments[0].path));
});
