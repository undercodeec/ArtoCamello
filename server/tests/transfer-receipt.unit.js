const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const nodemailer = require('nodemailer');
const messages = [];
nodemailer.createTransport = () => ({ sendMail: async message => { messages.push(message); return { accepted: [message.to] }; } });
const { sendTransferReceipt } = require('../dist/transferReceipt.js');

test('prepara un recibo seguro con logo para el worker de correo', async () => {
  const db = {
    payment: { findFirst: async query => {
      assert.equal(query.where.tenantId, 'tenant-a');
      assert.equal(query.where.status, 'allocated');
      return { payer: { fullName: '<Cliente>', email: 'pro@example.test', active: true, professionalProfile: { businessName: 'Mi negocio', city: 'Quito' } }, allocations: [{ leadPurchase: { request: { title: '<script>servicio</script>' } } }], confirmedAt: new Date('2026-11-24T12:00:00Z'), amount: { toFixed: () => '6.00' }, currency: 'USD', reference: 'AC-123' };
    } },
  };
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

test('no envía recibos a una cuenta que ya fue cerrada', async () => {
  const initial = messages.length;
  const db = { payment: { findFirst: async () => ({
    payer: { active: false }, allocations: [{}], confirmedAt: new Date(),
  }) } };
  assert.equal(await sendTransferReceipt(db, 'tenant-a', 'payment-closed'), false);
  assert.equal(messages.length, initial);
});
