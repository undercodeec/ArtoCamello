const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');

const prismaCli = require.resolve('prisma/build/index.js');

test('all Prisma migrations deploy to an empty PostgreSQL schema', async () => {
  const baseUrl = process.env.DATABASE_URL;
  assert.ok(baseUrl, 'DATABASE_URL is required for migration integration tests');

  const url = new URL(baseUrl);
  const schema = `migration_test_${crypto.randomUUID().replaceAll('-', '')}`;
  url.searchParams.set('schema', schema);
  const databaseUrl = url.toString();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } finally {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.$disconnect();
  }
});
