import Constants from 'expo-constants';
import type {
  AdminVendorApplication,
  PublicVendorPost,
  ServiceRequest,
  VendorApplication,
  VendorPost,
} from './types';

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL
  || (Constants.expoConfig?.extra?.apiBaseUrl as string)
  || 'https://event-venue-booking.vercel.app';

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export async function vendorLogin(email: string, password: string) {
  return request<{
    token: string;
    role: 'vendor';
    user: { id: string; name: string; email: string; status?: string };
  }>('/api/auth/vendor/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function adminLogin(email: string, password: string) {
  return request<{
    token: string;
    admin: { id: string; name: string; email: string; role: 'admin' };
  }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getCustomerRequestsByEmail(email: string) {
  return request<{ requests: ServiceRequest[] }>(`/api/requests?customerEmail=${encodeURIComponent(email)}`);
}

export async function getVendorProfile(email: string) {
  return request<{ vendor: VendorApplication }>(`/api/vendor/profile?email=${encodeURIComponent(email)}`);
}

export async function getVendorCompliance(email: string, token: string) {
  return request<{ compliance: VendorApplication['compliance'] }>(
    `/api/vendor/compliance?vendorEmail=${encodeURIComponent(email)}`,
    { method: 'GET' },
    token,
  );
}

export async function getVendorPosts(email: string, token: string) {
  return request<{
    posts: VendorPost[];
  }>(`/api/vendor/posts?vendorEmail=${encodeURIComponent(email)}`, { method: 'GET' }, token);
}

export async function createVendorPost(
  token: string,
  payload: {
    vendorEmail: string;
    title: string;
    serviceName: string;
    city?: string;
    basePrice?: number;
    description?: string;
    availability?: Record<string, boolean>;
  },
) {
  return request<{ post: VendorPost }>(
    '/api/vendor/posts',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export async function getPublicVendorPosts() {
  return request<{ posts: PublicVendorPost[] }>('/api/vendor/posts/public');
}

export async function getAdminOverview(token: string) {
  return request<{
    overview: {
      customers: number;
      vendorApplications: number;
      openRequests: number;
      closedRequests: number;
      expiredRequests: number;
      totalOffers: number;
    };
  }>('/api/admin/overview', { method: 'GET' }, token);
}

export async function getAdminVendorApplications(token: string) {
  return request<{ applications: AdminVendorApplication[] }>(
    '/api/admin/vendor-applications',
    { method: 'GET' },
    token,
  );
}

export async function confirmVendorCompliance(
  token: string,
  applicationId: string,
  field: 'contract' | 'training',
) {
  return request<{ compliance: VendorApplication['compliance']; application?: VendorApplication }>(
    `/api/admin/vendor-applications/${encodeURIComponent(applicationId)}/compliance/${field}/confirm`,
    { method: 'POST' },
    token,
  );
}
