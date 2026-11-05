ALTER TABLE "ServiceRequest" ADD COLUMN "contactName" TEXT;

UPDATE "Tenant"
SET "settings" = "settings" || jsonb_build_object(
  'bankAccounts',
  '[{"bankName":"Banco Pichincha","accountName":"Rommel Alexander Pangay Sigcho","accountNumber":"2215913574","accountType":"Cuenta de ahorro transaccional","accountHolderId":"1104326853"}]'::jsonb
)
WHERE "id" = 'artocamello';
