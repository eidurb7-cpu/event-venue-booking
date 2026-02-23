import { Link, useNavigate } from 'react-router';
import { ArrowRight, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { getCurrentUser } from '../utils/auth';
import { ServiceRequest, cancelCustomerRequest, createRequest, getCustomerProfile, getCustomerRequests, updateCustomerProfile } from '../utils/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { services as mockServices } from '../data/mockData';

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export default function Cart() {
  const { language } = useLanguage();
  const isDe = language === 'de';
  const navigate = useNavigate();
  const { cart, total, updateServiceDate, removeService, clearCart, clearVenue } = useCart();
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
    address: '',
    city: '',
    postalCode: '',
    altContactName: '',
    altPhone: '',
    preferredContactMethod: 'email',
    eventTime: '',
    eventType: '',
    guestCount: '',
    disputeNotes: '',
    termsAccepted: false,
    notes: '',
  });
  const [sentServiceRequests, setSentServiceRequests] = useState<SentServiceRequest[]>([]);
  const [customerRequests, setCustomerRequests] = useState<ServiceRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [profileSyncStatus, setProfileSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const currentUser = useMemo(() => getCurrentUser(), []);
  const customerEmail = currentUser?.role === 'customer' ? (currentUser.user.email || '').trim() : '';
  const profileHydratedRef = useRef(false);
  const lastSavedProfileSnapshotRef = useRef('');
  const isBookingBlockedForRole = currentUser?.role === 'vendor' || currentUser?.role === 'admin';
  const servicesTotal = cart.services.reduce((sum, service) => sum + service.price, 0);
  const venueTotal = cart.venue?.price ?? 0;
  const isCheckoutReady =
    Boolean(bookingForm.name.trim())
    && isValidEmail(bookingForm.email)
    && Boolean(bookingForm.address.trim())
    && Boolean(bookingForm.city.trim())
    && Boolean(bookingForm.postalCode.trim())
    && Boolean(bookingForm.eventType.trim())
    && Number(bookingForm.guestCount) > 0
    && Boolean(bookingForm.termsAccepted);

  const showValidationMessage = (message: string) => {
    setUiError(message);
    toast.error(message);
  };
  const getMissingVenueMessage = () =>
    cart.services.length > 0
      ? (isDe ? 'Services warten auf Vendor-Freigabe.' : 'Services are awaiting vendor approval.')
      : (isDe ? 'Bitte waehle zuerst eine Location aus.' : 'Please select a venue before checkout.');

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
    if (!currentUser || currentUser.role !== 'customer') return;
    let active = true;
    const hydrateCustomerProfile = async () => {
      try {
        const profileData = await getCustomerProfile();
        if (!active) return;
        const profile = profileData.profile || { name: '', phone: '', address: '' };
        setBookingForm((prev) => ({
          ...prev,
          name: prev.name || profile.name || currentUser.user.name || '',
          email: prev.email || currentUser.user.email || '',
          phone: prev.phone || profile.phone || '',
          address: prev.address || profile.address || '',
        }));
        lastSavedProfileSnapshotRef.current = JSON.stringify({
          name: (profile.name || currentUser.user.name || '').trim(),
          phone: String(profile.phone || '').trim(),
          address: String(profile.address || '').trim(),
        });
      } catch {
        if (!active) return;
        setBookingForm((prev) => ({
          ...prev,
          name: prev.name || currentUser.user.name || '',
          email: prev.email || currentUser.user.email || '',
        }));
      } finally {
        if (!active) return;
        profileHydratedRef.current = true;
      }
    };

    void hydrateCustomerProfile();
    if (customerEmail) void loadCustomerRequests(customerEmail);
    return () => {
      active = false;
    };
  }, [customerEmail, currentUser]);

  useEffect(() => {
    if (!customerEmail || !profileHydratedRef.current) return;
    const payload = {
      name: bookingForm.name.trim(),
      phone: bookingForm.phone.trim(),
      address: bookingForm.address.trim(),
    };
    if (!payload.name) return;

    const snapshot = JSON.stringify(payload);
    if (snapshot === lastSavedProfileSnapshotRef.current) return;

    const timer = window.setTimeout(async () => {
      setProfileSyncStatus('saving');
      try {
        await updateCustomerProfile({
          name: payload.name,
          phone: payload.phone || undefined,
          address: payload.address || undefined,
        });
        lastSavedProfileSnapshotRef.current = snapshot;
        setProfileSyncStatus('saved');
        window.setTimeout(() => setProfileSyncStatus('idle'), 1200);
      } catch {
        // Autosave should be non-blocking; keep UI clean and retry on next change.
        setProfileSyncStatus('idle');
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [bookingForm.address, bookingForm.name, bookingForm.phone, customerEmail]);

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

  function getLinkedRequest(service: SentServiceRequest): ServiceRequest | null {
    if (!service.requestId) return null;
    return customerRequests.find((item) => item.id === service.requestId) || null;
  }

  function getServiceDateAvailability(service: (typeof cart.services)[number]) {
    const sourceService = mockServices.find((entry) => entry.id === service.serviceId);
    const provider = sourceService?.providers.find((entry) => entry.id === service.providerId);
    if (!provider || !service.serviceDate) return { known: false, available: true };
    return {
      known: true,
      available: !provider.bookedDates.includes(service.serviceDate),
    };
  }

  async function checkout() {
    setUiError('');
    setUiInfo('');
    if (isBookingBlockedForRole) {
      showValidationMessage('Please use a customer account for checkout.');
      return;
    }
    if (!cart.venue) {
      showValidationMessage(getMissingVenueMessage());
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
          customer: {
            ...bookingForm,
            name: bookingForm.name.trim(),
            email: bookingForm.email.trim(),
            phone: bookingForm.phone.trim(),
            address: bookingForm.address.trim(),
            city: bookingForm.city.trim(),
            postalCode: bookingForm.postalCode.trim(),
            altContactName: bookingForm.altContactName.trim(),
            altPhone: bookingForm.altPhone.trim(),
            eventType: bookingForm.eventType.trim(),
            guestCount: bookingForm.guestCount.trim(),
            disputeNotes: bookingForm.disputeNotes.trim(),
            notes: bookingForm.notes.trim(),
          },
          successUrl: `${FRONTEND_BASE_URL}/checkout/success`,
          cancelUrl: `${FRONTEND_BASE_URL}/cart`,
        }),
      });
    } catch (err) {
      const detail = err instanceof Error ? ` ${err.message}` : '';
      setUiError(`Network error while starting checkout (${API_BASE}).${detail}`);
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

  async function persistCustomerProfileNow() {
    if (!customerEmail) return;
    const payload = {
      name: bookingForm.name.trim(),
      phone: bookingForm.phone.trim(),
      address: bookingForm.address.trim(),
    };
    if (!payload.name) return;
    setProfileSyncStatus('saving');
    await updateCustomerProfile({
      name: payload.name,
      phone: payload.phone || undefined,
      address: payload.address || undefined,
    });
    lastSavedProfileSnapshotRef.current = JSON.stringify(payload);
    setProfileSyncStatus('saved');
  }

  async function submitCompleteBookingForm(e: React.FormEvent) {
    e.preventDefault();
    setUiError('');
    const raiseValidation = (message: string) => showValidationMessage(message);
    if (!cart.venue) {
      raiseValidation(getMissingVenueMessage());
      return;
    }
    if (!bookingForm.name.trim() || !bookingForm.email.trim()) {
      raiseValidation('Please enter name and email.');
      return;
    }
    if (!isValidEmail(bookingForm.email)) {
      raiseValidation('Please enter a valid email address.');
      return;
    }
    if (!bookingForm.address.trim()) {
      raiseValidation('Please enter billing address before checkout.');
      return;
    }
    if (!bookingForm.city.trim() || !bookingForm.postalCode.trim()) {
      raiseValidation('Please enter city and postal code before checkout.');
      return;
    }
    if (!bookingForm.eventType.trim()) {
      raiseValidation('Please select event type before checkout.');
      return;
    }
    if (!bookingForm.guestCount.trim() || Number(bookingForm.guestCount) <= 0) {
      raiseValidation('Please enter valid guest count before checkout.');
      return;
    }
    if (!bookingForm.termsAccepted) {
      raiseValidation('Please accept the terms before checkout.');
      return;
    }
    try {
      await persistCustomerProfileNow();
    } catch {
      raiseValidation('Could not save customer profile. Please try again.');
      return;
    }
    await checkout();
  }

  function toggleCheckoutForm() {
    if (isBookingBlockedForRole) {
      showValidationMessage('Please use a customer account for checkout.');
      return;
    }
    if (!cart.venue) {
      showValidationMessage(getMissingVenueMessage());
      return;
    }
    setShowCheckoutForm((prev) => !prev);
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
    const missingServiceDates = cart.services.filter((service) => !String(service.serviceDate || '').trim());
    if (missingServiceDates.length > 0) {
      setUiError('Choose a date for every service before sending request.');
      return;
    }
    const unavailableServices = cart.services.filter((service) => {
      const availability = getServiceDateAvailability(service);
      return availability.known && !availability.available;
    });
    if (unavailableServices.length > 0) {
      setUiError('One or more services are not available on selected dates. Adjust dates first.');
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

    const lines = cart.services.map((service) => `- ${service.title} (EUR ${service.price}) | Date: ${service.serviceDate || '-'}`);
    const notes = [
      `Client: ${bookingForm.name.trim()}`,
      `Client email: ${bookingForm.email.trim()}`,
      bookingForm.phone.trim() ? `Client phone: ${bookingForm.phone.trim()}` : '',
      bookingForm.address.trim() ? `Client address: ${bookingForm.address.trim()}` : '',
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
        address: bookingForm.address.trim() || undefined,
        selectedServices: requestServices,
        budget: Math.max(1, servicesTotal),
        eventDate: cart.services[0]?.serviceDate || undefined,
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

  async function cancelSentRequest(requestId: string) {
    if (!customerEmail.trim()) {
      setUiError('Please login with a customer account first.');
      return;
    }
    setUiError('');
    setUiInfo('');
    try {
      await cancelCustomerRequest(requestId, customerEmail.trim());
      await loadCustomerRequests(customerEmail.trim());
      setUiInfo('Request cancelled.');
      toast.success('Request cancelled.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel request.';
      setUiError(message);
      toast.error(message);
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-gray-600">No venue selected.</p>
              <button
                type="button"
                onClick={() => navigate('/venues')}
                className="inline-flex items-center justify-center rounded-lg border border-purple-300 bg-white px-4 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50"
              >
                Browse venues
              </button>
            </div>
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-gray-600">No services selected.</p>
              <button
                type="button"
                onClick={() => navigate('/services')}
                className="inline-flex items-center justify-center rounded-lg border border-purple-300 bg-white px-4 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50"
              >
                Browse services
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.services.map((service) => (
                <div
                  key={service.id}
                  className="rounded-lg border border-gray-200 p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{service.title}</p>
                    <p className="text-sm text-gray-600">{service.category || 'service'}</p>
                    <p className="text-sm font-medium text-purple-700">EUR {service.price.toLocaleString()}</p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md">
                      <input
                        type="date"
                        value={service.serviceDate || ''}
                        onChange={(e) => updateServiceDate(service.id, e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1.5 text-xs"
                      />
                      {(() => {
                        const availability = getServiceDateAvailability(service);
                        if (!service.serviceDate) return <p className="text-xs text-amber-700">Choose service date</p>;
                        if (!availability.known) return <p className="text-xs text-gray-600">Availability not mapped</p>;
                        return (
                          <p className={`text-xs ${availability.available ? 'text-green-700' : 'text-red-700'}`}>
                            {availability.available ? 'Available on selected date' : 'Booked on selected date'}
                          </p>
                        );
                      })()}
                    </div>
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
                      {(() => {
                        const request = getLinkedRequest(service);
                        if (!request || request.status !== 'open' || !service.requestId) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => cancelSentRequest(service.requestId as string)}
                            className="ml-3 text-xs font-medium text-red-600 hover:text-red-800"
                          >
                            Cancel request
                          </button>
                        );
                      })()}
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
            {profileSyncStatus !== 'idle' && (
              <p className={`mt-1 text-xs ${profileSyncStatus === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                {profileSyncStatus === 'saving' && 'Saving profile...'}
                {profileSyncStatus === 'saved' && 'Profile saved for future checkouts.'}
                {profileSyncStatus === 'error' && 'Could not auto-save profile. Please retry checkout.'}
              </p>
            )}
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Full name"
                value={bookingForm.name}
                onChange={(e) => setBookingForm((p) => ({ ...p, name: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
                autoComplete="name"
              />
              <input
                type="email"
                required
                placeholder="Email"
                value={bookingForm.email}
                onChange={(e) => setBookingForm((p) => ({ ...p, email: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
                autoComplete="email"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={bookingForm.phone}
                onChange={(e) => setBookingForm((p) => ({ ...p, phone: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
                autoComplete="tel"
              />
              <input
                type="text"
                required
                placeholder="Address"
                value={bookingForm.address}
                onChange={(e) => setBookingForm((p) => ({ ...p, address: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
                autoComplete="street-address"
              />
              <input
                type="text"
                required
                placeholder="City"
                value={bookingForm.city}
                onChange={(e) => setBookingForm((p) => ({ ...p, city: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
                autoComplete="address-level2"
              />
              <input
                type="text"
                required
                placeholder="Postal code"
                value={bookingForm.postalCode}
                onChange={(e) => setBookingForm((p) => ({ ...p, postalCode: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
                autoComplete="postal-code"
              />
              <input
                type="text"
                placeholder="Alternative contact person"
                value={bookingForm.altContactName}
                onChange={(e) => setBookingForm((p) => ({ ...p, altContactName: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
                autoComplete="name"
              />
              <input
                type="tel"
                placeholder="Alternative phone"
                value={bookingForm.altPhone}
                onChange={(e) => setBookingForm((p) => ({ ...p, altPhone: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
                autoComplete="tel"
              />
              <select
                value={bookingForm.preferredContactMethod}
                onChange={(e) => setBookingForm((p) => ({ ...p, preferredContactMethod: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
              >
                <option value="email">Preferred contact: Email</option>
                <option value="phone">Preferred contact: Phone</option>
                <option value="whatsapp">Preferred contact: WhatsApp</option>
              </select>
              <input
                type="time"
                placeholder="Event time"
                value={bookingForm.eventTime}
                onChange={(e) => setBookingForm((p) => ({ ...p, eventTime: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
              />
              <select
                required
                value={bookingForm.eventType}
                onChange={(e) => setBookingForm((p) => ({ ...p, eventType: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
              >
                <option value="">Event type</option>
                <option value="wedding">Wedding</option>
                <option value="birthday">Birthday</option>
                <option value="corporate">Corporate</option>
                <option value="private-party">Private party</option>
                <option value="other">Other</option>
              </select>
              <input
                type="number"
                min={1}
                required
                placeholder="Guest count"
                value={bookingForm.guestCount}
                onChange={(e) => setBookingForm((p) => ({ ...p, guestCount: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
              />
              <input
                type="text"
                placeholder="Short note (optional)"
                value={bookingForm.notes}
                onChange={(e) => setBookingForm((p) => ({ ...p, notes: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5"
              />
              <textarea
                placeholder="Additional dispute notes (optional)"
                value={bookingForm.disputeNotes}
                onChange={(e) => setBookingForm((p) => ({ ...p, disputeNotes: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2.5 md:col-span-2 min-h-24"
              />
            </div>
            <label className="mt-2 inline-flex items-start gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={bookingForm.termsAccepted}
                onChange={(e) => setBookingForm((p) => ({ ...p, termsAccepted: e.target.checked }))}
                className="mt-0.5"
              />
              <span>I confirm these details are accurate and can be used for payment dispute handling.</span>
            </label>
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
              onClick={toggleCheckoutForm}
              className="sm:ml-auto inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
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
                  disabled={payNowLoading || !isCheckoutReady}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {payNowLoading ? 'Starting checkout...' : 'Pay now'}
                </button>
                {!isCheckoutReady && (
                  <p className="text-xs text-amber-700">
                    Fill required fields only: name, email, address, city, postal code, event type, guest count, and terms.
                  </p>
                )}
              </form>
            )}
        </div>
      </div>
    </div>
  );
}
