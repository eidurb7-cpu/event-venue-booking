import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import {
  acceptBookingAgreement,
  createBookingCheckout,
  createMarketplaceReview,
  getBookingThread,
  BookingThread as BookingThreadType,
} from '../utils/api';
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
  const [reviewDraftByItemId, setReviewDraftByItemId] = useState<Record<string, { rating: string; comment: string }>>({});
  const [reviewSavingByItemId, setReviewSavingByItemId] = useState<Record<string, boolean>>({});
  const [reviewMessageByItemId, setReviewMessageByItemId] = useState<Record<string, string>>({});

  const current = getCurrentUser();
  const actorRole = current?.role === 'vendor' ? 'vendor' : 'customer';
  const actorEmail = current?.user?.email || '';

  const agreedTotalCents = useMemo(() => sumAgreedCents(thread), [thread]);
  const agreementAccepted = Boolean(thread?.booking.agreement?.customerAccepted);
  const vendorAgreementAccepted = Boolean(thread?.booking.agreement?.vendorAccepted);
  const canCheckout = thread?.booking.status === 'accepted'
    && actorRole === 'customer'
    && agreementAccepted
    && vendorAgreementAccepted;

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

  async function submitReview(bookingItemId: string, serviceId: string) {
    if (!thread || actorRole !== 'customer' || !actorEmail) return;
    const draft = reviewDraftByItemId[bookingItemId] || { rating: '', comment: '' };
    const rating = Number(draft.rating || 0);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      setReviewMessageByItemId((prev) => ({ ...prev, [bookingItemId]: 'Please select a rating between 1 and 5.' }));
      return;
    }
    setReviewSavingByItemId((prev) => ({ ...prev, [bookingItemId]: true }));
    setReviewMessageByItemId((prev) => ({ ...prev, [bookingItemId]: '' }));
    try {
      await createMarketplaceReview({
        bookingId: thread.booking.id,
        serviceId,
        customerEmail: actorEmail,
        rating,
        comment: draft.comment?.trim() || undefined,
      });
      setReviewMessageByItemId((prev) => ({ ...prev, [bookingItemId]: 'Review saved.' }));
    } catch (err) {
      setReviewMessageByItemId((prev) => ({
        ...prev,
        [bookingItemId]: err instanceof Error ? err.message : 'Failed to save review.',
      }));
    } finally {
      setReviewSavingByItemId((prev) => ({ ...prev, [bookingItemId]: false }));
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
          <div key={item.id} className="space-y-3">
            <OfferThread
              bookingId={thread.booking.id}
              item={item}
              actorRole={actorRole}
              actorEmail={actorEmail}
              onUpdated={loadThread}
            />
            {actorRole === 'customer' && thread.booking.status === 'completed' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">Rate this service</p>
                <p className="text-xs text-amber-800">{item.serviceTitle}</p>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[160px_1fr_auto] md:items-center">
                  <select
                    value={reviewDraftByItemId[item.id]?.rating || ''}
                    onChange={(e) => setReviewDraftByItemId((prev) => ({
                      ...prev,
                      [item.id]: { rating: e.target.value, comment: prev[item.id]?.comment || '' },
                    }))}
                    className="rounded-md border border-amber-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select rating</option>
                    <option value="5">5 - Excellent</option>
                    <option value="4">4 - Good</option>
                    <option value="3">3 - Okay</option>
                    <option value="2">2 - Poor</option>
                    <option value="1">1 - Bad</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Optional comment"
                    value={reviewDraftByItemId[item.id]?.comment || ''}
                    onChange={(e) => setReviewDraftByItemId((prev) => ({
                      ...prev,
                      [item.id]: { rating: prev[item.id]?.rating || '', comment: e.target.value },
                    }))}
                    className="rounded-md border border-amber-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => submitReview(item.id, item.serviceId)}
                    disabled={Boolean(reviewSavingByItemId[item.id])}
                    className="rounded-md border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50"
                  >
                    {reviewSavingByItemId[item.id] ? 'Saving...' : 'Submit review'}
                  </button>
                </div>
                {reviewMessageByItemId[item.id] && (
                  <p className="mt-2 text-xs text-amber-900">{reviewMessageByItemId[item.id]}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">Checkout is enabled only when booking status is ACCEPTED and both parties accepted the service agreement.</p>
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
              <div className="space-y-1 text-sm">
                <p className="text-emerald-700">
                  Customer accepted at {new Date(thread.booking.agreement?.agreementAcceptedByCustomerAt || '').toLocaleString()}.
                </p>
                <p className={vendorAgreementAccepted ? 'text-emerald-700' : 'text-amber-700'}>
                  {vendorAgreementAccepted
                    ? `Vendor accepted at ${new Date(thread.booking.agreement?.agreementAcceptedByVendorAt || '').toLocaleString()}.`
                    : 'Waiting for vendor agreement acceptance before checkout.'}
                </p>
              </div>
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
