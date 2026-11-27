ALTER TABLE "Review" ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "Review_requestId_key" ON "Review"("requestId");
ALTER TABLE "Review" ADD CONSTRAINT "Review_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
