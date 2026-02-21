import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { getConsent, saveConsentToBackend, setConsent } from '../utils/consent';

export function CookieBanner() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    const existing = getConsent();
    if (!existing) {
      setOpen(true);
      return;
    }
    setPreferences(existing.preferences);
    setAnalytics(existing.analytics);
    setMarketing(existing.marketing);
  }, []);

  if (!open) return null;

  async function acceptAll() {
    const payload = setConsent({
      v: 1,
      preferences: true,
      analytics: true,
      marketing: true,
    });
    await saveConsentToBackend(payload);
    setOpen(false);
  }

  async function rejectNonEssential() {
    const payload = setConsent({
      v: 1,
      preferences: false,
      analytics: false,
      marketing: false,
    });
    await saveConsentToBackend(payload);
    setOpen(false);
  }

  async function saveSelected() {
    const payload = setConsent({
      v: 1,
      preferences,
      analytics,
      marketing,
    });
    await saveConsentToBackend(payload);
    setOpen(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl md:inset-x-6">
      <p className="text-base font-semibold text-slate-900">{t('cookies.banner.title')}</p>
      <p className="mt-2 text-sm text-slate-600">{t('cookies.banner.description')}</p>

      {showCustom && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <label className="flex items-center justify-between gap-2">
            <span>{t('cookies.category.preferences')}</span>
            <input
              type="checkbox"
              checked={preferences}
              onChange={(e) => setPreferences(e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{t('cookies.category.analytics')}</span>
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{t('cookies.category.marketing')}</span>
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
            />
          </label>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={rejectNonEssential}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          {t('cookies.banner.reject')}
        </button>
        <button
          type="button"
          onClick={acceptAll}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t('cookies.banner.accept')}
        </button>
        <button
          type="button"
          onClick={() => setShowCustom((current) => !current)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          {showCustom ? t('cookies.banner.hideCustomize') : t('cookies.banner.customize')}
        </button>
        {showCustom && (
          <button
            type="button"
            onClick={saveSelected}
            className="rounded-md border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            {t('cookies.banner.saveSelection')}
          </button>
        )}
        <Link to="/cookies" className="rounded-md px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
          {t('cookies.banner.settings')}
        </Link>
      </div>
    </div>
  );
}
