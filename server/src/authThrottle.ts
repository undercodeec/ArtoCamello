import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const throttleKey = (secret: string, parts: string[]) => createHash('sha256').update(JSON.stringify([secret, ...parts])).digest('hex');

export async function consumeAuthAttempt(db: PrismaClient, secret: string, parts: string[], limit: number, windowMs: number) {
  const key = throttleKey(secret, parts);
  const now = new Date();
  const resetsAt = new Date(now.getTime() + windowMs);
  const rows = await db.$queryRaw<Array<{ attempts: number; resetsAt: Date }>>`
    INSERT INTO "AuthThrottle" ("key", "attempts", "resetsAt") VALUES (${key}, 1, ${resetsAt})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "AuthThrottle"."resetsAt" <= ${now} THEN 1 ELSE "AuthThrottle"."attempts" + 1 END,
      "resetsAt" = CASE WHEN "AuthThrottle"."resetsAt" <= ${now} THEN ${resetsAt} ELSE "AuthThrottle"."resetsAt" END
    RETURNING "attempts", "resetsAt"
  `;
  const state = rows[0];
  return { allowed: state.attempts <= limit, retryAfterSeconds: Math.max(1, Math.ceil((state.resetsAt.getTime() - now.getTime()) / 1000)) };
}

export async function clearAuthAttempt(db: PrismaClient, secret: string, parts: string[]) {
  await db.authThrottle.deleteMany({ where: { key: throttleKey(secret, parts) } });
}

export async function pruneAuthAttempts(db: PrismaClient) {
  await db.authThrottle.deleteMany({ where: { resetsAt: { lt: new Date(Date.now() - 86400000) } } });
}
