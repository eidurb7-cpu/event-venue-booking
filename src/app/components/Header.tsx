import { Link, useLocation, useNavigate } from 'react-router';
import { Calendar, MapPin, Home, Globe, BriefcaseBusiness, ShieldCheck, User, LogOut, Menu, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useEffect, useState } from 'react';
import { clearAdminSession, clearCurrentUser, getAdminToken, getCurrentUser } from '../utils/auth';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentRole, setCurrentRole] = useState<'customer' | 'vendor' | 'admin' | ''>('');
  const [currentName, setCurrentName] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const languages = [
    { code: 'de' as const, name: 'Deutsch' },
    { code: 'en' as const, name: 'English' }
  ];

  useEffect(() => {
    const current = getCurrentUser();
    const hasAdminToken = !!getAdminToken();
    setIsAdmin(current?.role === 'admin' || hasAdminToken);
    setCurrentRole((current?.role as 'customer' | 'vendor' | 'admin' | '') || '');
    setCurrentName(current?.user?.name || '');
  }, [location.pathname]);

  const accountHref =
    currentRole === 'vendor' ? '/vendor-portfolio' : currentRole === 'admin' ? '/admin' : '/customer-portfolio';

  const logout = () => {
    if (currentRole === 'admin') clearAdminSession();
    clearCurrentUser();
    setMobileOpen(false);
    navigate('/');
  };

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

          <div className="flex items-center gap-2 sm:gap-4">
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
            {currentRole ? (
              <div className="relative group">
                <button className="inline-flex items-center gap-2 bg-white text-gray-800 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <User className="size-4" />
                  <span className="max-w-[120px] truncate">{currentName || 'Konto'}</span>
                </button>
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <Link to={accountHref} className="block px-4 py-3 text-sm text-gray-700 hover:bg-purple-50">
                    Mein Konto
                  </Link>
                  <Link to="/" className="block px-4 py-3 text-sm text-gray-700 hover:bg-purple-50">
                    Zur Startseite
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 inline-flex items-center gap-2"
                  >
                    <LogOut className="size-4" />
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden sm:inline-flex bg-white text-gray-800 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/signup"
                  className="hidden sm:inline-flex bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {t('nav.signup')}
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex md:hidden items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
              aria-label="Mobile Menu"
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden mt-3 rounded-lg border border-gray-200 bg-white p-3 space-y-2">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50"
            >
              {t('nav.home')}
            </Link>
            <Link
              to="/venues"
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50"
            >
              {t('nav.venues')}
            </Link>
            <Link
              to="/services"
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50"
            >
              {t('nav.services')}
            </Link>
            <Link
              to="/request"
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50"
            >
              {t('nav.request')}
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50"
              >
                Admin
              </Link>
            )}
            {currentRole ? (
              <>
                <Link
                  to={accountHref}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Mein Konto
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full text-left rounded-lg px-3 py-2 text-red-600 hover:bg-red-50"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-50"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-3 py-2 text-white bg-purple-600 hover:bg-purple-700"
                >
                  {t('nav.signup')}
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
