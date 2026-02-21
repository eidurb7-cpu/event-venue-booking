import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ServiceRequest, createStripeCheckoutSession, getCustomerRequests, setOfferStatus } from '../utils/api';
import { getCurrentUser } from '../utils/auth';

export default function CustomerPortfolio() {
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Customer Portfolio</h1>
          <p className="text-gray-600 mb-5">Anfragen verwalten und Vendor-Angebote akzeptieren oder ignorieren.</p>
          {isCustomerSession && (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              Eingeloggt als {customerName || customerEmail} ({customerEmail})
            </div>
          )}
          {customerEmail && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Kontakt fuer Angebote: <strong>{customerEmail}</strong>
            </div>
          )}
          <input
            type="email"
            placeholder="Deine E-Mail fuer den Portfolio-Zugriff"
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
            Portfolio laden
          </button>
          <div className="mt-3">
            <Link to="/invoices" className="text-sm text-purple-600 hover:text-purple-700">
              Rechnungen anzeigen
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
            Lade Anfragen...
          </div>
        )}

        {!loading && customerEmail.trim() && requests.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
            Keine Anfragen fuer diese E-Mail gefunden.
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
                Services: {request.selectedServices.join(', ')} | Budget: EUR {request.budget.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 mt-1">Kontakt E-Mail: {request.customerEmail}</p>
              {request.customerPhone && <p className="text-sm text-gray-600 mt-1">Kontakt Telefon: {request.customerPhone}</p>}
              {request.eventDate && (
                <p className="text-sm text-gray-600 mt-1">Event-Datum: {new Date(request.eventDate).toLocaleDateString()}</p>
              )}
              {request.address && <p className="text-sm text-gray-600 mt-1">Adresse: {request.address}</p>}
              {request.notes && <p className="text-sm text-gray-600 mt-1">Details: {request.notes}</p>}
              <p className="text-sm text-gray-600 mt-1">
                Frist bis: {new Date(request.expiresAt).toLocaleString()}
              </p>

              <div className="mt-4 space-y-3">
                {request.offers.length === 0 && (
                  <div className="text-sm text-gray-500">Noch keine Vendor-Angebote.</div>
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
                    <p className="text-sm text-gray-700 mt-1">Preis: EUR {offer.price.toLocaleString()}</p>
                    {offer.message && <p className="text-sm text-gray-600 mt-1">{offer.message}</p>}
                    <p className="text-sm text-gray-600 mt-1">
                      Zahlung: {offer.paymentStatus}
                      {offer.paidAt ? ` (${new Date(offer.paidAt).toLocaleString()})` : ''}
                    </p>

                    {offer.status === 'pending' && request.status === 'open' && (
                      <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <button
                          type="button"
                          onClick={() => decide(request.id, offer.id, 'accepted')}
                          className="rounded-lg bg-green-600 text-white px-3 py-2 text-sm hover:bg-green-700 w-full sm:w-auto"
                        >
                          Akzeptieren
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(request.id, offer.id, 'ignored')}
                          className="rounded-lg bg-gray-200 text-gray-800 px-3 py-2 text-sm hover:bg-gray-300 w-full sm:w-auto"
                        >
                          Ignorieren
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(request.id, offer.id, 'declined')}
                          className="rounded-lg bg-red-100 text-red-700 px-3 py-2 text-sm hover:bg-red-200 w-full sm:w-auto"
                        >
                          Ablehnen
                        </button>
                      </div>
                    )}

                    {offer.status === 'accepted' && offer.paymentStatus !== 'paid' && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-500 mb-2">
                          Zahlung ueber Stripe. Vendor-Auszahlung erfolgt automatisch, wenn Vendor Stripe Connect verknuepft hat.
                        </p>
                        <button
                          type="button"
                          onClick={() => payOffer(request.id, offer.id)}
                          className="rounded-lg bg-purple-600 text-white px-3 py-2 text-sm hover:bg-purple-700"
                        >
                          Mit Stripe bezahlen
                        </button>
                      </div>
                    )}

                    {offer.status === 'accepted' && offer.paymentStatus === 'paid' && (
                      <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                        Zahlung erfolgreich abgeschlossen.
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
