ALTER TABLE "ServiceRequest" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'legacy_unclassified';
ALTER TABLE "ServiceRequest" ADD COLUMN "targetProfessionalUserId" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN "city" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN "payloadHash" TEXT;
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_visibility_check" CHECK (
  ("visibility" = 'direct' AND "targetProfessionalUserId" IS NOT NULL)
  OR ("visibility" IN ('marketplace', 'legacy_unclassified') AND "targetProfessionalUserId" IS NULL)
);
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_targetProfessionalUserId_fkey" FOREIGN KEY ("targetProfessionalUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ServiceRequest_tenantId_visibility_status_createdAt_idx" ON "ServiceRequest"("tenantId", "visibility", "status", "createdAt");
CREATE UNIQUE INDEX "ServiceRequest_tenantId_clientId_idempotencyKey_key" ON "ServiceRequest"("tenantId", "clientId", "idempotencyKey");

CREATE TABLE "EmailVerificationToken" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" VARCHAR(64) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "EmailVerificationToken_userId_key" ON "EmailVerificationToken"("userId");
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash" );
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt" );
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId" ) REFERENCES "User"("id" ) ON DELETE CASCADE ON UPDATE CASCADE;
