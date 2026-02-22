import { getUserToken } from './auth';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 90000);

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
  customerPhone?: string | null;
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

export interface CustomerProfileDetails {
  name: string;
  email: string;
  phone?: string;
  address?: string;
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
  reviewNote?: string | null;
  reviewedAt?: string | null;
  googleSub?: string | null;
  compliance?: VendorCompliance;
  payoutReadiness?: {
    ready: boolean;
    reason?: string | null;
    connectOnboardingStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
    payoutsEnabled: boolean;
    chargesEnabled: boolean;
  };
  createdAt: string;
}

export interface VendorCompliance {
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
  canBecomeActive: boolean;
  canPublish: boolean;
}

export interface VendorContractSignature {
  id: string;
  provider: string;
  externalEnvelopeId?: string | null;
  status: string;
  signingUrl?: string | null;
  contractVersion?: string | null;
  sentAt?: string | null;
  signedAt?: string | null;
  declinedAt?: string | null;
  voidedAt?: string | null;
  documentUrl?: string | null;
  auditTrailUrl?: string | null;
  lastEventAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
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

export interface PublicVendorPost {
  id: string;
  title: string;
  serviceName: string;
  description?: string | null;
  city?: string | null;
  basePrice?: number | null;
  availability?: Record<string, boolean>;
  createdAt: string;
  vendorName: string;
}

export interface StripeConnectStatus {
  connected: boolean;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  pendingRequirements: string[];
}

export interface MarketplaceBookingItem {
  id: string;
  bookingId: string;
  vendorId: string;
  serviceId: string;
  priceOffered: number;
  finalPrice?: number | null;
  status:
    | 'requested'
    | 'countered'
    | 'agreed'
    | 'pending'
    | 'accepted'
    | 'declined'
    | 'counter_offered'
    | 'expired'
    | 'cancelled';
  vendorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfferEvent {
  id: string;
  bookingId: string;
  bookingItemId: string;
  actorRole: 'customer' | 'vendor' | 'system' | 'admin';
  type:
    | 'request_created'
    | 'vendor_countered'
    | 'customer_countered'
    | 'vendor_accepted'
    | 'customer_accepted'
    | 'declined'
    | 'expired';
  offerVersion: number;
  priceCents?: number | null;
  reason?: string | null;
  breakdownJson?: Record<string, unknown> | null;
  createdAt: string;
}

export interface BookingThreadItem {
  id: string;
  serviceId: string;
  serviceTitle: string;
  vendorId: string;
  vendorName: string;
  status: string;
  isRequired: boolean;
  currentOfferVersion: number;
  latestOffer: {
    version: number;
    priceCents: number | null;
    reason?: string | null;
    breakdownJson?: Record<string, unknown> | null;
  } | null;
  finalPriceCents?: number | null;
  events: OfferEvent[];
  actions: {
    canCounter: boolean;
    canCustomerCounter?: boolean;
    canVendorCounter?: boolean;
    canAccept: boolean;
    canDecline: boolean;
  };
}

export interface BookingThread {
  booking: {
    id: string;
    status: string;
    eventDate: string;
    totalPrice: number;
    finalPrice?: number | null;
    invoice?: {
      id: string;
      bookingId: string;
      amount: number;
      status: 'draft' | 'issued' | 'paid' | 'failed' | 'refunded' | 'void';
      issuedAt?: string | null;
      paidAt?: string | null;
    } | null;
    agreement?: {
      agreementVersion?: string | null;
      agreementAcceptedByCustomerAt?: string | null;
      agreementAcceptedByCustomerIp?: string | null;
      agreementAcceptedByVendorAt?: string | null;
      required: boolean;
      customerAccepted: boolean;
      vendorAccepted: boolean;
    };
  };
  items: BookingThreadItem[];
}

export interface MarketplaceBooking {
  id: string;
  customerId: string;
  status: 'draft' | 'pending' | 'partially_accepted' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'completed';
  eventDate: string;
  totalPrice: number;
  finalPrice?: number | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: MarketplaceBookingItem[];
  invoice?: {
    id: string;
    bookingId: string;
    amount: number;
    status: 'draft' | 'issued' | 'paid' | 'failed' | 'refunded' | 'void';
    issuedAt?: string | null;
    paidAt?: string | null;
  } | null;
}

export function getMe() {
  return request('/api/me', { method: 'GET' }) as Promise<{
    user: { id: string; email: string; name: string; role: string };
    vendorStatus?: string;
    vendorApplicationId?: string | null;
  }>;
}

export function getCustomerProfile() {
  return request('/api/customer/profile', { method: 'GET' }) as Promise<{ profile: CustomerProfileDetails }>;
}

export function updateCustomerProfile(payload: { name: string; phone?: string; address?: string }) {
  return request('/api/customer/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }) as Promise<{ profile: CustomerProfileDetails }>;
}

async function request(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(API_TIMEOUT_MS) && API_TIMEOUT_MS > 0 ? API_TIMEOUT_MS : 90000;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  const userToken = getUserToken();
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
    ...(options.headers || {}),
  };
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: mergedHeaders,
      signal: controller.signal,
      ...options,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `API Timeout (${Math.round(timeoutMs / 1000)}s). Backend antwortet nicht: ${API_BASE}. ` +
        'Bei Render kann ein Cold Start 30-90s dauern. Bitte erneut versuchen.',
      );
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

export function applyVendor(payload: Record<string, unknown>) {
  return request('/api/vendor/apply', { method: 'POST', body: JSON.stringify(payload) });
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
  }) as Promise<{
    token: string;
    role: 'vendor';
    user: { id: string; name: string; email: string; status?: string };
  }>;
}

export function loginVendorWithPassword(payload: { email: string; password: string }) {
  return request('/api/auth/vendor/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{
    token: string;
    role: 'vendor';
    user: { id: string; name: string; email: string; status?: string };
  }>;
}

export function loginCustomerWithGoogle(idToken: string) {
  return request('/api/auth/google/customer/login', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  }) as Promise<{
    token: string;
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
  customerPhone?: string;
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

export function cancelCustomerRequest(requestId: string, customerEmail: string) {
  return request(`/api/requests/${encodeURIComponent(requestId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ customerEmail }),
  }) as Promise<{ request: ServiceRequest; cancelled: boolean }>;
}

export function getRequestResponses(requestId: string) {
  return request(`/api/requests/${requestId}/responses`) as Promise<{
    request: ServiceRequest;
    responses: Array<{
      id: string;
      vendorName: string;
      vendorEmail?: string | null;
      status: string;
      proposedPrice: number;
      message?: string | null;
      paymentStatus?: string;
      createdAt: string;
    }>;
  }>;
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

export function declineVendorRequest(
  requestId: string,
  payload: { vendorName?: string; message?: string } = {},
) {
  return request(`/api/vendor/requests/${encodeURIComponent(requestId)}/decline`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function respondToRequest(
  requestId: string,
  payload: { vendorName: string; vendorEmail?: string; price: number; message?: string },
) {
  return request(`/api/requests/${requestId}/respond`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setOfferStatus(
  requestId: string,
  offerId: string,
  status: 'pending' | 'accepted' | 'declined' | 'ignored',
  options?: { customerEmail?: string; adminToken?: string },
) {
  return request(`/api/requests/${requestId}/offers/${offerId}`, {
    method: 'PATCH',
    headers: options?.adminToken ? withAdminToken(options.adminToken) : undefined,
    body: JSON.stringify({ status, customerEmail: options?.customerEmail }),
  });
}

export function getVendorOffers(vendorEmail: string) {
  return request(`/api/vendor/offers?vendorEmail=${encodeURIComponent(vendorEmail)}`) as Promise<{
    offers: VendorOfferWithRequest[];
  }>;
}

export function updateVendorOffer(
  offerId: string,
  payload: { price: number; message?: string },
) {
  return request(`/api/vendor/offers/${encodeURIComponent(offerId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }) as Promise<{ offer: VendorOfferWithRequest }>;
}

export function getVendorProfile(email: string) {
  return request(`/api/vendor/profile?email=${encodeURIComponent(email)}`) as Promise<{ vendor: VendorApplication }>;
}

export function getVendorCompliance(vendorEmail: string) {
  return request(`/api/vendor/compliance?vendorEmail=${encodeURIComponent(vendorEmail)}`) as Promise<{
    compliance: VendorCompliance;
    signature?: VendorContractSignature | null;
  }>;
}

export function getVendorContractSigningStatus(vendorEmail: string) {
  return request(`/api/vendor/contract/signing-status?vendorEmail=${encodeURIComponent(vendorEmail)}`) as Promise<{
    provider: string;
    compliance: VendorCompliance;
    signature?: VendorContractSignature | null;
  }>;
}

export function startVendorContractSigning(payload: {
  vendorEmail: string;
  provider?: string;
  externalEnvelopeId?: string;
  signingUrl?: string;
  contractVersion?: string;
  status?: string;
}) {
  return request('/api/vendor/contract/signing/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{
    provider: string;
    compliance: VendorCompliance;
    signature: VendorContractSignature;
  }>;
}

export function acceptVendorContract(payload: { vendorEmail: string; contractVersion?: string }) {
  return request('/api/vendor/compliance/contract-accept', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ compliance: VendorCompliance }>;
}

export function acceptVendorContractSpec(payload: { vendorEmail: string; contractVersion?: string }) {
  return request('/api/vendor/contract/accept', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ compliance: VendorCompliance }>;
}

export function completeVendorTraining(payload: { vendorEmail: string }) {
  return request('/api/vendor/compliance/training-complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ compliance: VendorCompliance }>;
}

export function completeVendorTrainingSpec(payload: { vendorEmail: string }) {
  return request('/api/vendor/training/complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ compliance: VendorCompliance }>;
}

export function getVendorPosts(vendorEmail: string) {
  return request(`/api/vendor/posts?vendorEmail=${encodeURIComponent(vendorEmail)}`) as Promise<{ posts: VendorPost[] }>;
}

export function getPublicVendorPosts() {
  return request('/api/vendor/posts/public') as Promise<{ posts: PublicVendorPost[] }>;
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
    vendorEmail: string;
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

export function getAdminVendors(adminKey: string) {
  return request('/api/admin/vendors', {
    method: 'GET',
    headers: withAdminToken(adminKey),
  }) as Promise<{ vendors: VendorApplication[] }>;
}

export function adminApproveVendor(adminKey: string, applicationId: string) {
  return request(`/api/admin/vendors/${applicationId}/approve`, {
    method: 'POST',
    headers: withAdminToken(adminKey),
  }) as Promise<{ application: VendorApplication }>;
}

export function adminRejectVendor(adminKey: string, applicationId: string) {
  return request(`/api/admin/vendors/${applicationId}/reject`, {
    method: 'POST',
    headers: withAdminToken(adminKey),
  }) as Promise<{ application: VendorApplication }>;
}

export function adminSuspendVendor(adminKey: string, applicationId: string) {
  return request(`/api/admin/vendors/${applicationId}/suspend`, {
    method: 'POST',
    headers: withAdminToken(adminKey),
  }) as Promise<{ application: VendorApplication }>;
}

export interface AdminVendorComplianceRow {
  id: string;
  vendorId: string;
  vendorEmail: string;
  vendorName: string;
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
  updatedAt?: string | null;
  createdAt: string;
}

export interface AdminPayoutRow {
  id: string;
  bookingId: string;
  vendorId: string;
  vendorName?: string | null;
  vendorEmail?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  invoiceId?: string | null;
  invoiceStatus?: string | null;
  invoiceStripeSessionId?: string | null;
  invoicePaidAt?: string | null;
  bookingStatus?: string | null;
  grossAmount: number;
  platformFee: number;
  vendorNetAmount: number;
  stripeTransferId?: string | null;
  status: 'pending' | 'paid' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLogRow {
  id: string;
  adminId: string;
  action: string;
  targetId?: string | null;
  metaJson?: string | null;
  createdAt: string;
}

export function getAdminVendorCompliance(adminKey: string) {
  return request('/api/admin/vendor-compliance', {
    method: 'GET',
    headers: withAdminToken(adminKey),
  }) as Promise<{ compliances: AdminVendorComplianceRow[]; note?: string }>;
}

export function getAdminPayouts(adminKey: string) {
  return request('/api/admin/payouts', {
    method: 'GET',
    headers: withAdminToken(adminKey),
  }) as Promise<{ payouts: AdminPayoutRow[]; note?: string }>;
}

export function releaseAdminPayout(adminKey: string, payoutId: string) {
  return request(`/api/admin/payouts/${payoutId}/release`, {
    method: 'POST',
    headers: withAdminToken(adminKey),
  }) as Promise<{ released: boolean; reason?: string; payout?: AdminPayoutRow }>;
}

export function getAdminAuditLogs(adminKey: string) {
  return request('/api/admin/audit-logs', {
    method: 'GET',
    headers: withAdminToken(adminKey),
  }) as Promise<{ logs: AdminAuditLogRow[]; note?: string }>;
}

export function getAdminPayments(adminKey: string) {
  return request('/api/admin/payments', {
    method: 'GET',
    headers: withAdminToken(adminKey),
  }) as Promise<{
    summary: {
      invoices: Record<string, number>;
      payouts: Record<string, number>;
    };
    invoices: Array<{
      id: string;
      bookingId: string;
      amount: number;
      status: string;
      stripeSessionId?: string | null;
      issuedAt?: string | null;
      paidAt?: string | null;
      failedAt?: string | null;
      customerEmail?: string | null;
      customerName?: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    payouts: Array<AdminPayoutRow>;
  }>;
}

export function backfillAdminVendorCompliance(adminKey: string) {
  return request('/api/admin/vendor-compliance/backfill', {
    method: 'POST',
    headers: withAdminToken(adminKey),
  }) as Promise<{ migrated: number; total: number; note?: string }>;
}

export function updateVendorApplicationStatus(
  adminKey: string,
  applicationId: string,
  status: 'pending_review' | 'approved' | 'rejected',
  reviewNote?: string,
) {
  return request(`/api/admin/vendor-applications/${applicationId}`, {
    method: 'PATCH',
    headers: withAdminToken(adminKey),
    body: JSON.stringify({ status, reviewNote }),
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

export function replyAdminInquiry(
  adminToken: string,
  inquiryId: string,
  replyMessage: string,
  attachmentUrls: string[] = [],
) {
  return request(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}/reply`, {
    method: 'POST',
    headers: withAdminToken(adminToken),
    body: JSON.stringify({ replyMessage, attachmentUrls }),
  }) as Promise<{
    inquiry: {
      id: string;
      vendorEmail: string;
      subject: string;
      message: string;
      status: string;
      createdAt: string;
    };
    replied: boolean;
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

export function createStripeConnectOnboarding(payload: {
  vendorEmail: string;
  country?: string;
  businessType?: 'individual' | 'company';
}) {
  return request('/api/stripe/connect/onboard', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ accountId: string; onboardingUrl: string; expiresAt: number }>;
}

export function getStripeConnectStatus(vendorEmail: string) {
  return request(`/api/stripe/connect/status?vendorEmail=${encodeURIComponent(vendorEmail)}`) as Promise<StripeConnectStatus>;
}

export function getVendorDocumentUploadUrl(payload: { filename: string; contentType?: string }) {
  return request('/api/uploads/vendor-document-url', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ uploadUrl: string; fileKey: string; publicUrl: string }>;
}

export function createMarketplaceBookingRequest(payload: {
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  address?: string;
  eventDate: string;
  expiresHours?: number;
  items: Array<{
    serviceId: string;
    priceOffered?: number;
    vendorMessage?: string;
  }>;
}) {
  return request('/api/marketplace/bookings/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ booking: MarketplaceBooking }>;
}

export function createServiceBookingRequest(payload: {
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  address?: string;
  eventDate: string;
  expiresHours?: number;
  items: Array<{
    serviceId: string;
    priceOffered?: number;
    vendorMessage?: string;
  }>;
}) {
  return request('/api/bookings/service/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ booking: MarketplaceBooking }>;
}

export function createBookingItemCounterOffer(
  bookingId: string,
  itemId: string,
  payload: {
    priceCents: number;
    reason: string;
    breakdown?: {
      travelFeeCents?: number;
      extraHours?: number;
      equipmentFeeCents?: number;
      notes?: string;
    };
    customerEmail?: string;
    vendorEmail?: string;
  },
) {
  return request(`/api/bookings/${bookingId}/items/${itemId}/offer`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ booking: MarketplaceBooking }>;
}

export function acceptBookingItemOffer(
  bookingId: string,
  itemId: string,
  payload: { offerVersion: number; customerEmail?: string; vendorEmail?: string },
) {
  return request(`/api/bookings/${bookingId}/items/${itemId}/accept`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ booking: MarketplaceBooking }>;
}

export function declineBookingItemOffer(
  bookingId: string,
  itemId: string,
  payload: { reason?: string; customerEmail?: string; vendorEmail?: string },
) {
  return request(`/api/bookings/${bookingId}/items/${itemId}/decline`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ booking: MarketplaceBooking }>;
}

export function getBookingThread(
  bookingId: string,
  options?: { customerEmail?: string; vendorEmail?: string },
) {
  const params = new URLSearchParams();
  if (options?.customerEmail) params.set('customerEmail', options.customerEmail);
  if (options?.vendorEmail) params.set('vendorEmail', options.vendorEmail);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request(`/api/bookings/${bookingId}/thread${query}`) as Promise<BookingThread>;
}

export function createBookingCheckout(
  bookingId: string,
  payload: { customerEmail: string; successUrl: string; cancelUrl: string },
) {
  return request(`/api/bookings/${bookingId}/checkout`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ sessionId: string; url: string | null; invoiceId: string }>;
}

export function acceptBookingAgreement(
  bookingId: string,
  payload: { customerEmail: string; agreementVersion?: string },
) {
  return request(`/api/bookings/${bookingId}/agreement/accept`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{
    agreement: {
      agreementVersion?: string | null;
      agreementAcceptedByCustomerAt?: string | null;
      agreementAcceptedByCustomerIp?: string | null;
      agreementAcceptedByVendorAt?: string | null;
      required: boolean;
      customerAccepted: boolean;
      vendorAccepted: boolean;
    };
  }>;
}

export function acceptAgreementSpec(
  bookingId: string,
  payload: { customerEmail: string; agreementVersion?: string },
) {
  return request(`/api/agreements/${bookingId}/accept`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{
    agreement: {
      agreementVersion?: string | null;
      agreementAcceptedByCustomerAt?: string | null;
      agreementAcceptedByCustomerIp?: string | null;
      agreementAcceptedByVendorAt?: string | null;
      required: boolean;
      customerAccepted: boolean;
      vendorAccepted: boolean;
    };
  }>;
}

export function vendorDecideMarketplaceBooking(
  bookingId: string,
  payload: {
    vendorEmail: string;
    decisions: Array<{
      bookingItemId: string;
      status: 'accepted' | 'declined' | 'counter_offered';
      counterPrice?: number;
      finalPrice?: number;
      vendorMessage?: string;
    }>;
  },
) {
  return request(`/api/marketplace/bookings/${bookingId}/vendor-decision`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<{ booking: MarketplaceBooking }>;
}

export function expireMarketplaceBookings() {
  return request('/api/marketplace/bookings/expire', {
    method: 'POST',
  }) as Promise<{ expired: number }>;
}

export function createMarketplaceReview(payload: {
  bookingId: string;
  serviceId: string;
  customerEmail: string;
  rating: number;
  comment?: string;
}) {
  return request('/api/marketplace/reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
