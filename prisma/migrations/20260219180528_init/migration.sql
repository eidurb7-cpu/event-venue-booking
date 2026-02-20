-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'pending', 'paid', 'failed');

-- AlterTable
ALTER TABLE "VendorOffer" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
ADD COLUMN     "stripePaymentIntent" TEXT,
ADD COLUMN     "stripeSessionId" TEXT;

-- CreateIndex
CREATE INDEX "VendorOffer_paymentStatus_idx" ON "VendorOffer"("paymentStatus");

-- CreateIndex
CREATE INDEX "VendorOffer_stripeSessionId_idx" ON "VendorOffer"("stripeSessionId");

-- CreateIndex
CREATE INDEX "VendorOffer_stripePaymentIntent_idx" ON "VendorOffer"("stripePaymentIntent");
