import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLanguage } from '../context/LanguageContext';
import { loginCustomerWithGoogle, loginVendorWithGoogle } from '../utils/api';
import { getCurrentUser, setCurrentUser } from '../utils/auth';

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

export default function Login() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const [googleLoading, setGoogleLoading] = useState<'customer' | 'vendor' | ''>('');
  const [error, setError] = useState('');

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) return;
    if (current.role === 'vendor') navigate('/vendor-portfolio');
    else if (current.role === 'customer') navigate('/customer-portfolio');
    else if (current.role === 'admin') navigate('/admin');
  }, [navigate]);

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

  const signInWithGoogle = async (role: 'customer' | 'vendor') => {
    if (!GOOGLE_CLIENT_ID) {
      setError('VITE_GOOGLE_CLIENT_ID fehlt in der .env.');
      return;
    }
    if (!window.google?.accounts?.id) {
      setError('Google Sign-In Script ist noch nicht geladen. Bitte kurz warten und erneut versuchen.');
      return;
    }
    setError('');
    setGoogleLoading(role);
    const loadingTimeout = window.setTimeout(() => {
      setGoogleLoading('');
      setError('Google Login hat zu lange gedauert. Bitte Popup/Cookies pruefen und erneut versuchen.');
    }, 15000);
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: GoogleCredentialResponse) => {
        try {
          if (!response.credential) throw new Error('Keine Google Credential erhalten.');
          const data =
            role === 'customer'
              ? await loginCustomerWithGoogle(response.credential)
              : await loginVendorWithGoogle(response.credential);
          setCurrentUser(data);
          if (data.role === 'vendor') navigate('/vendor-portfolio');
          else navigate('/customer-portfolio');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Google-Login fehlgeschlagen.');
        } finally {
          window.clearTimeout(loadingTimeout);
          setGoogleLoading('');
        }
      },
    });
    window.google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed?.()) {
        window.clearTimeout(loadingTimeout);
        setGoogleLoading('');
        const reason = notification.getNotDisplayedReason?.();
        setError(
          `Google Login konnte nicht gestartet werden${reason ? ` (${reason})` : ''}. Bitte Popup/Cookies erlauben oder E-Mail Login nutzen.`,
        );
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-md">
        <div className="bg-white rounded-xl shadow-md p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('auth.login.title')}</h1>
          <p className="text-gray-600 mb-6">{t('auth.login.subtitle')}</p>

          <div className="mb-5">
            <p className="text-sm font-semibold text-gray-800 mb-2">Login with Google</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => signInWithGoogle('customer')}
                disabled={googleLoading !== ''}
                className="w-full rounded-lg border border-gray-300 bg-white text-gray-800 py-2.5 font-medium hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-2"
              >
                <GoogleIcon />
                {googleLoading === 'customer' ? 'Google wird geprueft...' : 'Mit Google als Kunde anmelden'}
              </button>
              <button
                type="button"
                onClick={() => signInWithGoogle('vendor')}
                disabled={googleLoading !== ''}
                className="w-full rounded-lg border border-gray-300 bg-white text-gray-800 py-2.5 font-medium hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-2"
              >
                <GoogleIcon />
                {googleLoading === 'vendor' ? 'Google wird geprueft...' : 'Mit Google als Vendor anmelden'}
              </button>
            </div>
          </div>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-gray-500">Google-only Login aktiviert</span>
            </div>
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <p className="text-sm text-gray-600 mt-5">
            {t('auth.login.noAccount')}{' '}
            <Link to="/signup" className="text-purple-600 hover:text-purple-700">
              {t('auth.signup.button')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.6 2 12 2a10 10 0 1 0 0 20c5.8 0 9.7-4.1 9.7-9.8 0-.7-.1-1.3-.2-2H12z"
      />
      <path
        fill="#34A853"
        d="M3.9 7.1l3.2 2.3C8 7.6 9.8 6 12 6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.6 2 12 2 8.2 2 4.9 4.2 3.3 7.4l.6-.3z"
      />
      <path
        fill="#4A90E2"
        d="M12 22c2.6 0 4.8-.8 6.4-2.2l-3-2.5c-.8.5-1.9.9-3.4.9-4 0-5.2-2.7-5.4-3.9l-3.2 2.4A10 10 0 0 0 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M3.3 7.4A10 10 0 0 0 2 12c0 1.6.4 3.2 1.2 4.6l3.3-2.5C6.3 13.5 6 12.8 6 12c0-.8.2-1.5.5-2.1L3.3 7.4z"
      />
    </svg>
  );
}
