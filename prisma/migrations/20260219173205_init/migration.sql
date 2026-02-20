/*
  Warnings:

  - Added the required column `expiresAt` to the `ServiceRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "ServiceRequestStatus" ADD VALUE 'expired';

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedReason" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "offerResponseHours" INTEGER NOT NULL DEFAULT 48;

-- CreateIndex
CREATE INDEX "ServiceRequest_expiresAt_idx" ON "ServiceRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "VendorOffer_vendorEmail_idx" ON "VendorOffer"("vendorEmail");
