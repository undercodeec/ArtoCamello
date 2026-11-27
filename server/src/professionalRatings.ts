import { PrismaClient } from '@prisma/client';

/** Public ratings only count reviews linked to a completed hire; legacy reviews remain visible. */
export async function verifiedReviewStats(db: PrismaClient, tenantId: string, professionalUserIds: string[]) {
  const stats = new Map<string, { rating: number; reviewCount: number }>();
  if (!professionalUserIds.length) return stats;
  const groups = await db.review.groupBy({
    by: ['professionalId'],
    where: { tenantId, professionalId: { in: professionalUserIds }, requestId: { not: null } },
    _avg: { rating: true }, _count: { _all: true },
  });
  for (const group of groups) stats.set(group.professionalId, { rating: group._avg.rating ?? 0, reviewCount: group._count._all });
  return stats;
}
