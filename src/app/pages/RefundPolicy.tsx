import { useLanguage } from '../context/LanguageContext';

export default function RefundPolicy() {
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
            {language === 'de' ? 'Storno- und Erstattungsrichtlinie' : 'Cancellation & Refund Policy'}
          </h1>
          <ul className="list-disc pl-6 space-y-3 text-sm text-slate-700 leading-6">
            <li>{language === 'de' ? 'Erstattungen folgen den Bedingungen der jeweiligen Buchung und des finalen Angebots.' : 'Refunds follow the terms of the specific booking and final accepted offer.'}</li>
            <li>{language === 'de' ? 'Bei Vendor-Ablehnung wird die Anfrage storniert und gehaltene Verfuegbarkeit freigegeben.' : 'If a vendor declines, the request is canceled and held availability is released.'}</li>
            <li>{language === 'de' ? 'Bei bereits gezahlten Buchungen erfolgt Rueckerstattung gemaess Stripe-Zahlungsstatus und Plattformrichtlinie.' : 'For paid bookings, refunds depend on Stripe payment state and platform policy.'}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
