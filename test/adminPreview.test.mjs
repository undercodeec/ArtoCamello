import assert from 'node:assert/strict';
import test from 'node:test';

import { adminPreviewPath, isAdminDemoAvailable, isAdminPreview } from '../src/app/adminPreview.ts';

test('detects the local admin preview namespace only on localhost', () => {
  assert.equal(isAdminPreview('localhost', '/admin'), true);
  assert.equal(isAdminPreview('localhost', '/admin/demo'), true);
  assert.equal(isAdminPreview('localhost', '/'), false);
  assert.equal(isAdminPreview('artocamello.com', '/admin/demo'), false);
});

test('builds admin preview links beneath the local namespace', () => {
  assert.equal(adminPreviewPath(), '/admin');
  assert.equal(adminPreviewPath('/demo'), '/admin/demo');
});

test('exposes the admin demo only in development', () => {
  assert.equal(isAdminDemoAvailable(true), true);
  assert.equal(isAdminDemoAvailable(false), false);
});
