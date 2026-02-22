import { Link, useNavigate } from 'react-router';
import { ArrowRight, ShoppingCart, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { getCurrentUser } from '../utils/auth';
import { ServiceRequest, createRequest, getCustomerRequests } from '../utils/api';
import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const FRONTEND_BASE_URL = import.meta.env.VITE_FRONTEND_BASE_URL || window.location.origin;
const SERVICE_REQUEST_STATUS_STORAGE_KEY = 'event_marketplace_service_request_status_v1';

type SentServiceRequest = {
  id: string;
  title: string;
  category?: string;
  price: number;
  sentAt: string;
  requestId?: string;
  status: 'request_sent';
};

export default function Cart() {
  const navigate = useNavigate();
  const { cart, total, removeService, clearCart, clearVenue } = useCart();
  const [requestSending, setRequestSending] = useState(false);
  const [savingLater, setSavingLater] = useState(false);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [payNowLoading, setPayNowLoading] = useState(false);
  const [uiError, setUiError] = useState('');
  const [uiInfo, setUiInfo] = useState('');
  const [bookingForm, setBookingForm] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [sentServiceRequests, setSentServiceRequests] = useState<SentServiceRequest[]>([]);
  const [customerRequests, setCustomerRequests] = useState<ServiceRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const currentUser = getCurrentUser();
  const isBookingBlockedForRole = currentUser?.role === 'vendor' || currentUser?.role === 'admin';
  const servicesTotal = cart.services.reduce((sum, service) => sum + service.price, 0);
  const venueTotal = cart.venue?.price ?? 0;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SERVICE_REQUEST_STATUS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const rows = parsed
        .filter((item) => item && typeof item.id === 'string')
        .map((item) => ({
          id: String(item.id),
          title: String(item.title || ''),
          category: item.category ? String(item.category) : undefined,
          price: Number(item.price || 0),
          sentAt: String(item.sentAt || new Date().toISOString()),
          requestId: item.requestId ? String(item.requestId) : undefined,
          status: 'request_sent' as const,
        }));
      setSentServiceRequests(rows);
    } catch {
      // Ignore invalid payload.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SERVICE_REQUEST_STATUS_STORAGE_KEY, JSON.stringify(sentServiceRequests));
    } catch {
      // Ignore storage errors.
    }
  }, [sentServiceRequests]);

  useEffect(() => {
    if (currentUser?.role === 'customer') {
      setBookingForm((prev) => ({
        ...prev,
        name: prev.name || currentUser.user.name || '',
        email: prev.email || currentUser.user.email || '',
      }));
      if (currentUser.user.email) {
        void loadCustomerRequests(currentUser.user.email);
      }
    }
  }, [currentUser]);

  async function loadCustomerRequests(email: string) {
    if (!email.trim()) return;
    setRequestsLoading(true);
    try {
      const data = await getCustomerRequests(email.trim());
      setCustomerRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch {
      // Keep previous request snapshot to avoid status flicker.
    } finally {
      setRequestsLoading(false);
    }
  }

  function getServiceRequestStatusLabel(service: SentServiceRequest): string {
    if (requestsLoading) return 'Request sent - pending vendor approval';
    const request = service.requestId
      ? customerRequests.find((item) => item.id === service.requestId)
      : null;

    if (!request) return 'Request sent - pending vendor approval';
    if (request.status === 'expired') return 'Expired - no payment possible';
    if (request.status === 'closed') {
      const paidOffer = request.offers.find((offer) => offer.paymentStatus === 'paid');
      if (paidOffer) return 'Paid';
      return 'Closed';
    }
    if (!Array.isArray(request.offers) || request.offers.length === 0) return 'Pending vendor response';
    const paidOffer = request.offers.find((offer) => offer.paymentStatus === 'paid');
    if (paidOffer) return 'Paid';
    const acceptedOffer = request.offers.find((offer) => offer.status === 'accepted');
    if (acceptedOffer) return 'Approved - pay in Customer Portfolio';
    return 'Offer received - review in Customer Portfolio';
  }

  async function checkout() {
    setUiError('');
    setUiInfo('');
    if (isBookingBlockedForRole) {
      setUiError('Please use a customer account for checkout.');
      return;
    }
    if (!cart.venue) {
      setUiError('Please select a venue before checkout.');
      return;
    }
    if (!import.meta.env.VITE_API_BASE_URL && !API_BASE) {
      setUiError('API URL is not configured.');
      return;
    }

    setPayNowLoading(true);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart: {
            venue: cart.venue,
            services: [],
            currency: cart.currency,
          },
          customer: bookingForm,
          successUrl: `${FRONTEND_BASE_URL}/checkout/success`,
          cancelUrl: `${FRONTEND_BASE_URL}/cart`,
        }),
      });
    } catch {
      setUiError('Network error while starting checkout. Please check API/Stripe config.');
      setPayNowLoading(false);
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setUiError(`Checkout error: ${body?.error || res.statusText}`);
      setPayNowLoading(false);
      return;
    }

    const data = (await res.json()) as { url?: string | null };
    if (!data?.url) {
      setUiError('Checkout URL missing. Please try again.');
      setPayNowLoading(false);
      return;
    }
    window.location.href = data.url;
  }

  async function submitCompleteBookingForm(e: React.FormEvent) {
    e.preventDefault();
    setUiError('');
    if (!bookingForm.name.trim() || !bookingForm.email.trim()) {
      setUiError('Please enter name and email.');
      return;
    }
    await checkout();
  }

  async function sendRequestToVendors() {
    setUiError('');
    setUiInfo('');
    if (!currentUser || currentUser.role !== 'customer' || !currentUser.user.email) {
      setUiError('Please login with a customer account first.');
      navigate('/login');
      return;
    }
    if (cart.services.length === 0) {
      setUiError('Please add at least one service before sending a request.');
      return;
    }
    if (!bookingForm.name.trim() || !bookingForm.email.trim()) {
      setUiError('Please enter client name and email first.');
      return;
    }

    const selectedServices = Array.from(
      new Set(
        cart.services
          .map((service) => String(service.category || '').trim())
          .filter((category) => category.length > 0),
      ),
    );
    const requestServices = selectedServices.length > 0 ? selectedServices : ['other'];

    const lines = cart.services.map((service) => `- ${service.title} (EUR ${service.price})`);
    const notes = [
      `Client: ${bookingForm.name.trim()}`,
      `Client email: ${bookingForm.email.trim()}`,
      bookingForm.phone.trim() ? `Client phone: ${bookingForm.phone.trim()}` : '',
      cart.venue ? `Venue selected: ${cart.venue.title} (EUR ${cart.venue.price})` : 'Venue selected: no',
      lines.length > 0 ? 'Selected services:' : 'No services selected.',
      ...lines,
      `Services subtotal: EUR ${servicesTotal}`,
      bookingForm.notes.trim() ? `Client note: ${bookingForm.notes.trim()}` : '',
    ].join('\n');

    setRequestSending(true);
    try {
      const response = await createRequest({
        customerName: bookingForm.name.trim(),
        customerEmail: currentUser.user.email,
        customerPhone: bookingForm.phone.trim() || undefined,
        selectedServices: requestServices,
        budget: Math.max(1, servicesTotal),
        notes,
      }) as { request?: { id?: string } };
      const requestId = response?.request?.id ? String(response.request.id) : undefined;
      const now = new Date().toISOString();
      const newlySent: SentServiceRequest[] = cart.services.map((service) => ({
        id: service.id,
        title: service.title,
        category: service.category,
        price: service.price,
        sentAt: now,
        requestId,
        status: 'request_sent',
      }));
      setSentServiceRequests((prev) => {
        const map = new Map(prev.map((item) => [item.id, item]));
        newlySent.forEach((item) => map.set(item.id, item));
        return Array.from(map.values()).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
      });
      cart.services.forEach((service) => removeService(service.id));
      await loadCustomerRequests(currentUser.user.email);
      setUiInfo('Service request sent. Vendors must approve before payment is available.');
    } catch (err) {
      setUiError(err instanceof Error ? err.message : 'Failed to send request to vendors.');
    } finally {
      setRequestSending(false);
    }
  }

  function saveForLater() {
    setUiError('');
    setUiInfo('');
    setSavingLater(true);
    setTimeout(() => {
      setSavingLater(false);
      setUiInfo('Saved. You can continue later from Cart.');
    }, 200);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <ShoppingCart className="size-7 text-purple-700" />
          <h1 className="text-3xl font-bold text-gray-900">Your Cart</h1>
        </div>
        {uiError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {uiError}
          </div>
        )}
        {uiInfo && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {uiInfo}
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Venue</h2>
          {cart.venue ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">{cart.venue.title}</p>
                <p className="text-sm text-gray-600">{cart.venue.location || '-'}</p>
                <p className="text-sm font-medium text-purple-700 mt-1">EUR {cart.venue.price.toLocaleString()}</p>
              </div>
              <button
                type="button"
                onClick={clearVenue}
                className="inline-flex items-center gap-1 rounded border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="size-4" />
                Remove
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              No venue selected. <Link to="/venues" className="text-purple-700 hover:underline">Browse venues</Link>.
            </p>
          )}
        </section>

        <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Services</h2>
            <p className="text-sm text-gray-600 mt-1">
              Services are request-based. Payment is enabled only after vendor approval and agreement acceptance.
            </p>
          </div>
          {cart.services.length === 0 ? (
            <p className="text-sm text-gray-600">
              No services selected. <Link to="/services" className="text-purple-700 hover:underline">Browse services</Link>.
            </p>
          ) : (
            <div className="space-y-2">
              {cart.services.map((service) => (
                <div
                  key={service.id}
                  className="rounded-lg border border-gray-200 p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">{service.title}</p>
                    <p className="text-sm text-gray-600">{service.category || 'service'}</p>
                    <p className="text-sm font-medium text-purple-700">EUR {service.price.toLocaleString()}</p>
                    <span className="mt-1 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      Not sent
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeService(service.id)}
                    className="inline-flex items-center gap-1 rounded border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {sentServiceRequests.length > 0 && (
            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="text-sm font-semibold text-blue-900">Recently sent service requests</p>
              <div className="mt-2 space-y-2">
                {sentServiceRequests.map((service) => (
                  <div key={service.id} className="rounded border border-blue-100 bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{service.title}</p>
                      <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                        {getServiceRequestStatusLabel(service)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      EUR {service.price.toLocaleString()} - sent {new Date(service.sentAt).toLocaleString()}
                    </p>
                    <div className="mt-2">
                      <Link
                        to={service.requestId ? `/customer-portfolio?requestId=${encodeURIComponent(service.requestId)}` : '/customer-portfolio'}
                        className="text-xs font-medium text-purple-700 hover:text-purple-900"
                      >
                        Open in Customer Portfolio
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="mt-6 rounded-xl border border-purple-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold text-gray-900">Total</p>
            <p className="text-2xl font-bold text-purple-700">EUR {total.toLocaleString()}</p>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-gray-600">
            <p>Venue payable now: EUR {venueTotal.toLocaleString()}</p>
            <p>Service requests subtotal: EUR {servicesTotal.toLocaleString()} (not payable yet)</p>
          </div>
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-semibold text-gray-900">Client details</p>
            <p className="mt-1 text-xs text-gray-600">Used for service request + venue checkout.</p>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Full name"
                value={bookingForm.name}
                onChange={(e) => setBookingForm((p) => ({ ...p, name: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
              />
              <input
                type="email"
                required
                placeholder="Email"
                value={bookingForm.email}
                onChange={(e) => setBookingForm((p) => ({ ...p, email: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={bookingForm.phone}
                onChange={(e) => setBookingForm((p) => ({ ...p, phone: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
              />
              <input
                type="text"
                placeholder="Short note (optional)"
                value={bookingForm.notes}
                onChange={(e) => setBookingForm((p) => ({ ...p, notes: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={clearCart}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear cart
            </button>
            <button
              type="button"
              onClick={() => navigate('/venues')}
              className="rounded-lg border border-purple-300 px-4 py-2.5 text-sm font-medium text-purple-700 hover:bg-purple-50"
            >
              Continue shopping
            </button>
            <button
              type="button"
              onClick={saveForLater}
              disabled={!cart.venue || savingLater}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-purple-300 px-4 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300"
            >
              {savingLater ? 'Saving...' : 'Save for later'}
            </button>
            <button
              type="button"
              onClick={sendRequestToVendors}
              disabled={servicesTotal <= 0 || requestSending || isBookingBlockedForRole}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-purple-300 px-4 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300"
            >
              {requestSending ? 'Sending request...' : isBookingBlockedForRole ? 'Customers only' : 'Send service request'}
            </button>
            <button
              type="button"
              onClick={() => setShowCheckoutForm((prev) => !prev)}
              disabled={!cart.venue || isBookingBlockedForRole}
              className="sm:ml-auto inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isBookingBlockedForRole ? 'Customers only' : 'Pay venue now'}
              <ArrowRight className="size-4" />
            </button>
          </div>
          {showCheckoutForm && (
            <form onSubmit={submitCompleteBookingForm} className="mt-4 rounded-lg border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">Venue checkout</p>
              <p className="text-sm text-gray-600">
                This pays the venue only. Service requests stay pending until vendors approve.
              </p>
                <button
                  type="submit"
                  disabled={!cart.venue || isBookingBlockedForRole || payNowLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {payNowLoading ? 'Starting checkout...' : 'Pay now'}
                </button>
              </form>
            )}
        </div>
      </div>
    </div>
  );
}
