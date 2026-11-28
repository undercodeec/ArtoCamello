const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const nodemailer = require('nodemailer');
const messages = [];
nodemailer.createTransport = () => ({ sendMail: async message => { messages.push(message); return { accepted: [message.to, message.cc].filter(Boolean) }; } });
const { sendTransferReceipt, loadReceipt } = require('../dist/transferReceipt.js');

test('prepara un recibo seguro con logo para el worker de correo', async () => {
  const db = {
    payment: { findFirst: async query => {
      assert.equal(query.where.tenantId, 'tenant-a');
      assert.equal(query.where.status, 'allocated');
      return { method: 'transfer', payer: { fullName: '<Cliente>', email: 'pro@example.test', active: true }, allocations: [{ billingSnapshot: { legalName: '<script>Negocio</script>', idType: 'ruc', idNumber: '1712345678001', address: 'Quito', email: 'pro@example.test', phone: '0991234567' } }], confirmedAt: new Date('2026-11-24T12:00:00Z'), amount: { toFixed: () => '6.00' }, currency: 'USD', reference: 'AC-123' };
    } },
  };
  await sendTransferReceipt(db, 'tenant-a', 'payment-1');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'pro@example.test');
  assert.match(messages[0].html, /&lt;script&gt;Negocio&lt;\/script&gt;/);
  assert.ok(!messages[0].html.includes('<script>'));
  assert.match(messages[0].text, /6\.00 USD/);
  assert.match(messages[0].text, /Profesional: <script>Negocio<\/script>/);
  assert.match(messages[0].text, /Identificación declarada: RUC: 1712345678001/);
  assert.match(messages[0].text, /Dirección declarada: Quito/);
  assert.match(messages[0].text, /no una factura tributaria/);
  assert.equal(messages[0].attachments[0].cid, 'artocamello-logo');
  assert.ok(fs.existsSync(messages[0].attachments[0].path));
  assert.equal(messages[0].attachments[1].contentType, 'application/pdf');
  assert.equal(messages[0].attachments[1].content.subarray(0, 4).toString(), '%PDF');
});

test('protege el recibo por tenant y titular, y usa el correo fiscal declarado', async () => {
  let seen;
  const db = { payment: { findFirst: async args => { seen = args.where; return {
    method: 'transfer', payer: { fullName: 'Profesional', email: 'cuenta@example.test', active: true },
    allocations: [{ billingSnapshot: { legalName: 'Empresa', email: 'facturas@example.test' } }],
    confirmedAt: new Date('2026-11-24T12:00:00Z'), amount: { toFixed: () => '3.00' }, currency: 'USD', reference: 'AC-123',
  }; } } };
  const receipt = await loadReceipt(db, 'tenant-a', 'payment-1', 'payer-1');
  assert.deepEqual(seen, { id: 'payment-1', tenantId: 'tenant-a', payerUserId: 'payer-1', status: 'allocated' });
  assert.equal(receipt.billingEmail, 'facturas@example.test');
  await sendTransferReceipt(db, 'tenant-a', 'payment-1');
  assert.equal(messages.at(-1).to, 'cuenta@example.test');
  assert.equal(messages.at(-1).cc, 'facturas@example.test');
});

test('no envía recibos a una cuenta que ya fue cerrada', async () => {
  const initial = messages.length;
  const db = { payment: { findFirst: async () => ({
    method: 'transfer', payer: { active: false, email: 'closed@example.test', fullName: 'Cerrada' }, allocations: [{ billingSnapshot: null }], confirmedAt: new Date(), amount: { toFixed: () => '3.00' }, currency: 'USD', reference: 'AC-CLOSED',
  }) } };
  assert.equal(await sendTransferReceipt(db, 'tenant-a', 'payment-closed'), false);
  assert.equal(messages.length, initial);
});
