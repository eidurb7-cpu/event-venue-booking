import { useLanguage } from '../context/LanguageContext';

export default function Contact() {
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
            {language === 'de' ? 'Kontakt' : 'Contact'}
          </h1>
          <div className="space-y-3 text-sm text-slate-700 leading-6">
            <p>{language === 'de' ? 'Allgemeine Anfragen:' : 'General inquiries:'} support@eventvenue.com</p>
            <p>{language === 'de' ? 'Datenschutz:' : 'Privacy:'} privacy@eventvenue.com</p>
            <p>{language === 'de' ? 'Rechtliches:' : 'Legal:'} legal@eventvenue.com</p>
            <p>{language === 'de' ? 'Antwortzeit: in der Regel innerhalb von 1-2 Werktagen.' : 'Typical response time: within 1-2 business days.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
