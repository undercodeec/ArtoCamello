ALTER TABLE "ClientProfile" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'artocamello';
ALTER TABLE "ProfessionalProfile" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'artocamello';
ALTER TABLE "Review" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'artocamello';

UPDATE "ClientProfile" p SET "tenantId" = u."tenantId" FROM "User" u WHERE p."userId" = u."id";
UPDATE "ProfessionalProfile" p SET "tenantId" = u."tenantId" FROM "User" u WHERE p."userId" = u."id";
UPDATE "Review" r SET "tenantId" = u."tenantId" FROM "User" u WHERE r."clientId" = u."id";

CREATE INDEX "ClientProfile_tenantId_idx" ON "ClientProfile"("tenantId");
CREATE INDEX "ProfessionalProfile_tenantId_verified_idx" ON "ProfessionalProfile"("tenantId", "verified");
CREATE INDEX "Review_tenantId_professionalId_idx" ON "Review"("tenantId", "professionalId");
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionalProfile" ADD CONSTRAINT "ProfessionalProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
