import { useLanguage } from '../context/LanguageContext';

export default function Impressum() {
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
            {language === 'de' ? 'Impressum' : 'Legal Notice'}
          </h1>
          <div className="space-y-3 text-sm text-slate-700 leading-6">
            <p>EventVenue Marketplace GmbH</p>
            <p>Beispielstrasse 10, 97070 Wuerzburg, Deutschland</p>
            <p>{language === 'de' ? 'E-Mail' : 'Email'}: legal@eventvenue.com</p>
            <p>{language === 'de' ? 'Vertreten durch die Geschaeftsfuehrung der EventVenue Marketplace GmbH.' : 'Represented by the management of EventVenue Marketplace GmbH.'}</p>
            <p>{language === 'de' ? 'Inhaltlich verantwortlich gemaess gesetzlicher Vorgaben.' : 'Content responsibility in accordance with applicable law.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
