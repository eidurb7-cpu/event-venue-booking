import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  getVendorDocumentUploadUrl,
  loginCustomerWithGoogle,
  signupVendor,
  verifyVendorGoogleToken,
} from '../utils/api';
import { setCurrentUser } from '../utils/auth';

type Role = 'customer' | 'vendor';

type GoogleCredentialResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (input: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const vendorCategories = ['DJ', 'Catering', 'Make-up', 'Dekoration', 'Fotografie'];
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function Signup() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>('customer');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleLinked, setGoogleLinked] = useState(false);
  const [customerGoogleLoading, setCustomerGoogleLoading] = useState(false);

  const [vendorForm, setVendorForm] = useState({
    businessName: '',
    contactName: '',
    email: '',
    password: '',
    googleSub: '',
    city: '',
    websiteUrl: '',
    portfolioUrl: '',
    businessIntro: '',
    categories: [] as string[],
    documentName: '',
    documentKey: '',
    documentUrl: '',
    stripeAccountId: '',
  });

  useEffect(() => {
    if (window.google) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const onGoogleCustomerSignIn = async () => {
    if (!GOOGLE_CLIENT_ID) {
      setError('VITE_GOOGLE_CLIENT_ID fehlt in der .env.');
      return;
    }
    if (!window.google?.accounts?.id) {
      setError('Google Sign-In Script ist noch nicht geladen. Bitte kurz warten und erneut versuchen.');
      return;
    }
    setError('');
    setCustomerGoogleLoading(true);
    const loadingTimeout = window.setTimeout(() => {
      setCustomerGoogleLoading(false);
      setError('Google Login hat zu lange gedauert. Bitte Popup/Cookies pruefen und erneut versuchen.');
    }, 15000);
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: GoogleCredentialResponse) => {
        try {
          if (!response.credential) throw new Error('Keine Google Credential erhalten.');
          const data = await loginCustomerWithGoogle(response.credential);
          setCurrentUser(data);
          navigate('/customer-portfolio');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Google-Login fehlgeschlagen.');
        } finally {
          window.clearTimeout(loadingTimeout);
          setCustomerGoogleLoading(false);
        }
      },
    });
    window.google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed?.()) {
        window.clearTimeout(loadingTimeout);
        setCustomerGoogleLoading(false);
        const reason = notification.getNotDisplayedReason?.();
        setError(
          `Google Login konnte nicht gestartet werden${reason ? ` (${reason})` : ''}. Bitte Popup/Cookies erlauben oder manuell registrieren.`,
        );
      }
    });
  };

  const onGoogleVendorSignIn = async () => {
    if (!GOOGLE_CLIENT_ID) {
      setError('VITE_GOOGLE_CLIENT_ID fehlt in der .env.');
      return;
    }
    if (!window.google?.accounts?.id) {
      setError('Google Sign-In Script ist noch nicht geladen. Bitte kurz warten und erneut versuchen.');
      return;
    }
    setError('');
    setIsGoogleLoading(true);
    const loadingTimeout = window.setTimeout(() => {
      setIsGoogleLoading(false);
      setError('Google Verifizierung hat zu lange gedauert. Bitte Popup/Cookies pruefen und erneut versuchen.');
    }, 15000);
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: GoogleCredentialResponse) => {
        try {
          if (!response.credential) throw new Error('Keine Google Credential erhalten.');
          const result = await verifyVendorGoogleToken(response.credential);
          setVendorForm((prev) => ({
            ...prev,
            email: result.profile.email || prev.email,
            contactName: result.profile.name || prev.contactName,
            googleSub: result.profile.sub,
          }));
          setGoogleLinked(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Google-Verifizierung fehlgeschlagen.');
        } finally {
          window.clearTimeout(loadingTimeout);
          setIsGoogleLoading(false);
        }
      },
    });
    window.google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed?.()) {
        window.clearTimeout(loadingTimeout);
        setIsGoogleLoading(false);
        const reason = notification.getNotDisplayedReason?.();
        setError(
          `Google Verifizierung konnte nicht gestartet werden${reason ? ` (${reason})` : ''}. Bitte Popup/Cookies erlauben oder ohne Google fortfahren.`,
        );
      }
    });
  };

  const onVendorDocumentChange = async (file?: File) => {
    if (!file) return;
    setError('');
    setIsUploadingDoc(true);
    try {
      const data = await getVendorDocumentUploadUrl({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
      });
      const uploadRes = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('Upload zu R2 fehlgeschlagen.');
      setVendorForm((prev) => ({
        ...prev,
        documentName: file.name,
        documentKey: data.fileKey,
        documentUrl: data.publicUrl || '',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Datei-Upload fehlgeschlagen.');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const onVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!vendorForm.googleSub) {
      setError('Bitte zuerst Google-Konto als Vendor verknuepfen.');
      return;
    }
    setIsSubmitting(true);
    try {
      await signupVendor({
        ...vendorForm,
        password: undefined,
      });
      setSubmitted(true);
      setGoogleLinked(false);
      setVendorForm({
        businessName: '',
        contactName: '',
        email: '',
        password: '',
        googleSub: '',
        city: '',
        websiteUrl: '',
        portfolioUrl: '',
        businessIntro: '',
        categories: [],
        documentName: '',
        documentKey: '',
        documentUrl: '',
        stripeAccountId: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden der Vendor-Anfrage.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6 sm:py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="bg-white rounded-xl shadow-md p-5 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Registrieren</h1>
          <p className="text-gray-600 mb-6">
            Waehle ob du als Kunde buchen oder als Vendor Dienstleistungen anbieten willst.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              type="button"
              onClick={() => {
                setRole('customer');
                setSubmitted(false);
              }}
              className={`rounded-lg py-2.5 font-medium transition-colors ${
                role === 'customer' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Als Kunde
            </button>
            <button
              type="button"
              onClick={() => {
                setRole('vendor');
                setSubmitted(false);
              }}
              className={`rounded-lg py-2.5 font-medium transition-colors ${
                role === 'vendor' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Als Vendor
            </button>
          </div>

          {role === 'customer' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                Kunden nutzen nur Google Login. Kein Passwort oder E-Mail-Registrierung erforderlich.
              </div>
              <button
                type="button"
                onClick={onGoogleCustomerSignIn}
                disabled={customerGoogleLoading}
                className="w-full rounded-lg border border-gray-300 bg-white text-gray-800 py-2.5 font-medium hover:bg-gray-50 transition-colors"
              >
                {customerGoogleLoading ? 'Google wird geprueft...' : 'Mit Google als Kunde anmelden'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full rounded-lg border border-gray-300 bg-white text-gray-800 py-2.5 font-medium hover:bg-gray-50 transition-colors"
              >
                Zur Login-Seite
              </button>
            </div>
          )}

          {role === 'vendor' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={onGoogleVendorSignIn}
                disabled={isGoogleLoading}
                className="w-full rounded-lg border border-gray-300 bg-white text-gray-800 py-2.5 font-medium hover:bg-gray-50 transition-colors"
              >
                {isGoogleLoading ? 'Google wird geprueft...' : 'Mit Google als Vendor anmelden'}
              </button>
              {googleLinked && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  Google Konto ist verknuepft.
                </div>
              )}

              <form className="space-y-4" onSubmit={onVendorSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Firmenname / Brand</label>
                    <input
                      type="text"
                      required
                      value={vendorForm.businessName}
                      onChange={(e) => setVendorForm((p) => ({ ...p, businessName: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Kontaktperson</label>
                    <input
                      type="text"
                      required
                      value={vendorForm.contactName}
                      onChange={(e) => setVendorForm((p) => ({ ...p, contactName: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">E-Mail</label>
                    <input
                      type="email"
                      required
                      value={vendorForm.email}
                      onChange={(e) => setVendorForm((p) => ({ ...p, email: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Passwort
                    </label>
                    <input
                      type="password"
                      disabled
                      value=""
                      placeholder="Deaktiviert: Vendor Login ist Google-only"
                      onChange={() => {}}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-gray-500"
                    />
                  </div>
                </div>

                {!vendorForm.googleSub && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                    Bitte zuerst "Mit Google als Vendor anmelden", dann Bewerbung absenden.
                  </div>
                )}

                <div>
                  <label className="block text-sm text-gray-700 mb-2">Dienstleistungen</label>
                  <div className="flex flex-wrap gap-2">
                    {vendorCategories.map((cat) => {
                      const selected = vendorForm.categories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() =>
                            setVendorForm((p) => ({
                              ...p,
                              categories: selected ? p.categories.filter((c) => c !== cat) : [...p.categories, cat],
                            }))
                          }
                          className={`px-3 py-1.5 rounded-full text-sm border ${
                            selected ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Stadt</label>
                    <input
                      type="text"
                      required
                      value={vendorForm.city}
                      onChange={(e) => setVendorForm((p) => ({ ...p, city: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Website URL</label>
                    <input
                      type="url"
                      value={vendorForm.websiteUrl}
                      onChange={(e) => setVendorForm((p) => ({ ...p, websiteUrl: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">Portfolio URL</label>
                  <input
                    type="url"
                    value={vendorForm.portfolioUrl}
                    onChange={(e) => setVendorForm((p) => ({ ...p, portfolioUrl: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">Stripe Connect Account ID (optional)</label>
                  <input
                    type="text"
                    placeholder="acct_..."
                    value={vendorForm.stripeAccountId}
                    onChange={(e) => setVendorForm((p) => ({ ...p, stripeAccountId: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">Business Vorstellung</label>
                  <textarea
                    rows={4}
                    required
                    value={vendorForm.businessIntro}
                    onChange={(e) => setVendorForm((p) => ({ ...p, businessIntro: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">CV / Business Dokument (PDF, DOC)</label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => onVendorDocumentChange(e.target.files?.[0])}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
                  />
                  {isUploadingDoc && <p className="text-xs text-gray-500 mt-1">Upload laeuft...</p>}
                  {vendorForm.documentName && (
                    <p className="text-xs text-gray-500 mt-1">
                      Datei: {vendorForm.documentName} {vendorForm.documentUrl ? '(in R2 gespeichert)' : ''}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingDoc || !vendorForm.googleSub}
                  className="w-full rounded-lg bg-purple-600 text-white py-2.5 font-medium hover:bg-purple-700 transition-colors disabled:opacity-60"
                >
                  {isSubmitting ? 'Wird gesendet...' : 'Vendor Anfrage senden'}
                </button>
              </form>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {submitted && (
            <div className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Anfrage gesendet. Dein Vendor-Konto wartet jetzt auf Admin-Freigabe.
            </div>
          )}

          <p className="text-sm text-gray-600 mt-5">
            Bereits ein Konto?{' '}
            <Link to="/login" className="text-purple-600 hover:text-purple-700">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
