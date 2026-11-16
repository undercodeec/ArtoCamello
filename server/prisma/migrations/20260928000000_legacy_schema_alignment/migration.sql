-- Bring the original database migrations in line with the models that
-- existed before multi-tenant administration was introduced.  The original
-- checkout created these structures through db push, so a clean migrate
-- deploy otherwise reaches the multi-tenant migration without Quote/Review.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_verificationToken_key" ON "User"("verificationToken");

ALTER TABLE "ServiceRequest" ADD COLUMN IF NOT EXISTS "estimatedBudget" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "documentType" TEXT;
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "documentId" TEXT;

ALTER TABLE "LeadPurchase" ADD COLUMN IF NOT EXISTS "costUSD" DOUBLE PRECISION;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'LeadPurchase'
      AND column_name = 'creditsCost'
  ) THEN
    EXECUTE 'UPDATE "LeadPurchase" SET "costUSD" = COALESCE("costUSD", "creditsCost")';
  END IF;
END $$;
UPDATE "LeadPurchase" SET "costUSD" = 0 WHERE "costUSD" IS NULL;
ALTER TABLE "LeadPurchase" ALTER COLUMN "costUSD" SET NOT NULL;
ALTER TABLE "LeadPurchase" DROP COLUMN IF EXISTS "creditsCost";
ALTER TABLE "LeadPurchase" ADD COLUMN IF NOT EXISTS "payphoneTransactionId" TEXT;
ALTER TABLE "LeadPurchase" ADD COLUMN IF NOT EXISTS "payphoneClientTxId" TEXT;
ALTER TABLE "LeadPurchase" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "LeadPurchase_payphoneClientTxId_key" ON "LeadPurchase"("payphoneClientTxId");

-- The original enum used unlocked/rejected_limit_reached. Map its completed
-- and rejected states before matching the enum declared by Prisma.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = '"LeadPurchaseStatus"'::regtype
      AND enumlabel IN ('unlocked', 'rejected_limit_reached')
  ) THEN
    EXECUTE 'ALTER TABLE "LeadPurchase" ALTER COLUMN "status" DROP DEFAULT';
    EXECUTE 'CREATE TYPE "LeadPurchaseStatus_aligned" AS ENUM (''pending'', ''paid'', ''failed'')';
    EXECUTE $sql$
      ALTER TABLE "LeadPurchase"
      ALTER COLUMN "status" TYPE "LeadPurchaseStatus_aligned"
      USING (
        CASE "status"::text
          WHEN 'unlocked' THEN 'paid'
          WHEN 'rejected_limit_reached' THEN 'failed'
          ELSE "status"::text
        END
      )::"LeadPurchaseStatus_aligned"
    $sql$;
    EXECUTE 'ALTER TYPE "LeadPurchaseStatus" RENAME TO "LeadPurchaseStatus_legacy"';
    EXECUTE 'ALTER TYPE "LeadPurchaseStatus_aligned" RENAME TO "LeadPurchaseStatus"';
    EXECUTE 'DROP TYPE "LeadPurchaseStatus_legacy"';
  END IF;
END $$;
ALTER TABLE "LeadPurchase" ALTER COLUMN "status" SET DEFAULT 'pending';

DO $$
BEGIN
  CREATE TYPE "QuoteStatus" AS ENUM ('sent', 'accepted', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Review_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Review_professionalId_idx" ON "Review"("professionalId");

CREATE TABLE IF NOT EXISTS "Quote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "estimatedPrice" DOUBLE PRECISION NOT NULL,
    "estimatedDays" INTEGER,
    "status" "QuoteStatus" NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Quote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quote_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quote_requestId_professionalId_key" UNIQUE ("requestId", "professionalId")
);
