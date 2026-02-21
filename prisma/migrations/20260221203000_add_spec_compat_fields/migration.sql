-- AlterTable
ALTER TABLE "User"
ADD COLUMN "fullName" TEXT,
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill User compatibility fields
UPDATE "User" SET "fullName" = "name" WHERE "fullName" IS NULL;
UPDATE "User" SET "passwordHash" = "password" WHERE "passwordHash" IS NULL;

-- AlterTable
ALTER TABLE "VendorProfile"
ADD COLUMN "vendorStatus" "VendorProfileStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "businessName" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "contractAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "contractAcceptedAt" TIMESTAMP(3),
ADD COLUMN "trainingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "trainingCompletedAt" TIMESTAMP(3),
ADD COLUMN "stripeAccountId" TEXT,
ADD COLUMN "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.15;

-- Backfill VendorProfile compatibility fields
UPDATE "VendorProfile" SET "vendorStatus" = "status";

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "vendorId" TEXT,
ADD COLUMN "venueId" TEXT,
ADD COLUMN "serviceId" TEXT,
ADD COLUMN "agreedNetAmount" DOUBLE PRECISION,
ADD COLUMN "vatAmount" DOUBLE PRECISION,
ADD COLUMN "grossAmount" DOUBLE PRECISION,
ADD COLUMN "platformFee" DOUBLE PRECISION,
ADD COLUMN "vendorNetAmount" DOUBLE PRECISION,
ADD COLUMN "stripeSessionId" TEXT,
ADD COLUMN "stripePaymentIntentId" TEXT;

-- Optional index to speed lookup on webhook-driven updates
CREATE INDEX "Booking_stripePaymentIntentId_idx" ON "Booking"("stripePaymentIntentId");
