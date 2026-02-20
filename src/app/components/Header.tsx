import { Link, useLocation } from 'react-router';
import { Calendar, MapPin, Home, Globe, BriefcaseBusiness, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useEffect, useState } from 'react';
import { getAdminToken, getCurrentUser } from '../utils/auth';

export function Header() {
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const [isAdmin, setIsAdmin] = useState(false);

  const languages = [
    { code: 'de' as const, name: 'Deutsch' },
    { code: 'en' as const, name: 'English' }
  ];

  useEffect(() => {
    const current = getCurrentUser();
    const hasAdminToken = !!getAdminToken();
    setIsAdmin(current?.role === 'admin' || hasAdminToken);
  }, [location.pathname]);

  return (
    <header className="bg-white border-b sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Calendar className="size-8 text-purple-600" />
            <span className="text-2xl font-semibold text-gray-900">EventVenue</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/"
              className={`flex items-center gap-2 transition-colors ${
                location.pathname === '/' ? 'text-purple-600' : 'text-gray-600 hover:text-purple-600'
              }`}
            >
              <Home className="size-4" />
              {t('nav.home')}
            </Link>
            <Link
              to="/venues"
              className={`flex items-center gap-2 transition-colors ${
                location.pathname === '/venues' ? 'text-purple-600' : 'text-gray-600 hover:text-purple-600'
              }`}
            >
              <MapPin className="size-4" />
              {t('nav.venues')}
            </Link>
            <Link
              to="/services"
              className={`flex items-center gap-2 transition-colors ${
                location.pathname === '/services' ? 'text-purple-600' : 'text-gray-600 hover:text-purple-600'
              }`}
            >
              <BriefcaseBusiness className="size-4" />
              {t('nav.services')}
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className={`flex items-center gap-2 transition-colors ${
                  location.pathname === '/admin' ? 'text-purple-600' : 'text-gray-600 hover:text-purple-600'
                }`}
              >
                <ShieldCheck className="size-4" />
                Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <button className="flex items-center gap-2 text-gray-600 hover:text-purple-600 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50">
                <Globe className="size-5" />
                <span className="hidden sm:inline">{languages.find((l) => l.code === language)?.name}</span>
              </button>

              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      language === lang.code ? 'bg-purple-100 text-purple-600' : 'text-gray-700'
                    }`}
                  >
                    <span className="font-medium">{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <Link
              to="/request"
              className="hidden sm:inline-flex bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-black transition-colors"
            >
              {t('nav.request')}
            </Link>
            <Link
              to="/login"
              className="inline-flex bg-white text-gray-800 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('nav.login')}
            </Link>
            <Link
              to="/signup"
              className="inline-flex bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
            >
              {t('nav.signup')}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
