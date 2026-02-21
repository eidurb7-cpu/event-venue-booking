import { Link, useParams } from 'react-router';
import { ArrowLeft, Calendar, Shield, Sparkles } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

type FeatureContent = {
  title: string;
  subtitle: string;
  points: string[];
  closing: string;
};

function getFeatureContent(topic: string | undefined, language: 'de' | 'en'): FeatureContent | null {
  const isDe = language === 'de';

  if (topic === 'curated-vendors') {
    return {
      title: isDe ? 'Gepruefte Vendor' : 'Curated Vendors',
      subtitle: isDe
        ? 'So halten wir den Marktplatz professionell, verlaesslich und konsistent.'
        : 'How we keep the marketplace professional, reliable, and consistent.',
      points: isDe
        ? [
            'Jede Vendor-Bewerbung wird geprueft (Identitaet, Angebotsklarheit und grundlegende Qualitaet).',
            'Services gehen erst nach Admin-Freigabe live, um Spam und Fake-Listings zu verhindern.',
            'Listings muessen klare Preise, Leistungsumfang und Verfuegbarkeitsregeln enthalten.',
            'Performance-Signale wie Reaktionszeit, Zuverlaessigkeit und Stornos fliessen in die Qualitaet ein.',
            'Admin-Audit-Trail: Statusaenderungen und Verifizierungsdokumente bleiben nachvollziehbar.',
          ]
        : [
            'Every vendor application is reviewed (identity, offer clarity, and baseline quality checks).',
            'Vendors publish services only after approval to prevent spam and fake listings.',
            'Listings must include clear pricing, deliverables, and availability rules.',
            'Performance signals like response time, reliability, and cancellations maintain quality over time.',
            'Admin audit trail: status changes and verification documents remain reviewable.',
          ],
      closing: isDe
        ? 'Unser Ziel: Du sollst Vendor so sicher auswaehlen koennen wie ein Hotel - mit Transparenz und Verantwortung.'
        : 'Our goal is simple: booking a vendor should feel as safe as booking a hotel, with transparency and accountability.',
    };
  }

  if (topic === 'secure-payments') {
    return {
      title: isDe ? 'Sichere Zahlungen' : 'Secure Payments',
      subtitle: isDe
        ? 'Stripe-basierter Checkout mit klarer Trennung zwischen Plattform und Vendor-Auszahlung.'
        : 'Stripe-powered checkout with clear separation between platform and vendor payouts.',
      points: isDe
        ? [
            'Checkout nutzt Stripe mit verschluesselter Kartenverarbeitung; wir speichern keine rohen Kartendaten.',
            'Zahlungsstatus wird serverseitig per Stripe-Webhook bestaetigt - keine fake Erfolgsscreens.',
            'Transparente Gesamtsumme: Venue + Services + moegliche Gebuehren vor dem Bezahlen sichtbar.',
            'Stripe Connect kann Vendor-Auszahlungen und Plattform-Provision sauber abbilden.',
            'Automatische Belege und Zahlungsbestaetigungen reduzieren Rueckfragen und Streitfaelle.',
          ]
        : [
            'Checkout uses Stripe with encrypted card handling; we do not store raw card details.',
            'Payment status is verified server-side via Stripe webhooks (no fake success screens).',
            'Transparent totals show venue + services + applicable fees before payment.',
            'Stripe Connect can support vendor payouts while retaining platform commission.',
            'Automatic receipts and confirmations increase trust and reduce disputes.',
          ],
      closing: isDe
        ? 'Sichere Zahlungen schuetzen beide Seiten: Kunden vermeiden riskante Ueberweisungen, Vendor erhalten bestaetigte Auftraege.'
        : 'Secure payments protect both sides: customers avoid risky transfers and vendors receive confirmed orders with a clear record.',
    };
  }

  if (topic === 'structured-booking') {
    return {
      title: isDe ? 'Strukturierte Buchung' : 'Structured Booking',
      subtitle: isDe
        ? 'Anfragen, Bestaetigungen und Zahlungen folgen einer klaren Reihenfolge - ohne Chaos.'
        : 'Requests, confirmations, and payments follow a predictable sequence with no chaos.',
      points: isDe
        ? [
            'Versionierte Angebote verhindern Verhandlungschaos und machen den aktuellen Preis eindeutig.',
            'Die Buchungszusammenfassung fixiert Positionen, damit am Checkout nichts unerwartet springt.',
            'Kontaktdaten koennen bis zur Bestaetigung geschuetzt bleiben und Off-Platform-Deals reduzieren.',
            'Klare Storno-Regeln und Zeitstempel verringern Streitfaelle.',
            'Finalpreis wird nach beidseitiger Annahme (oder Zahlung, je nach Modell) gesperrt.',
          ]
        : [
            'Versioned offers prevent negotiation confusion and keep the current price explicit.',
            'Booking summary locks selected items so nothing changes unexpectedly at checkout.',
            'Contact details can stay protected until confirmation to reduce off-platform deals.',
            'Clear cancellation rules and timestamps reduce disputes.',
            'Final price is locked after both sides accept (or when payment is completed, depending on model).',
          ],
      closing: isDe
        ? 'Events haben viele bewegliche Teile. Ein strukturierter Ablauf verhindert Last-Minute-Ueberraschungen.'
        : 'Events involve many moving parts. A structured flow prevents last-minute surprises and keeps plans consistent.',
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
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="size-4" />
            {language === 'de' ? 'Zurueck' : 'Back'}
          </Link>

          <div className="mt-5 rounded-xl border border-purple-100 bg-gradient-to-br from-white to-purple-50 p-5 sm:p-6">
            <div className="inline-flex items-center justify-center rounded-lg bg-purple-100 p-3 mb-3">{icon}</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{content.title}</h1>
            <p className="mt-2 text-slate-600">{content.subtitle}</p>
          </div>

          <div className="mt-6 space-y-3">
            {content.points.map((point) => (
              <div key={point} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
                {point}
              </div>
            ))}
          </div>

          <p className="mt-6 text-sm sm:text-base text-slate-700 rounded-xl bg-purple-50 border border-purple-100 p-4">
            {content.closing}
          </p>
        </div>
      </div>
    </div>
  );
}
