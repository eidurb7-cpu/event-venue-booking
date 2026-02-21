import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ServiceRequest, createStripeCheckoutSession, getCustomerRequests, setOfferStatus } from '../utils/api';
import { getCurrentUser } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';

export default function CustomerPortfolio() {
  const { language } = useLanguage();
  const isDe = language === 'de';
  const tx = {
    title: isDe ? 'Kundenkonto' : 'Customer Portfolio',
    subtitle: isDe ? 'Anfragen verwalten und Vendor-Angebote akzeptieren oder ignorieren.' : 'Manage requests and accept or ignore vendor offers.',
    signedInAs: isDe ? 'Eingeloggt als' : 'Signed in as',
    offerContact: isDe ? 'Kontakt fuer Angebote' : 'Offer contact',
    emailPlaceholder: isDe ? 'Deine E-Mail fuer den Portfolio-Zugriff' : 'Your email for portfolio access',
    load: isDe ? 'Portfolio laden' : 'Load portfolio',
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
    price: isDe ? 'Preis' : 'Price',
    payment: isDe ? 'Zahlung' : 'Payment',
    accept: isDe ? 'Akzeptieren' : 'Accept',
    ignore: isDe ? 'Ignorieren' : 'Ignore',
    decline: isDe ? 'Ablehnen' : 'Decline',
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

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) return;
    if (current.role !== 'customer') return;
    if (!current.user.email) return;
    setIsCustomerSession(true);
    setCustomerName(current.user.name || '');
    setCustomerEmail(current.user.email);
    loadRequests(current.user.email);
  }, []);

  const loadRequests = async (email: string) => {
    if (!email.trim()) {
      setRequests([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getCustomerRequests(email.trim());
      setRequests(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Anfragen.');
    } finally {
      setLoading(false);
    }
  };

  const decide = async (requestId: string, offerId: string, status: 'accepted' | 'declined' | 'ignored') => {
    setError('');
    try {
      await setOfferStatus(requestId, offerId, status, { customerEmail });
      await loadRequests(customerEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren des Angebots.');
    }
  };

  const payOffer = async (requestId: string, offerId: string) => {
    if (!customerEmail.trim()) return;
    setError('');
    try {
      const data = await createStripeCheckoutSession({
        requestId,
        offerId,
        customerEmail: customerEmail.trim(),
        successUrl: `${window.location.origin}/customer-portfolio?payment=success`,
        cancelUrl: `${window.location.origin}/customer-portfolio?payment=cancelled`,
      });
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
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="bg-white rounded-xl shadow-md p-5 sm:p-8 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{tx.title}</h1>
          <p className="text-gray-600 mb-5">{tx.subtitle}</p>
          {isCustomerSession && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {tx.signedInAs} {customerName || customerEmail} ({customerEmail})
            </div>
          )}
          {customerEmail && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {tx.offerContact}: <strong>{customerEmail}</strong>
            </div>
          )}
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
            className="w-full md:w-[420px] rounded-lg border border-gray-300 px-3 py-2.5 disabled:bg-gray-100 disabled:text-gray-500"
          />
          <button
            type="button"
            onClick={() => loadRequests(customerEmail)}
            className="mt-3 w-full sm:w-auto rounded-lg bg-purple-600 text-white px-4 py-2.5 hover:bg-purple-700"
          >
            {tx.load}
          </button>
          <div className="mt-3">
            <Link to="/invoices" className="text-sm text-purple-600 hover:text-purple-700">
              {tx.invoices}
            </Link>
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
            <div key={request.id} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
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
              <p className="text-sm text-gray-700 mt-2">
                {tx.services}: {request.selectedServices.join(', ')} | {tx.budget}: EUR {request.budget.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 mt-1">{tx.contactEmail}: {request.customerEmail}</p>
              {request.customerPhone && <p className="text-sm text-gray-600 mt-1">{tx.contactPhone}: {request.customerPhone}</p>}
              {request.eventDate && (
                <p className="text-sm text-gray-600 mt-1">{tx.eventDate}: {new Date(request.eventDate).toLocaleDateString()}</p>
              )}
              {request.address && <p className="text-sm text-gray-600 mt-1">{tx.address}: {request.address}</p>}
              {request.notes && <p className="text-sm text-gray-600 mt-1">{tx.details}: {request.notes}</p>}
              <p className="text-sm text-gray-600 mt-1">
                {tx.deadline}: {new Date(request.expiresAt).toLocaleString()}
              </p>

              <div className="mt-4 space-y-3">
                {request.offers.length === 0 && (
                  <div className="text-sm text-gray-500">{tx.noOffers}</div>
                )}

                {request.offers.map((offer) => (
                  <div key={offer.id} className="rounded-lg border border-gray-200 p-3 sm:p-4">
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
                      <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <button
                          type="button"
                          onClick={() => decide(request.id, offer.id, 'accepted')}
                          className="rounded-lg bg-green-600 text-white px-3 py-2 text-sm hover:bg-green-700 w-full sm:w-auto"
                        >
                          {tx.accept}
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(request.id, offer.id, 'ignored')}
                          className="rounded-lg bg-gray-200 text-gray-800 px-3 py-2 text-sm hover:bg-gray-300 w-full sm:w-auto"
                        >
                          {tx.ignore}
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(request.id, offer.id, 'declined')}
                          className="rounded-lg bg-red-100 text-red-700 px-3 py-2 text-sm hover:bg-red-200 w-full sm:w-auto"
                        >
                          {tx.decline}
                        </button>
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
                          className="rounded-lg bg-purple-600 text-white px-3 py-2 text-sm hover:bg-purple-700"
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
