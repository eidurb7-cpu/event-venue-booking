-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'paid';

-- AlterEnum
ALTER TYPE "BookingItemStatus" ADD VALUE IF NOT EXISTS 'requested';
ALTER TYPE "BookingItemStatus" ADD VALUE IF NOT EXISTS 'countered';
ALTER TYPE "BookingItemStatus" ADD VALUE IF NOT EXISTS 'agreed';
ALTER TYPE "BookingItemStatus" ADD VALUE IF NOT EXISTS 'expired';

-- CreateEnum
CREATE TYPE "OfferActorRole" AS ENUM ('customer', 'vendor', 'system', 'admin');

-- CreateEnum
CREATE TYPE "OfferEventType" AS ENUM ('request_created', 'vendor_countered', 'customer_countered', 'vendor_accepted', 'customer_accepted', 'declined', 'expired');

-- AlterTable
ALTER TABLE "BookingItem"
ADD COLUMN "latestPriceCents" INTEGER,
ADD COLUMN "finalPriceCents" INTEGER,
ADD COLUMN "isRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "currentOfferVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "customerAcceptedVersion" INTEGER,
ADD COLUMN "vendorAcceptedVersion" INTEGER,
ADD COLUMN "lastNegotiationAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "OfferEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingItemId" TEXT NOT NULL,
    "vendorId" TEXT,
    "actorRole" "OfferActorRole" NOT NULL,
    "type" "OfferEventType" NOT NULL,
    "offerVersion" INTEGER NOT NULL,
    "priceCents" INTEGER,
    "reason" TEXT,
    "breakdownJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferEvent_bookingId_idx" ON "OfferEvent"("bookingId");

-- CreateIndex
CREATE INDEX "OfferEvent_vendorId_idx" ON "OfferEvent"("vendorId");

-- CreateIndex
CREATE INDEX "OfferEvent_bookingItemId_createdAt_idx" ON "OfferEvent"("bookingItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfferEvent_bookingItemId_offerVersion_type_key" ON "OfferEvent"("bookingItemId", "offerVersion", "type");

-- AddForeignKey
ALTER TABLE "OfferEvent"
ADD CONSTRAINT "OfferEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEvent"
ADD CONSTRAINT "OfferEvent_bookingItemId_fkey" FOREIGN KEY ("bookingItemId") REFERENCES "BookingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEvent"
ADD CONSTRAINT "OfferEvent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
