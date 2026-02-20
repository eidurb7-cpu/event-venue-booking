import { ServiceRequest } from './api';

export type InvoiceStatus = 'Paid' | 'Pending' | 'Overdue';

export type InvoiceItem = {
  id: string;
  requestId: string;
  offerId: string;
  client: string;
  status: InvoiceStatus;
  date: string;
  amount: number;
  vendorName: string;
  services: string[];
  eventDate?: string | null;
  address?: string | null;
  notes?: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
};

export const DEFAULT_VAT_RATE = 0.19;

export function mapRequestsToInvoices(
  requests: ServiceRequest[],
  fallbackClientName: string,
  vatRate = DEFAULT_VAT_RATE,
): InvoiceItem[] {
  return requests.flatMap((request) =>
    request.offers
      .filter((offer) => offer.status === 'accepted' || offer.paymentStatus !== 'unpaid')
      .map((offer, index) => {
        const invoiceId = `INV-${request.id.slice(-6).toUpperCase()}-${String(index + 1).padStart(2, '0')}`;
        let status: InvoiceStatus = 'Pending';
        if (offer.paymentStatus === 'paid') status = 'Paid';
        else if (request.status === 'expired' || offer.paymentStatus === 'failed') status = 'Overdue';

        const subtotal = Number(offer.price || 0);
        const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
        const total = Math.round((subtotal + vatAmount) * 100) / 100;

        return {
          id: invoiceId,
          requestId: request.id,
          offerId: offer.id,
          client: fallbackClientName || request.customerName || 'Customer',
          status,
          date: new Date(request.expiresAt).toLocaleDateString(),
          amount: subtotal,
          vendorName: offer.vendorName,
          services: request.selectedServices,
          eventDate: request.eventDate,
          address: request.address || null,
          notes: request.notes,
          subtotal,
          vatRate,
          vatAmount,
          total,
        };
      }),
  );
}
