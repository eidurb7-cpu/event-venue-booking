-- Enums
CREATE TYPE "VendorProfileStatus" AS ENUM ('pending', 'approved', 'active', 'declined', 'suspended');
CREATE TYPE "MarketplacePriceType" AS ENUM ('fixed', 'per_person');
CREATE TYPE "AvailabilityStatus" AS ENUM ('available', 'reserved', 'booked', 'blocked');
CREATE TYPE "BookingStatus" AS ENUM ('draft', 'pending', 'partially_accepted', 'accepted', 'declined', 'expired', 'cancelled', 'completed');
CREATE TYPE "BookingItemStatus" AS ENUM ('pending', 'accepted', 'declined', 'counter_offered', 'cancelled');
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'paid', 'failed', 'refunded', 'void');
CREATE TYPE "AnalyticsEventType" AS ENUM ('profile_view', 'service_view', 'booking_request', 'booking_accepted', 'review_created');

-- Profile tables
CREATE TABLE "CustomerProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "address" TEXT,
  "phone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerProfile_userId_key" ON "CustomerProfile"("userId");
ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VendorProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "vendorApplicationId" TEXT,
  "status" "VendorProfileStatus" NOT NULL DEFAULT 'pending',
  "category" TEXT NOT NULL,
  "description" TEXT,
  "totalReviews" INTEGER NOT NULL DEFAULT 0,
  "ratingAverage" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorProfile_userId_key" ON "VendorProfile"("userId");
CREATE UNIQUE INDEX "VendorProfile_vendorApplicationId_key" ON "VendorProfile"("vendorApplicationId");
ALTER TABLE "VendorProfile"
  ADD CONSTRAINT "VendorProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorProfile"
  ADD CONSTRAINT "VendorProfile_vendorApplicationId_fkey"
  FOREIGN KEY ("vendorApplicationId") REFERENCES "VendorApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Marketplace services + availability
CREATE TABLE "MarketplaceService" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "basePrice" INTEGER NOT NULL,
  "priceType" "MarketplacePriceType" NOT NULL DEFAULT 'fixed',
  "capacity" INTEGER,
  "location" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceService_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceService_vendorId_idx" ON "MarketplaceService"("vendorId");
CREATE INDEX "MarketplaceService_category_idx" ON "MarketplaceService"("category");
CREATE INDEX "MarketplaceService_isActive_idx" ON "MarketplaceService"("isActive");
ALTER TABLE "MarketplaceService"
  ADD CONSTRAINT "MarketplaceService_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Availability" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "status" "AvailabilityStatus" NOT NULL DEFAULT 'available',
  "reservationExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Availability_serviceId_date_key" ON "Availability"("serviceId", "date");
CREATE INDEX "Availability_date_idx" ON "Availability"("date");
CREATE INDEX "Availability_status_idx" ON "Availability"("status");
ALTER TABLE "Availability"
  ADD CONSTRAINT "Availability_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "MarketplaceService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Booking engine
CREATE TABLE "Booking" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'draft',
  "eventDate" TIMESTAMP(3) NOT NULL,
  "totalPrice" INTEGER NOT NULL DEFAULT 0,
  "finalPrice" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");
CREATE INDEX "Booking_status_idx" ON "Booking"("status");
CREATE INDEX "Booking_eventDate_idx" ON "Booking"("eventDate");
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BookingItem" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "priceOffered" INTEGER NOT NULL,
  "finalPrice" INTEGER,
  "status" "BookingItemStatus" NOT NULL DEFAULT 'pending',
  "vendorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingItem_bookingId_idx" ON "BookingItem"("bookingId");
CREATE INDEX "BookingItem_vendorId_idx" ON "BookingItem"("vendorId");
CREATE INDEX "BookingItem_serviceId_idx" ON "BookingItem"("serviceId");
CREATE INDEX "BookingItem_status_idx" ON "BookingItem"("status");
ALTER TABLE "BookingItem"
  ADD CONSTRAINT "BookingItem_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingItem"
  ADD CONSTRAINT "BookingItem_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingItem"
  ADD CONSTRAINT "BookingItem_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "MarketplaceService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invoice engine
CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
  "issuedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "stripeSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_bookingId_key" ON "Invoice"("bookingId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Review engine
CREATE TABLE "Review" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Review_bookingId_serviceId_customerId_key" ON "Review"("bookingId", "serviceId", "customerId");
CREATE INDEX "Review_vendorId_idx" ON "Review"("vendorId");
CREATE INDEX "Review_serviceId_idx" ON "Review"("serviceId");
CREATE INDEX "Review_customerId_idx" ON "Review"("customerId");
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "MarketplaceService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Analytics engine
CREATE TABLE "AnalyticsEvent" (
  "id" TEXT NOT NULL,
  "type" "AnalyticsEventType" NOT NULL,
  "userId" TEXT,
  "vendorId" TEXT,
  "serviceId" TEXT,
  "bookingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");
CREATE INDEX "AnalyticsEvent_vendorId_type_createdAt_idx" ON "AnalyticsEvent"("vendorId", "type", "createdAt");
CREATE INDEX "AnalyticsEvent_serviceId_type_createdAt_idx" ON "AnalyticsEvent"("serviceId", "type", "createdAt");
ALTER TABLE "AnalyticsEvent"
  ADD CONSTRAINT "AnalyticsEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent"
  ADD CONSTRAINT "AnalyticsEvent_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent"
  ADD CONSTRAINT "AnalyticsEvent_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "MarketplaceService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent"
  ADD CONSTRAINT "AnalyticsEvent_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VendorDailyStat" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  "bookings" INTEGER NOT NULL DEFAULT 0,
  "revenue" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VendorDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorDailyStat_vendorId_date_key" ON "VendorDailyStat"("vendorId", "date");
CREATE INDEX "VendorDailyStat_date_idx" ON "VendorDailyStat"("date");
ALTER TABLE "VendorDailyStat"
  ADD CONSTRAINT "VendorDailyStat_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
