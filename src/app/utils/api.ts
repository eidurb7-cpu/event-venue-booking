const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export type ServiceRequestStatus = 'open' | 'closed' | 'expired';
export type VendorOfferStatus = 'pending' | 'accepted' | 'declined' | 'ignored';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed';

export interface VendorOffer {
  id: string;
  vendorName: string;
  vendorEmail?: string;
  price: number;
  message: string;
  status: VendorOfferStatus;
  paymentStatus: PaymentStatus;
  stripeSessionId?: string | null;
  stripePaymentIntent?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

export interface ServiceRequest {
  id: string;
  createdAt: string;
  status: ServiceRequestStatus;
  offerResponseHours: number;
  expiresAt: string;
  closedAt?: string | null;
  closedReason?: string | null;
  customerName: string;
  customerEmail: string;
  selectedServices: string[];
  budget: number;
  eventDate?: string | null;
  address?: string | null;
  notes?: string;
  offers: VendorOffer[];
}

export interface VendorOfferWithRequest extends VendorOffer {
  request: ServiceRequest;
}

export interface VendorApplication {
  id: string;
  status: 'pending_review' | 'approved' | 'rejected';
  businessName: string;
  contactName: string;
  email: string;
  city?: string | null;
  websiteUrl?: string | null;
  portfolioUrl?: string | null;
  businessIntro?: string | null;
  documentName?: string | null;
  documentKey?: string | null;
  documentUrl?: string | null;
  stripeAccountId?: string | null;
  googleSub?: string | null;
  createdAt: string;
}

export interface ServiceCatalogItem {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  basePrice: number;
  isActive: boolean;
}

export interface VendorPost {
  id: string;
  vendorApplicationId: string;
  title: string;
  serviceName: string;
  description?: string | null;
  city?: string | null;
  basePrice?: number | null;
  availability?: Record<string, boolean>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

async function request(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutMs = 30000;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
      ...options,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`API Timeout (${timeoutMs / 1000}s). Backend antwortet nicht: ${API_BASE}`);
    }
    throw new Error(`API nicht erreichbar (${API_BASE}). Bitte starte den Backend-Server mit "npm run dev:api".`);
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

function withAdminToken(adminToken: string) {
  return { Authorization: `Bearer ${adminToken}` };
}

export function signupCustomer(payload: { name: string; email: string; password: string }) {
  return request('/api/auth/signup/customer', { method: 'POST', body: JSON.stringify(payload) });
}

export function signupVendor(payload: Record<string, unknown>) {
  return request('/api/auth/signup/vendor', { method: 'POST', body: JSON.stringify(payload) });
}

export function verifyVendorGoogleToken(idToken: string) {
  return request('/api/auth/google/vendor/verify', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  }) as Promise<{
    profile: {
      sub: string;
      email: string;
      name: string;
      picture?: string;
      emailVerified: boolean;
    };
  }>;
}

export function loginVendorWithGoogle(idToken: string) {
  return request('/api/auth/google/vendor/login', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
}

export function loginCustomerWithGoogle(idToken: string) {
  return request('/api/auth/google/customer/login', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  }) as Promise<{
    role: 'customer';
    user: { id: string; name: string; email: string };
  }>;
}

export function login(payload: { email: string; password: string }) {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}

export function createRequest(payload: {
  customerName: string;
  customerEmail: string;
  selectedServices: string[];
  budget: number;
  offerResponseHours?: number;
  eventDate?: string;
  address?: string;
  notes?: string;
}) {
  return request('/api/requests', { method: 'POST', body: JSON.stringify(payload) });
}

export function getOpenRequests() {
  return request('/api/requests/open') as Promise<{ requests: ServiceRequest[] }>;
}

export function getServiceCatalog() {
  return request('/api/services-catalog') as Promise<{ services: ServiceCatalogItem[] }>;
}

export function getCustomerRequests(customerEmail: string) {
  return request(`/api/requests?customerEmail=${encodeURIComponent(customerEmail)}`) as Promise<{ requests: ServiceRequest[] }>;
}

export function applyVendorOffer(
  requestId: string,
  payload: { vendorName: string; vendorEmail?: string; price: number; message?: string },
) {
  return request(`/api/requests/${requestId}/offers`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setOfferStatus(
  requestId: string,
  offerId: string,
  status: 'pending' | 'accepted' | 'declined' | 'ignored',
) {
  return request(`/api/requests/${requestId}/offers/${offerId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function getVendorOffers(vendorEmail: string) {
  return request(`/api/vendor/offers?vendorEmail=${encodeURIComponent(vendorEmail)}`) as Promise<{
    offers: VendorOfferWithRequest[];
  }>;
}

export function getVendorProfile(email: string) {
  return request(`/api/vendor/profile?email=${encodeURIComponent(email)}`) as Promise<{ vendor: VendorApplication }>;
}

export function getVendorPosts(vendorEmail: string) {
  return request(`/api/vendor/posts?vendorEmail=${encodeURIComponent(vendorEmail)}`) as Promise<{ posts: VendorPost[] }>;
}

export function createVendorPost(payload: {
  vendorEmail: string;
  title: string;
  serviceName: string;
  description?: string;
  city?: string;
  basePrice?: number;
  availability?: Record<string, boolean>;
  isActive?: boolean;
}) {
  return request('/api/vendor/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ post: VendorPost }>;
}

export function updateVendorPost(
  postId: string,
  payload: Partial<{
    title: string;
    serviceName: string;
    description: string;
    city: string;
    basePrice: number;
    availability: Record<string, boolean>;
    isActive: boolean;
  }>,
) {
  return request(`/api/vendor/posts/${postId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }) as Promise<{ post: VendorPost }>;
}

export function sendVendorInquiry(payload: { vendorEmail: string; subject: string; message: string }) {
  return request('/api/vendor/inquiries', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getAdminOverview(adminKey: string) {
  return request('/api/admin/overview', {
    method: 'GET',
    headers: withAdminToken(adminKey),
  }) as Promise<{
    overview: {
      customers: number;
      vendorApplications: number;
      openRequests: number;
      closedRequests: number;
      expiredRequests: number;
      totalOffers: number;
    };
  }>;
}

export function getAdminVendorApplications(adminKey: string) {
  return request('/api/admin/vendor-applications', {
    method: 'GET',
    headers: withAdminToken(adminKey),
  }) as Promise<{ applications: VendorApplication[] }>;
}

export function updateVendorApplicationStatus(
  adminKey: string,
  applicationId: string,
  status: 'pending_review' | 'approved' | 'rejected',
) {
  return request(`/api/admin/vendor-applications/${applicationId}`, {
    method: 'PATCH',
    headers: withAdminToken(adminKey),
    body: JSON.stringify({ status }),
  }) as Promise<{ application: VendorApplication }>;
}

export function getAdminRequests(adminKey: string) {
  return request('/api/admin/requests', {
    method: 'GET',
    headers: withAdminToken(adminKey),
  }) as Promise<{ requests: ServiceRequest[] }>;
}

export function seedAdminServices(adminToken: string) {
  return request('/api/admin/services/seed', {
    method: 'POST',
    headers: withAdminToken(adminToken),
  });
}

export function seedAdminVendors(adminToken: string) {
  return request('/api/admin/vendors/seed-demo', {
    method: 'POST',
    headers: withAdminToken(adminToken),
  });
}

export function getAdminInquiries(adminToken: string) {
  return request('/api/admin/inquiries', {
    method: 'GET',
    headers: withAdminToken(adminToken),
  }) as Promise<{
    inquiries: Array<{
      id: string;
      vendorEmail: string;
      subject: string;
      message: string;
      status: string;
      createdAt: string;
    }>;
  }>;
}

export function adminLogin(payload: { email: string; password: string }) {
  return request('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{
    token: string;
    admin: { id: string; name: string; email: string; role: 'admin' };
  }>;
}

export function bootstrapAdmin(
  payload: { name: string; email: string; password: string },
  setupKey: string,
) {
  return request('/api/admin/bootstrap', {
    method: 'POST',
    headers: { 'x-admin-setup-key': setupKey },
    body: JSON.stringify(payload),
  });
}

export function createStripeCheckoutSession(payload: {
  requestId: string;
  offerId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return request('/api/payments/checkout-session', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ sessionId: string; url: string | null }>;
}

export function getVendorDocumentUploadUrl(payload: { filename: string; contentType?: string }) {
  return request('/api/uploads/vendor-document-url', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ uploadUrl: string; fileKey: string; publicUrl: string }>;
}
