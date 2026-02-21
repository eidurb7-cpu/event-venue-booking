import { useLanguage } from '../context/LanguageContext';

export default function PrivacyPolicy() {
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
            {language === 'de' ? 'Datenschutzerklaerung' : 'Privacy Policy'}
          </h1>
          <div className="space-y-4 text-sm text-slate-700 leading-6">
            <p>
              {language === 'de'
                ? 'Wir verarbeiten personenbezogene Daten nur zur Bereitstellung der Plattform, zur Vertragsabwicklung und zur Sicherheit.'
                : 'We process personal data only to operate the platform, fulfill contracts, and ensure security.'}
            </p>
            <p>
              {language === 'de'
                ? 'Gespeicherte Daten koennen u. a. Kontoangaben, Buchungsdaten, Zahlungsreferenzen und Support-Kommunikation enthalten.'
                : 'Stored data may include account details, booking records, payment references, and support communication.'}
            </p>
            <p>
              {language === 'de'
                ? 'Zahlungen werden ueber Stripe abgewickelt. Es gelten zusaetzlich die Datenschutzbestimmungen von Stripe.'
                : 'Payments are processed via Stripe. Stripe privacy terms apply in addition to this policy.'}
            </p>
            <p>
              {language === 'de'
                ? 'Du kannst Auskunft, Berichtigung oder Loeschung deiner Daten per E-Mail an privacy@eventvenue.com anfragen.'
                : 'You can request access, correction, or deletion of your data via privacy@eventvenue.com.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
