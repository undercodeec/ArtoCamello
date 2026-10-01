CREATE TABLE "AdminAccessCode" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminAccessCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminAccessCode_tenantId_userId_key" ON "AdminAccessCode"("tenantId", "userId");
CREATE INDEX "AdminAccessCode_expiresAt_idx" ON "AdminAccessCode"("expiresAt");

ALTER TABLE "AdminAccessCode" ADD CONSTRAINT "AdminAccessCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminAccessCode" ADD CONSTRAINT "AdminAccessCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
