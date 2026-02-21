import { useLanguage } from '../context/LanguageContext';

export default function VendorTerms() {
  const { language } = useLanguage();
  const isDe = language === 'de';

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
            {isDe ? 'Vendor Agreement' : 'Vendor Agreement'}
          </h1>
          <p className="text-sm text-slate-700 leading-6">
            This Vendor Agreement is entered into between EventVenue Marketplace ("Platform") and the Vendor ("you").
            By registering and activating a vendor account, you agree to the terms below.
          </p>

          <Section
            title="1. Vendor Eligibility and Approval"
            points={[
              'Provide accurate personal or business information.',
              'Complete vendor onboarding and training.',
              'Accept this Agreement.',
              'Complete Stripe Connect onboarding for payouts.',
              'Receive admin approval before becoming active.',
            ]}
          />

          <Section
            title="2. Vendor Responsibilities"
            points={[
              'Publish accurate service and venue information.',
              'Honor accepted bookings and agreed pricing.',
              'Maintain professional communication with customers.',
              'Deliver services as described and on time.',
              'Comply with applicable laws and regulations.',
            ]}
          />

          <Section
            title="3. Payments and Stripe Connect"
            points={[
              'Payments are processed by Stripe.',
              'The platform collects customer payment first.',
              'Applicable platform fees and VAT are deducted.',
              'Remaining net amount is transferred to your Stripe Connect account.',
              'Incomplete Stripe onboarding may delay payouts.',
            ]}
          />

          <Section
            title="4. Platform Commission"
            points={[
              'Commission may be percentage-based or fixed per booking.',
              'Commission is deducted automatically before payout.',
              'Commission and payout breakdown are visible in vendor dashboard.',
            ]}
          />

          <Section
            title="5. Service Agreement and Acceptance"
            points={[
              'Accepting a customer service request creates a binding agreement.',
              'After acceptance, payment can be enabled for the customer.',
              'Failure to deliver accepted services may lead to penalties or account suspension.',
            ]}
          />

          <Section
            title="6. Platform Authority and Moderation"
            points={[
              'Platform may approve/reject/suspend vendor accounts.',
              'Platform may remove non-compliant listings and moderate disputes.',
              'Platform maintains marketplace quality and trust standards.',
            ]}
          />

          <Section
            title="7. Agreement Acceptance Record"
            points={[
              'Acceptance is recorded digitally with timestamp and account identity.',
              'Agreement version is stored with your acceptance record.',
              'Continued use after updates constitutes acceptance of current version.',
            ]}
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            Required activation rule: vendor cannot become active unless admin approved + contract accepted + training completed.
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, points }: { title: string; points: string[] }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900 mb-2">{title}</h2>
      <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 leading-6">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </section>
  );
}
