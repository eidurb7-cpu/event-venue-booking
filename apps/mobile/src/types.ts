export type VendorCompliance = {
  contractAccepted: boolean;
  contractAcceptedAt?: string | null;
  contractVersion?: string | null;
  contractAcceptedByUserId?: string | null;
  contractAcceptedIP?: string | null;
  trainingCompleted: boolean;
  trainingCompletedAt?: string | null;
  connectOnboardingStatus?: string;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  adminApproved: boolean;
  canBecomeActive?: boolean;
  canPublish: boolean;
};

export type VendorApplication = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  status: string;
  city?: string | null;
  address?: string | null;
  websiteUrl?: string | null;
  portfolioUrl?: string | null;
  profileImageUrl?: string | null;
  profileGalleryUrls?: string[];
  providedServices?: string[];
  businessIntro?: string | null;
  compliance?: VendorCompliance;
};

export type VendorPost = {
  id: string;
  title: string;
  serviceName: string;
  city?: string | null;
  basePrice?: number | null;
  availability?: Record<string, boolean>;
  isActive: boolean;
};

export type PublicVendorPost = {
  id: string;
  title: string;
  serviceName: string;
  description?: string | null;
  city?: string | null;
  basePrice?: number | null;
  availability?: Record<string, boolean>;
  createdAt: string;
  vendorName: string;
};

export type AdminVendorApplication = VendorApplication & {
  compliance?: VendorCompliance;
};

export type CustomerProfileDetails = {
  name: string;
  email: string;
  phone?: string;
  address?: string;
};

export type VendorOffer = {
  id: string;
  vendorName: string;
  vendorEmail?: string | null;
  price: number;
  message?: string | null;
  status: string;
  paymentStatus?: string;
  createdAt: string;
};

export type ServiceRequest = {
  id: string;
  status: string;
  customerName: string;
  customerEmail: string;
  selectedServices: string[];
  budget: number;
  eventDate?: string | null;
  createdAt: string;
  expiresAt: string;
  offers: Array<{
    id: string;
    vendorName: string;
    status: string;
    paymentStatus: string;
    price: number;
    createdAt: string;
  }>;
};

export type VendorOfferWithRequest = VendorOffer & {
  request: ServiceRequest;
};

export type VendorInquiry = {
  id: string;
  vendorEmail: string;
  subject: string;
  message: string;
  adminReply?: string | null;
  adminReplyAttachments?: string[];
  status: string;
  createdAt: string;
};
