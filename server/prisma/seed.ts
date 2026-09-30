import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const db = new PrismaClient();
const rolePermissions: Record<string, string[]> = {
  platform_owner: ['tenants.manage','dashboard.read','payments.read','payments.review','payments.export','users.read','users.manage','professionals.verify','admins.read','admins.invite','admins.manage','roles.read','roles.manage','settings.read','settings.manage','audit.read'],
  tenant_owner: ['dashboard.read','payments.read','payments.review','payments.export','users.read','users.manage','professionals.verify','admins.read','admins.invite','admins.manage','roles.read','roles.manage','settings.read','settings.manage','audit.read'],
  operations_admin: ['dashboard.read','payments.read','users.read','users.manage','professionals.verify','admins.read','roles.read','settings.read'],
  payments_reviewer: ['dashboard.read','payments.read','payments.review','payments.export','audit.read','settings.read'],
  support_agent: ['dashboard.read','payments.read','users.read','admins.read','settings.read'],
  auditor: ['dashboard.read','payments.read','users.read','admins.read','roles.read','settings.read','audit.read'],
};

async function main() {
  await db.tenant.upsert({ where: { id: 'artocamello' }, update: {}, create: {
    id: 'artocamello', slug: 'artocamello', name: 'ArtoCamello',
    settings: { maxProfessionalsPerLead: 4, leadFeeRate: 0.06, leadMinCostUSD: 3, currency: 'USD', transferExpiryHours: 72, bankAccounts: [] },
  }});
  for (const hostname of ['artocamello.com', 'www.artocamello.com', 'api.artocamello.com']) {
    await db.tenantDomain.upsert({ where: { hostname }, update: {}, create: { tenantId: 'artocamello', hostname, isPrimary: hostname === 'artocamello.com' } });
  }
  const allCodes = [...new Set(Object.values(rolePermissions).flat())];
  for (const code of allCodes) {
    const [resource, action] = code.split('.');
    await db.permission.upsert({ where: { code }, update: {}, create: { code, resource, action, description: code } });
  }
  for (const [code, codes] of Object.entries(rolePermissions)) {
    const role = await db.adminRole.upsert({ where: { tenantId_code: { tenantId: 'artocamello', code } }, update: {}, create: {
      tenantId: 'artocamello', code, name: code.replaceAll('_', ' '), isSystem: true,
    }});
    for (const permission of await db.permission.findMany({ where: { code: { in: codes } } })) {
      await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
  }
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (email && password) {
    if (password.length < 14) throw new Error('ADMIN_SEED_PASSWORD must have at least 14 characters');
    const user = await db.user.upsert({ where: { email }, update: {}, create: {
      email, password: await bcrypt.hash(password, 12), fullName: 'Administrador inicial', tenantId: 'artocamello', emailVerified: true, role: 'guest',
    }});
    const role = await db.adminRole.findUniqueOrThrow({ where: { tenantId_code: { tenantId: 'artocamello', code: 'tenant_owner' } } });
    await db.tenantMembership.upsert({ where: { tenantId_userId: { tenantId: 'artocamello', userId: user.id } }, update: {}, create: {
      tenantId: 'artocamello', userId: user.id, roleId: role.id, status: 'active', acceptedAt: new Date(),
    }});
  }
  const platformEmail = process.env.PLATFORM_OWNER_EMAIL;
  const platformPassword = process.env.PLATFORM_OWNER_PASSWORD;
  if (platformEmail && platformPassword) {
    if (platformPassword.length < 16) throw new Error('PLATFORM_OWNER_PASSWORD must have at least 16 characters');
    const user = await db.user.upsert({ where: { email: platformEmail }, update: {}, create: {
      email: platformEmail, password: await bcrypt.hash(platformPassword, 12), fullName: 'Platform owner', tenantId: 'artocamello', emailVerified: true, role: 'guest',
    }});
    const role = await db.adminRole.findUniqueOrThrow({ where: { tenantId_code: { tenantId: 'artocamello', code: 'platform_owner' } } });
    await db.tenantMembership.upsert({ where: { tenantId_userId: { tenantId: 'artocamello', userId: user.id } }, update: {}, create: {
      tenantId: 'artocamello', userId: user.id, roleId: role.id, status: 'active', acceptedAt: new Date(),
    }});
  }
}

main().finally(() => db.$disconnect());
