import { Link } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import { useEffect } from 'react';
import { useCart } from '../context/CartContext';

export default function CheckoutSuccess() {
  const { clearCart } = useCart();

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-xl">
        <div className="rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="size-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900">Payment successful</h1>
          <p className="mt-3 text-gray-600">
            Your booking payment has been received. We have sent your confirmation to your email.
          </p>
          <div className="mt-6">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
