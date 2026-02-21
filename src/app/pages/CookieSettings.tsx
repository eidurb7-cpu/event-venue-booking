import { Link } from 'react-router';
import { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { getConsent, saveConsentToBackend, setConsent } from '../utils/consent';

export default function CookieSettings() {
  const { t } = useLanguage();
  const [preferences, setPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const current = getConsent();
    if (!current) return;
    setPreferences(current.preferences);
    setAnalytics(current.analytics);
    setMarketing(current.marketing);
  }, []);

  async function save() {
    const payload = setConsent({
      v: 1,
      preferences,
      analytics,
      marketing,
    });
    await saveConsentToBackend(payload);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{t('cookies.settings.title')}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('cookies.settings.description')}</p>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="font-medium text-slate-800">{t('cookies.category.necessary')}</p>
              <p className="text-xs text-slate-500">{t('cookies.settings.alwaysOn')}</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
              ON
            </span>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="font-medium text-slate-800">{t('cookies.category.preferences')}</span>
            <input
              type="checkbox"
              checked={preferences}
              onChange={(e) => setPreferences(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="font-medium text-slate-800">{t('cookies.category.analytics')}</span>
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="font-medium text-slate-800">{t('cookies.category.marketing')}</span>
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            {t('cookies.settings.save')}
          </button>
          <Link to="/" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            {t('cookies.settings.backHome')}
          </Link>
        </div>

        {saved && (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {t('cookies.settings.saved')}
          </p>
        )}
      </div>
    </section>
  );
}
