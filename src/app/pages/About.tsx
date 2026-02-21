export default function About() {
  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-purple-700">About EventVenue</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900">Plan your event in one place.</h1>
          <p className="mt-3 text-slate-600">
            EventVenue is a marketplace where you can book venues and event services (DJ, catering, decoration, photography, and more) in one clean flow from selection to checkout.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Why we built this</h2>
          <p className="mt-3 text-slate-600">
            Planning an event usually means juggling multiple vendors, unclear pricing, and risky payment methods. EventVenue makes booking simpler, more transparent, and more secure.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">How it works</h2>
          <ol className="mt-4 list-decimal pl-5 text-slate-700 space-y-2">
            <li>Browse venues and compare options.</li>
            <li>Select services you need (DJ, catering, decor, photography).</li>
            <li>Review your booking summary.</li>
            <li>Save for later or pay securely.</li>
            <li>Receive confirmation and booking details.</li>
          </ol>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Why choose us</h2>
          <ul className="mt-4 list-disc pl-5 text-slate-700 space-y-2">
            <li>Curated vendors reviewed before they go live.</li>
            <li>Transparent pricing and clear service packages.</li>
            <li>Secure Stripe checkout with server-verified payment updates.</li>
            <li>One booking summary for venue + services.</li>
            <li>Built for weddings, birthdays, graduations, and corporate events.</li>
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-purple-200 bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Mission</h2>
          <p className="mt-3 text-slate-700">
            Our mission is to help customers book confidently and help vendors grow through a trusted, organized marketplace.
          </p>
        </section>
      </div>
    </div>
  );
}
