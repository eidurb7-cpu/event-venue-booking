export default function PaymentsSecurity() {
  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Payments & Security</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900">How money and trust flow on EventVenue</h1>
          <p className="mt-3 text-slate-600">
            EventVenue uses Stripe Checkout and Stripe Connect to process payments and vendor payouts with clear records
            and traceable webhook updates.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Payment processing</h2>
          <ul className="mt-4 list-disc pl-5 text-slate-700 space-y-2">
            <li>Customers pay through hosted Stripe Checkout pages.</li>
            <li>Booking status is updated by Stripe webhook events on the backend.</li>
            <li>Platform commission and vendor net amounts are stored per payout record.</li>
            <li>Duplicate webhook delivery is handled with idempotent event tracking.</li>
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Data protection</h2>
          <ul className="mt-4 list-disc pl-5 text-slate-700 space-y-2">
            <li>Sensitive card data is handled by Stripe, not stored in this application.</li>
            <li>API endpoints require authenticated roles for customer, vendor, and admin operations.</li>
            <li>Compliance and audit logs are persisted for critical admin and payment workflows.</li>
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-emerald-200 bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Transparency</h2>
          <p className="mt-3 text-slate-700">
            Customer invoices and vendor payout states are visible in dashboards so both sides can follow payment
            lifecycle from checkout to transfer.
          </p>
        </section>
      </div>
    </div>
  );
}
