-- Existing submissions predate the declared amount field and retain NULL.
ALTER TABLE "TransferSubmission" ADD COLUMN "declaredAmount" DECIMAL(12,2);
