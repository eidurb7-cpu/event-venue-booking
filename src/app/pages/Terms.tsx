import { useLanguage } from '../context/LanguageContext';

export default function Terms() {
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
            {language === 'de' ? 'Allgemeine Geschaeftsbedingungen' : 'Terms of Service'}
          </h1>
          <ul className="list-disc pl-6 space-y-3 text-sm text-slate-700 leading-6">
            <li>{language === 'de' ? 'EventVenue ist ein Vermittlungs-Marktplatz zwischen Kunden und Anbietern.' : 'EventVenue is a marketplace connecting customers and vendors.'}</li>
            <li>{language === 'de' ? 'Buchungen starten als Anfrage und werden erst nach Zustimmung verbindlich.' : 'Bookings start as requests and become binding only after acceptance.'}</li>
            <li>{language === 'de' ? 'Preis- und Leistungsdetails gelten gemaess final vereinbartem Angebot.' : 'Price and service details follow the final agreed offer.'}</li>
            <li>{language === 'de' ? 'Kontaktumgehung ausserhalb der Plattform ist nicht erlaubt.' : 'Off-platform contact circumvention is not allowed.'}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
