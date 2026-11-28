CREATE TABLE "BillingProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "idType" VARCHAR(12) NOT NULL,
  "idNumber" VARCHAR(32) NOT NULL,
  "legalName" VARCHAR(160) NOT NULL,
  "address" VARCHAR(255) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "phone" VARCHAR(40) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingProfile_userId_key" ON "BillingProfile"("userId");
CREATE INDEX "BillingProfile_tenantId_userId_idx" ON "BillingProfile"("tenantId", "userId");
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD COLUMN "billingSnapshot" JSONB;
