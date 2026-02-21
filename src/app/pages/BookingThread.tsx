import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { acceptBookingAgreement, createBookingCheckout, getBookingThread, BookingThread as BookingThreadType } from '../utils/api';
import { getCurrentUser } from '../utils/auth';
import { OfferThread } from '../components/OfferThread';

function sumAgreedCents(thread: BookingThreadType | null) {
  if (!thread) return 0;
  return thread.items.reduce((sum, item) => sum + Number(item.finalPriceCents || 0), 0);
}

export default function BookingThreadPage() {
  const { bookingId = '' } = useParams();
  const [thread, setThread] = useState<BookingThreadType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [agreementSaving, setAgreementSaving] = useState(false);

  const current = getCurrentUser();
  const actorRole = current?.role === 'vendor' ? 'vendor' : 'customer';
  const actorEmail = current?.user?.email || '';

  const agreedTotalCents = useMemo(() => sumAgreedCents(thread), [thread]);
  const agreementAccepted = Boolean(thread?.booking.agreement?.customerAccepted);
  const canCheckout = thread?.booking.status === 'accepted' && actorRole === 'customer' && agreementAccepted;

  async function loadThread() {
    if (!bookingId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getBookingThread(bookingId, {
        customerEmail: actorRole === 'customer' ? actorEmail : undefined,
        vendorEmail: actorRole === 'vendor' ? actorEmail : undefined,
      });
      setThread(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load booking thread');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadThread();
  }, [bookingId, actorRole, actorEmail]);

  async function startCheckout() {
    if (!thread || !canCheckout || !actorEmail) return;
    setCheckoutLoading(true);
    setError('');
    try {
      const origin = window.location.origin;
      const result = await createBookingCheckout(thread.booking.id, {
        customerEmail: actorEmail,
        successUrl: `${origin}/customer-portfolio?payment=success`,
        cancelUrl: `${origin}/booking-thread/${encodeURIComponent(thread.booking.id)}?payment=cancelled`,
      });
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setError('Checkout session created, but no redirect URL returned.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function acceptAgreement() {
    if (!thread || actorRole !== 'customer' || !actorEmail || !agreementChecked) return;
    setAgreementSaving(true);
    setError('');
    try {
      await acceptBookingAgreement(thread.booking.id, {
        customerEmail: actorEmail,
        agreementVersion: 'v1.0',
      });
      await loadThread();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept agreement');
    } finally {
      setAgreementSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">Structured Negotiation</h1>
        <p className="mt-1 text-sm text-slate-600">Booking ID: {bookingId}</p>
        {thread && (
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-3">
            <p><strong>Status:</strong> {thread.booking.status}</p>
            <p><strong>Agreed Total:</strong> EUR {(agreedTotalCents / 100).toFixed(2)}</p>
            <p><strong>Invoice:</strong> {thread.booking.invoice?.status || 'none'}</p>
          </div>
        )}
        {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </div>

      <div className="mt-4 space-y-3">
        {loading && <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading thread...</div>}
        {!loading && thread?.items?.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No items in this booking.</div>
        )}
        {!loading && thread?.items?.map((item) => (
          <OfferThread
            key={item.id}
            bookingId={thread.booking.id}
            item={item}
            actorRole={actorRole}
            actorEmail={actorEmail}
            onUpdated={loadThread}
          />
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">Checkout is enabled only when booking status is ACCEPTED and service agreement is accepted.</p>
        {thread?.booking.status === 'accepted' && actorRole === 'customer' && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {!agreementAccepted ? (
              <>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={agreementChecked}
                    onChange={(e) => setAgreementChecked(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I agree to the Service Agreement, including final price, scope, cancellation policy, and payment terms.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={acceptAgreement}
                  disabled={!agreementChecked || agreementSaving}
                  className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  {agreementSaving ? 'Saving agreement...' : 'Accept service agreement'}
                </button>
              </>
            ) : (
              <p className="text-sm text-emerald-700">
                Service agreement accepted at {new Date(thread.booking.agreement?.agreementAcceptedByCustomerAt || '').toLocaleString()}.
              </p>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={startCheckout}
          disabled={!canCheckout || checkoutLoading}
          className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {checkoutLoading ? 'Starting checkout...' : 'Pay agreed amount'}
        </button>
      </div>
    </section>
  );
}
