export type ServiceRequestStatus = 'open' | 'closed';
export type VendorOfferStatus = 'pending' | 'accepted' | 'ignored';

export interface VendorOffer {
  id: string;
  vendorName: string;
  vendorEmail?: string;
  price: number;
  message: string;
  status: VendorOfferStatus;
  createdAt: string;
}

export interface ServiceRequest {
  id: string;
  createdAt: string;
  status: ServiceRequestStatus;
  customerName: string;
  customerEmail: string;
  selectedServices: string[];
  budget: number;
  eventDate?: string;
  notes?: string;
  offers: VendorOffer[];
}

const STORAGE_KEY = 'serviceRequests';

export function getServiceRequests(): ServiceRequest[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveServiceRequests(requests: ServiceRequest[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
}

export function createServiceRequest(input: Omit<ServiceRequest, 'id' | 'createdAt' | 'status' | 'offers'>) {
  const requests = getServiceRequests();
  const next: ServiceRequest = {
    id: `req_${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: 'open',
    offers: [],
    ...input,
  };
  requests.unshift(next);
  saveServiceRequests(requests);
  return next;
}

export function addVendorOffer(
  requestId: string,
  input: Omit<VendorOffer, 'id' | 'createdAt' | 'status'>,
) {
  const requests = getServiceRequests();
  const request = requests.find((r) => r.id === requestId);
  if (!request || request.status !== 'open') return null;

  const offer: VendorOffer = {
    id: `offer_${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...input,
  };

  request.offers.unshift(offer);
  saveServiceRequests(requests);
  return offer;
}

export function setVendorOfferStatus(
  requestId: string,
  offerId: string,
  status: VendorOfferStatus,
) {
  const requests = getServiceRequests();
  const request = requests.find((r) => r.id === requestId);
  if (!request) return false;

  const offer = request.offers.find((o) => o.id === offerId);
  if (!offer) return false;

  offer.status = status;

  if (status === 'accepted') {
    request.status = 'closed';
    request.offers.forEach((o) => {
      if (o.id !== offerId && o.status === 'pending') o.status = 'ignored';
    });
  }

  saveServiceRequests(requests);
  return true;
}

