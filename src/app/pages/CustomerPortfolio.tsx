import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ServiceRequest, cancelCustomerRequest, createStripeCheckoutSession, getCustomerProfile, getCustomerRequests, setOfferStatus, updateCustomerProfile } from '../utils/api';
import { getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';

const REQUEST_GUARD_MS = 12000;

export default function CustomerPortfolio() {
  const location = useLocation();
  const focusRequestId = new URLSearchParams(location.search).get('requestId') || '';
  const { language } = useLanguage();
  const isDe = language === 'de';
  const tx = {
    title: isDe ? 'Kundenkonto' : 'Customer Portfolio',
    subtitle: isDe ? 'Anfragen verwalten und Vendor-Angebote akzeptieren oder ignorieren.' : 'Manage requests and accept or ignore vendor offers.',
    signedInAs: isDe ? 'Eingeloggt als' : 'Signed in as',
    offerContact: isDe ? 'Kontakt fuer Angebote' : 'Offer contact',
    emailPlaceholder: isDe ? 'Deine E-Mail fuer den Portfolio-Zugriff' : 'Your email for portfolio access',
    load: isDe ? 'Portfolio laden' : 'Load portfolio',
    refresh: isDe ? 'Aktualisieren' : 'Refresh',
    profileTitle: isDe ? 'Kundendetails' : 'Customer details',
    profileSave: isDe ? 'Details speichern' : 'Save details',
    profileSaved: isDe ? 'Details gespeichert.' : 'Details saved.',
    fullName: isDe ? 'Vollstaendiger Name' : 'Full name',
    phone: isDe ? 'Telefon' : 'Phone',
    addressLine: isDe ? 'Adresse' : 'Address',
    invoices: isDe ? 'Rechnungen anzeigen' : 'View invoices',
    loading: isDe ? 'Lade Anfragen...' : 'Loading requests...',
    empty: isDe ? 'Keine Anfragen fuer diese E-Mail gefunden.' : 'No requests found for this email.',
    services: isDe ? 'Services' : 'Services',
    budget: isDe ? 'Budget' : 'Budget',
    contactEmail: isDe ? 'Kontakt E-Mail' : 'Contact email',
    contactPhone: isDe ? 'Kontakt Telefon' : 'Contact phone',
    eventDate: isDe ? 'Event-Datum' : 'Event date',
    address: isDe ? 'Adresse' : 'Address',
    details: isDe ? 'Details' : 'Details',
    deadline: isDe ? 'Frist bis' : 'Deadline',
    noOffers: isDe ? 'Noch keine Vendor-Angebote.' : 'No vendor offers yet.',
    paymentLocked: isDe ? 'Service-Zahlung ist gesperrt, bis ein Vendor dein Service-Request freigibt.' : 'Service payment is locked until a vendor approves your service request.',
    price: isDe ? 'Preis' : 'Price',
    payment: isDe ? 'Zahlung' : 'Payment',
    accept: isDe ? 'Akzeptieren' : 'Accept',
    ignore: isDe ? 'Ignorieren' : 'Ignore',
    decline: isDe ? 'Ablehnen' : 'Decline',
    cancelRequest: isDe ? 'Anfrage stornieren' : 'Cancel request',
    stripeNote: isDe ? 'Zahlung ueber Stripe. Vendor-Auszahlung erfolgt automatisch, wenn Vendor Stripe Connect verknuepft hat.' : 'Payment via Stripe. Vendor payout runs automatically when Stripe Connect is linked.',
    pay: isDe ? 'Mit Stripe bezahlen' : 'Pay with Stripe',
    paid: isDe ? 'Zahlung erfolgreich abgeschlossen.' : 'Payment completed successfully.',
  };
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [isCustomerSession, setIsCustomerSession] = useState(false);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveProfileLoading, setSaveProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    address: '',
  });

  async function withGuard<T>(promise: Promise<T>, message: string): Promise<T> {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(message)), REQUEST_GUARD_MS);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (typeof timeoutId === 'number') window.clearTimeout(timeoutId);
    }
  }

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) return;
    if (current.role !== 'customer') return;
    if (!current.user.email) return;
    setIsCustomerSession(true);
    setCustomerName(current.user.name || '');
    setCustomerEmail(current.user.email);
    setProfileForm((prev) => ({ ...prev, name: current.user.name || '' }));
    loadRequests(current.user.email);
    void loadProfile();
  }, []);

  const loadRequests = async (email: string) => {
    if (!email.trim()) {
      setRequests([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await withGuard(
        getCustomerRequests(email.trim()),
        'API response timeout while loading requests. Please try again.',
      );
      setRequests(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Anfragen.');
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    try {
      const data = await withGuard(
        getCustomerProfile(),
        'API response timeout while loading customer details. Please refresh.',
      );
      setProfileForm({
        name: data.profile.name || '',
        phone: data.profile.phone || '',
        address: data.profile.address || '',
      });
    } catch {
      // Keep default values if profile endpoint fails.
    }
  };

  const saveProfile = async () => {
    if (!profileForm.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaveProfileLoading(true);
    setError('');
    setProfileMessage('');
    try {
      const updated = await withGuard(
        updateCustomerProfile({
          name: profileForm.name.trim(),
          phone: profileForm.phone.trim(),
          address: profileForm.address.trim(),
        }),
        'API response timeout while saving details. Please try again.',
      );
      setProfileForm({
        name: updated.profile.name || '',
        phone: updated.profile.phone || '',
        address: updated.profile.address || '',
      });
      setProfileMessage(tx.profileSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer details.');
    } finally {
      setSaveProfileLoading(false);
    }
  };

  const decide = async (requestId: string, offerId: string, status: 'accepted' | 'declined' | 'ignored') => {
    setError('');
    try {
      await withGuard(
        setOfferStatus(requestId, offerId, status, { customerEmail }),
        'API response timeout while updating offer. Please retry.',
      );
      await loadRequests(customerEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren des Angebots.');
    }
  };

  const cancelRequestByCustomer = async (requestId: string) => {
    if (!customerEmail.trim()) return;
    setError('');
    try {
      await withGuard(
        cancelCustomerRequest(requestId, customerEmail.trim()),
        'API response timeout while cancelling request. Please retry.',
      );
      await loadRequests(customerEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel request.');
    }
  };

  const payOffer = async (requestId: string, offerId: string) => {
    if (!customerEmail.trim()) return;
    setError('');
    try {
      const data = await withGuard(
        createStripeCheckoutSession({
          requestId,
          offerId,
          customerEmail: customerEmail.trim(),
          successUrl: `${window.location.origin}/customer-portfolio?payment=success`,
          cancelUrl: `${window.location.origin}/customer-portfolio?payment=cancelled`,
        }),
        'API response timeout while starting payment. Please retry.',
      );
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Stripe Checkout URL konnte nicht erstellt werden.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Starten von Stripe Checkout.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">{tx.title}</h1>
          <p className="text-base text-gray-600 mb-5">{tx.subtitle}</p>
          {isCustomerSession && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {tx.signedInAs} {customerName || customerEmail} ({customerEmail})
            </div>
          )}
          {customerEmail && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {tx.offerContact}: <strong>{customerEmail}</strong>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 md:items-center">
            <input
              type="email"
              placeholder={tx.emailPlaceholder}
              value={customerEmail}
              onChange={(e) => {
                const value = e.target.value;
                setCustomerEmail(value);
                if (!value.trim()) setRequests([]);
              }}
              disabled={isCustomerSession}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base disabled:bg-gray-100 disabled:text-gray-500"
            />
            <button
              type="button"
              onClick={() => loadRequests(customerEmail)}
              disabled={loading || !customerEmail.trim()}
              className="rounded-lg bg-purple-600 text-white px-5 py-3 text-base font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {tx.load}
            </button>
            <button
              type="button"
              onClick={() => loadRequests(customerEmail)}
              disabled={loading || !customerEmail.trim()}
              className="rounded-lg border border-gray-300 bg-white text-gray-800 px-5 py-3 text-base font-semibold hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {tx.refresh}
            </button>
          </div>
          <div className="mt-4">
            <Link to="/invoices" className="text-sm text-purple-600 hover:text-purple-700">
              {tx.invoices}
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">{tx.profileTitle}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder={tx.fullName}
              value={profileForm.name}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
              className="rounded-lg border border-gray-300 px-4 py-3 text-base"
            />
            <input
              type="text"
              value={customerEmail}
              readOnly
              className="rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 text-base text-gray-600"
            />
            <input
              type="tel"
              placeholder={tx.phone}
              value={profileForm.phone}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
              className="rounded-lg border border-gray-300 px-4 py-3 text-base"
            />
            <input
              type="text"
              placeholder={tx.addressLine}
              value={profileForm.address}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, address: e.target.value }))}
              className="rounded-lg border border-gray-300 px-4 py-3 text-base"
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={saveProfile}
              disabled={saveProfileLoading}
              className="rounded-lg bg-purple-600 text-white px-5 py-3 text-base font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {saveProfileLoading ? 'Saving...' : tx.profileSave}
            </button>
            {profileMessage && <p className="text-sm text-green-700">{profileMessage}</p>}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-sm text-red-700 mb-5">
            {error}
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
            {tx.loading}
          </div>
        )}

        {!loading && customerEmail.trim() && requests.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
            {tx.empty}
          </div>
        )}

        <div className="space-y-5">
          {requests.map((request) => (
            <div
              key={request.id}
              className={`bg-white rounded-2xl border p-5 sm:p-7 shadow-sm ${
                focusRequestId && request.id === focusRequestId
                  ? 'border-purple-400 ring-2 ring-purple-100'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-900">{request.id}</h2>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    request.status === 'open'
                      ? 'bg-yellow-100 text-yellow-800'
                      : request.status === 'expired'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-800'
                  }`}
                >
                  {request.status}
                </span>
              </div>
              <p className="text-base text-gray-700 mt-3">
                {tx.services}: {request.selectedServices.join(', ')} | {tx.budget}: EUR {request.budget.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 mt-2">{tx.contactEmail}: {request.customerEmail}</p>
              {request.customerPhone && <p className="text-sm text-gray-600 mt-1">{tx.contactPhone}: {request.customerPhone}</p>}
              {request.eventDate && (
                <p className="text-sm text-gray-600 mt-1">{tx.eventDate}: {new Date(request.eventDate).toLocaleDateString()}</p>
              )}
              {request.address && <p className="text-sm text-gray-600 mt-1">{tx.address}: {request.address}</p>}
              {request.notes && <p className="text-sm text-gray-600 mt-1">{tx.details}: {request.notes}</p>}
              <p className="text-sm text-gray-600 mt-1">
                {tx.deadline}: {new Date(request.expiresAt).toLocaleString()}
              </p>
              {request.status === 'open' && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => cancelRequestByCustomer(request.id)}
                    className="rounded-lg bg-red-100 text-red-700 px-4 py-2 text-sm font-semibold hover:bg-red-200"
                  >
                    {tx.cancelRequest}
                  </button>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {request.offers.length === 0 && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    {tx.noOffers}
                    <p className="mt-1 text-xs text-amber-700">{tx.paymentLocked}</p>
                  </div>
                )}

                {request.offers.map((offer) => (
                  <div key={offer.id} className="rounded-xl border border-gray-200 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="font-medium text-gray-900">{offer.vendorName}</p>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          offer.status === 'pending'
                            ? 'bg-blue-100 text-blue-700'
                            : offer.status === 'accepted'
                              ? 'bg-green-100 text-green-700'
                              : offer.status === 'declined'
                                ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {offer.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{tx.price}: EUR {offer.price.toLocaleString()}</p>
                    {offer.message && <p className="text-sm text-gray-600 mt-1">{offer.message}</p>}
                    <p className="text-sm text-gray-600 mt-1">
                      {tx.payment}: {offer.paymentStatus}
                      {offer.paidAt ? ` (${new Date(offer.paidAt).toLocaleString()})` : ''}
                    </p>

                    {offer.status === 'pending' && request.status === 'open' && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs text-amber-700">{tx.paymentLocked}</p>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <button
                          type="button"
                          onClick={() => decide(request.id, offer.id, 'accepted')}
                          className="rounded-lg bg-green-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-green-700 w-full sm:w-auto"
                        >
                          {tx.accept}
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(request.id, offer.id, 'ignored')}
                          className="rounded-lg bg-gray-200 text-gray-800 px-4 py-2.5 text-sm font-semibold hover:bg-gray-300 w-full sm:w-auto"
                        >
                          {tx.ignore}
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(request.id, offer.id, 'declined')}
                          className="rounded-lg bg-red-100 text-red-700 px-4 py-2.5 text-sm font-semibold hover:bg-red-200 w-full sm:w-auto"
                        >
                          {tx.decline}
                        </button>
                        </div>
                      </div>
                    )}

                    {offer.status === 'accepted' && offer.paymentStatus !== 'paid' && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-500 mb-2">
                          {tx.stripeNote}
                        </p>
                        <button
                          type="button"
                          onClick={() => payOffer(request.id, offer.id)}
                          className="rounded-lg bg-purple-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-purple-700"
                        >
                          {tx.pay}
                        </button>
                      </div>
                    )}

                    {offer.status === 'accepted' && offer.paymentStatus === 'paid' && (
                      <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                        {tx.paid}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
