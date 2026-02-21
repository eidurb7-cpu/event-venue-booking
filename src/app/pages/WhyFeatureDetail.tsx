import { Link, useParams } from 'react-router';
import { ArrowLeft, Calendar, Shield, Sparkles } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

type FeatureContent = {
  title: string;
  subtitle: string;
  points: string[];
};

function getFeatureContent(topic: string | undefined, language: 'de' | 'en'): FeatureContent | null {
  const isDe = language === 'de';

  if (topic === 'curated-vendors') {
    return {
      title: isDe ? 'Gepruefte Vendor' : 'Curated Vendors',
      subtitle: isDe
        ? 'So stellen wir sicher, dass nur serioese und professionelle Anbieter auf der Plattform aktiv sind.'
        : 'How we ensure only trusted and professional vendors are active on the platform.',
      points: isDe
        ? [
            'Jede Bewerbung wird vom Admin-Team geprueft.',
            'Vendor koennen erst nach Freigabe Services veroeffentlichen.',
            'Verlauf, Status und Dokumente bleiben fuer Admin nachvollziehbar.',
          ]
        : [
            'Every application is reviewed by the admin team.',
            'Vendors can publish services only after approval.',
            'Status history and documents remain auditable for admin.',
          ],
    };
  }

  if (topic === 'secure-payments') {
    return {
      title: isDe ? 'Sichere Zahlungen' : 'Secure Payments',
      subtitle: isDe
        ? 'Zahlungen laufen ueber Stripe mit klarer Trennung zwischen Plattform und Vendor-Auszahlung.'
        : 'Payments run through Stripe with clear platform and vendor payout separation.',
      points: isDe
        ? [
            'Checkout wird erst nach finaler Einigung freigeschaltet.',
            'Stripe Webhook aktualisiert den Zahlungsstatus serverseitig.',
            'Stripe Connect ermoeglicht Vendor-Auszahlungen mit Plattform-Provision.',
          ]
        : [
            'Checkout is enabled only after final agreement.',
            'Stripe webhook updates payment status server-side.',
            'Stripe Connect enables vendor payouts with platform commission.',
          ],
    };
  }

  if (topic === 'structured-booking') {
    return {
      title: isDe ? 'Strukturierte Buchung' : 'Structured Booking',
      subtitle: isDe
        ? 'Anfragen, Gegenangebote und Annahmen laufen in einer klaren Reihenfolge ohne freie Chat-Deals.'
        : 'Requests, counter-offers, and accepts run in a clear sequence without free-form off-platform deals.',
      points: isDe
        ? [
            'Versionierte Offers verhindern Missverstaendnisse.',
            'Kontakt-Sharing wird in Offer-Texten automatisch blockiert.',
            'Finalpreis wird nach beidseitiger Annahme gesperrt.',
          ]
        : [
            'Versioned offers prevent negotiation conflicts.',
            'Contact sharing is automatically blocked in offer text.',
            'Final price is locked after both sides accept.',
          ],
    };
  }

  return null;
}

export default function WhyFeatureDetail() {
  const { topic } = useParams();
  const { language } = useLanguage();
  const content = getFeatureContent(topic, language);

  if (!content) {
    return (
      <div className="min-h-screen bg-slate-50 py-10">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-slate-700">{language === 'de' ? 'Bereich nicht gefunden.' : 'Section not found.'}</p>
            <Link to="/" className="inline-flex items-center gap-2 mt-4 text-purple-700 hover:text-purple-800">
              <ArrowLeft className="size-4" />
              {language === 'de' ? 'Zurueck zur Startseite' : 'Back to home'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const icon =
    topic === 'curated-vendors'
      ? <Sparkles className="size-6 text-purple-600" />
      : topic === 'secure-payments'
        ? <Shield className="size-6 text-purple-600" />
        : <Calendar className="size-6 text-purple-600" />;

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="size-4" />
            {language === 'de' ? 'Zurueck' : 'Back'}
          </Link>

          <div className="mt-5 rounded-xl border border-purple-100 bg-gradient-to-br from-white to-purple-50 p-5 sm:p-6 transition-all duration-300 hover:shadow-md">
            <div className="inline-flex items-center justify-center rounded-lg bg-purple-100 p-3 mb-3">
              {icon}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{content.title}</h1>
            <p className="mt-2 text-slate-600">{content.subtitle}</p>
          </div>

          <div className="mt-6 space-y-3">
            {content.points.map((point) => (
              <div
                key={point}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm"
              >
                {point}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
