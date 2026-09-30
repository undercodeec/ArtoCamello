import { Prisma, PrismaClient } from '@prisma/client';

async function main() {
  const db = new PrismaClient();
  try {
    const purchases = await db.leadPurchase.findMany({ where: { status: 'paid' }, select: { id: true, costUSD: true, tenantId: true, payphoneClientTxId: true, payphoneTransactionId: true } });
    const allocations = await db.paymentAllocation.findMany({ where: { leadPurchaseId: { in: purchases.map(p => p.id) } }, include: { payment: true } });
    const allocated = new Map(allocations.map(a => [a.leadPurchaseId, a]));
    const mismatches = purchases.filter(p => {
      const a = allocated.get(p.id);
      return !a || a.tenantId !== p.tenantId || a.payment.tenantId !== p.tenantId || !a.amount.equals(new Prisma.Decimal(p.costUSD.toFixed(2))) || (p.payphoneClientTxId && a.payment.method === 'payphone' && a.payment.reference !== p.payphoneClientTxId) || (p.payphoneTransactionId && a.payment.providerPaymentId !== p.payphoneTransactionId);
    });
    const purchaseTotal = purchases.reduce((sum, p) => sum.plus(new Prisma.Decimal(p.costUSD.toFixed(2))), new Prisma.Decimal(0));
    const allocatedTotal = allocations.reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0));
    console.log(JSON.stringify({ paidPurchases: purchases.length, allocatedPayments: allocations.length, purchaseTotalUSD: purchaseTotal.toFixed(2), allocatedTotalUSD: allocatedTotal.toFixed(2), mismatches: mismatches.map(p => p.id) }, null, 2));
    if (mismatches.length || allocations.length !== purchases.length || !purchaseTotal.equals(allocatedTotal)) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
