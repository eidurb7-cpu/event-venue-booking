import { useState } from 'react';
import {
  BookingThreadItem,
  acceptBookingItemOffer,
  createBookingItemCounterOffer,
  declineBookingItemOffer,
} from '../utils/api';

type Props = {
  bookingId: string;
  item: BookingThreadItem;
  actorRole: 'customer' | 'vendor';
  actorEmail: string;
  onUpdated: () => Promise<void>;
};

function formatEuroCents(value?: number | null) {
  return `EUR ${((Number(value || 0)) / 100).toFixed(2)}`;
}

export function OfferThread({ bookingId, item, actorRole, actorEmail, onUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [counterOpen, setCounterOpen] = useState(false);
  const [priceCents, setPriceCents] = useState(String(item.latestOffer?.priceCents || ''));
  const [reason, setReason] = useState('');
  const [travelFeeCents, setTravelFeeCents] = useState('');
  const [extraHours, setExtraHours] = useState('');
  const [equipmentFeeCents, setEquipmentFeeCents] = useState('');
  const [notes, setNotes] = useState('');

  async function handleCounter() {
    setLoading(true);
    setError('');
    try {
      await createBookingItemCounterOffer(bookingId, item.id, {
        priceCents: Number(priceCents),
        reason,
        breakdown: {
          travelFeeCents: travelFeeCents ? Number(travelFeeCents) : undefined,
          extraHours: extraHours ? Number(extraHours) : undefined,
          equipmentFeeCents: equipmentFeeCents ? Number(equipmentFeeCents) : undefined,
          notes: notes || undefined,
        },
        customerEmail: actorRole === 'customer' ? actorEmail : undefined,
        vendorEmail: actorRole === 'vendor' ? actorEmail : undefined,
      });
      setCounterOpen(false);
      setReason('');
      setNotes('');
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit counter-offer');
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    setLoading(true);
    setError('');
    try {
      await acceptBookingItemOffer(bookingId, item.id, {
        offerVersion: item.currentOfferVersion,
        customerEmail: actorRole === 'customer' ? actorEmail : undefined,
        vendorEmail: actorRole === 'vendor' ? actorEmail : undefined,
      });
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept offer');
    } finally {
      setLoading(false);
    }
  }

  async function handleDecline() {
    setLoading(true);
    setError('');
    try {
      await declineBookingItemOffer(bookingId, item.id, {
        reason: 'Declined by user',
        customerEmail: actorRole === 'customer' ? actorEmail : undefined,
        vendorEmail: actorRole === 'vendor' ? actorEmail : undefined,
      });
      await onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline offer');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-slate-900">{item.serviceTitle}</p>
          <p className="text-xs text-slate-500">Vendor: {item.vendorName}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{item.status}</span>
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
        <p><strong>Version:</strong> {item.latestOffer?.version ?? item.currentOfferVersion}</p>
        <p><strong>Latest price:</strong> {formatEuroCents(item.latestOffer?.priceCents)}</p>
        {item.latestOffer?.reason && <p><strong>Reason:</strong> {item.latestOffer.reason}</p>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!item.actions.canAccept || loading}
          onClick={handleAccept}
          className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Accept
        </button>
        <button
          type="button"
          disabled={!item.actions.canDecline || loading}
          onClick={handleDecline}
          className="rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Decline
        </button>
        <button
          type="button"
          disabled={!item.actions.canCounter || loading}
          onClick={() => setCounterOpen((v) => !v)}
          className="rounded-md border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50"
        >
          Counter-offer
        </button>
      </div>

      {counterOpen && (
        <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-indigo-100 p-3">
          <input
            value={priceCents}
            onChange={(e) => setPriceCents(e.target.value)}
            placeholder="Price in cents"
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          />
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (no contact info)"
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            rows={2}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={travelFeeCents}
              onChange={(e) => setTravelFeeCents(e.target.value)}
              placeholder="Travel fee cents"
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            />
            <input
              value={equipmentFeeCents}
              onChange={(e) => setEquipmentFeeCents(e.target.value)}
              placeholder="Equipment fee cents"
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            />
          </div>
          <input
            value={extraHours}
            onChange={(e) => setExtraHours(e.target.value)}
            placeholder="Extra hours"
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Breakdown notes"
            className="rounded-md border border-slate-300 px-2 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCounter}
            disabled={loading}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Submit counter-offer
          </button>
        </div>
      )}

      {error && <p className="mt-2 rounded-md bg-rose-50 px-2 py-2 text-xs text-rose-700">{error}</p>}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timeline</p>
        <div className="mt-2 space-y-2">
          {item.events.map((event) => (
            <div key={event.id} className="rounded-md border border-slate-200 px-2 py-2 text-xs text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span>{event.type}</span>
                <span>{new Date(event.createdAt).toLocaleString()}</span>
              </div>
              <div>v{event.offerVersion}</div>
              {typeof event.priceCents === 'number' && <div>Price: {formatEuroCents(event.priceCents)}</div>}
              {event.reason && <div>Reason: {event.reason}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
