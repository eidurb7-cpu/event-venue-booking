import { useLanguage } from '../context/LanguageContext';

export default function VendorTerms() {
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
            {language === 'de' ? 'Vendor-Bedingungen' : 'Vendor Terms'}
          </h1>
          <ul className="list-disc pl-6 space-y-3 text-sm text-slate-700 leading-6">
            <li>{language === 'de' ? 'Vendor-Profile werden vor Freischaltung geprueft.' : 'Vendor profiles are reviewed before approval.'}</li>
            <li>{language === 'de' ? 'Angebote und Gegenangebote muessen transparent und nachvollziehbar sein.' : 'Offers and counter-offers must remain transparent and auditable.'}</li>
            <li>{language === 'de' ? 'Stripe Connect ist fuer Auszahlungen erforderlich.' : 'Stripe Connect is required for payouts.'}</li>
            <li>{language === 'de' ? 'Preise duerfen nach finaler Annahme nicht mehr geaendert werden.' : 'Prices cannot be changed after final acceptance.'}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
