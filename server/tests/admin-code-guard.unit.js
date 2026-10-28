const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');
const { adminEmailCodeRouter } = require('../dist/adminEmailCodeRouter');

test('admin email code cannot be redeemed without a password-stage token', async () => {
  const secret = 'unit-test-secret';
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminEmailCodeRouter({}, secret));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/admin/access-code/verify`;
    const publicToken = jwt.sign({ userId: 'test-user' }, secret);
    for (const authorization of [undefined, `Bearer ${publicToken}`]) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
        body: JSON.stringify({ code: '123456' }),
      });
      assert.equal(response.status, 401);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
