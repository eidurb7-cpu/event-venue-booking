-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('customer', 'vendor');

-- CreateEnum
CREATE TYPE "VendorApplicationStatus" AS ENUM ('pending_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "VendorOfferStatus" AS ENUM ('pending', 'accepted', 'ignored');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'customer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorApplication" (
    "id" TEXT NOT NULL,
    "status" "VendorApplicationStatus" NOT NULL DEFAULT 'pending_review',
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "city" TEXT,
    "websiteUrl" TEXT,
    "portfolioUrl" TEXT,
    "businessIntro" TEXT,
    "categories" JSONB,
    "documentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'open',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "selectedServices" JSONB NOT NULL,
    "budget" INTEGER NOT NULL,
    "eventDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorOffer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorEmail" TEXT,
    "price" INTEGER NOT NULL,
    "message" TEXT,
    "status" "VendorOfferStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VendorApplication_email_key" ON "VendorApplication"("email");

-- CreateIndex
CREATE INDEX "ServiceRequest_customerEmail_idx" ON "ServiceRequest"("customerEmail");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- CreateIndex
CREATE INDEX "VendorOffer_requestId_idx" ON "VendorOffer"("requestId");

-- CreateIndex
CREATE INDEX "VendorOffer_status_idx" ON "VendorOffer"("status");

-- AddForeignKey
ALTER TABLE "VendorOffer" ADD CONSTRAINT "VendorOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
