-- Add customer contact phone on service requests
ALTER TABLE "ServiceRequest"
ADD COLUMN "customerPhone" TEXT;

-- Add admin review metadata for vendor applications
ALTER TABLE "VendorApplication"
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);
