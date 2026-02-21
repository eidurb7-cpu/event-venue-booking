import { Link, useNavigate } from 'react-router';
import { ArrowRight, ShoppingCart, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { getCurrentUser } from '../utils/auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const FRONTEND_BASE_URL = import.meta.env.VITE_FRONTEND_BASE_URL || window.location.origin;

export default function Cart() {
  const navigate = useNavigate();
  const { cart, total, removeService, clearCart, clearVenue } = useCart();
  const currentUser = getCurrentUser();
  const isBookingBlockedForRole = currentUser?.role === 'vendor' || currentUser?.role === 'admin';

  async function checkout() {
    if (isBookingBlockedForRole) {
      alert('Please use a customer account for checkout.');
      return;
    }
    if (!cart.venue) {
      alert('Please select a venue before checkout.');
      return;
    }
    if (!import.meta.env.VITE_API_BASE_URL && !API_BASE) {
      alert('API URL is not configured.');
      return;
    }

    const res = await fetch(`${API_BASE}/api/stripe/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cart,
        successUrl: `${FRONTEND_BASE_URL}/checkout/success`,
        cancelUrl: `${FRONTEND_BASE_URL}/cart`,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(`Checkout error: ${body?.error || res.statusText}`);
      return;
    }

    const data = (await res.json()) as { url?: string | null };
    if (!data?.url) {
      alert('Checkout URL missing. Please try again.');
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <ShoppingCart className="size-7 text-purple-700" />
          <h1 className="text-3xl font-bold text-gray-900">Your Cart</h1>
        </div>

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
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Services</h2>
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
        </section>

        <div className="mt-6 rounded-xl border border-purple-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold text-gray-900">Total</p>
            <p className="text-2xl font-bold text-purple-700">EUR {total.toLocaleString()}</p>
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
              onClick={checkout}
              disabled={total <= 0 || !cart.venue || isBookingBlockedForRole}
              className="sm:ml-auto inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isBookingBlockedForRole ? 'Customers only' : 'Checkout'}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
