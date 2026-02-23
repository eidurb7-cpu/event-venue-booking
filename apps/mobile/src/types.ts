export type VendorCompliance = {
  contractAccepted: boolean;
  contractAcceptedAt?: string | null;
  contractVersion?: string | null;
  trainingCompleted: boolean;
  trainingCompletedAt?: string | null;
  adminApproved: boolean;
  canPublish: boolean;
};

export type VendorApplication = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  status: string;
  city?: string | null;
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
