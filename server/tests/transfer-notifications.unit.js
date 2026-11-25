const { test } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

const messages = [];
nodemailer.createTransport = () => ({ sendMail: async message => { messages.push(message); } });
const { notifyTransferReview } = require('../dist/transferNotifications.js');

test('avisa individualmente a los revisores activos del tenant sin adjuntar comprobantes', async () => {
  let query;
  const db = { tenantMembership: { findMany: async args => {
    query = args;
    return [{ user: { email: 'reviewer@example.test' } }, { user: { email: 'reviewer@example.test' } }, { user: { email: 'owner@example.test' } }];
  } } };
  await notifyTransferReview(db, 'tenant-one', 'AC-REFERENCE');
  assert.equal(query.where.tenantId, 'tenant-one');
  assert.equal(query.where.status, 'active');
  assert.equal(query.where.user.active, true);
  assert.equal(query.where.role.permissions.some.permission.code, 'payments.review');
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map(message => message.to), ['reviewer@example.test', 'owner@example.test']);
  assert.match(messages[0].text, /AC-REFERENCE/);
  assert.equal(messages[0].attachments, undefined);
});
