export type VendorCompliance = {
  contractAccepted: boolean;
  trainingCompleted: boolean;
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
