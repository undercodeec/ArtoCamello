ALTER TABLE "ServiceRequest" DROP CONSTRAINT IF EXISTS "ServiceRequest_targetProfessionalUserId_fkey";
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_targetProfessionalUserId_fkey" FOREIGN KEY ("targetProfessionalUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
