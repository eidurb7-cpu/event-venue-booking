import { Link } from 'react-router';
import { useLanguage } from '../context/LanguageContext';

export function Footer() {
  const { t } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {t('footer.copy', { year })}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link to="/impressum" className="text-slate-600 hover:text-slate-900">{t('footer.impressum')}</Link>
            <Link to="/privacy" className="text-slate-600 hover:text-slate-900">{t('footer.privacy')}</Link>
            <Link to="/terms" className="text-slate-600 hover:text-slate-900">{t('footer.terms')}</Link>
            <Link to="/vendor-terms" className="text-slate-600 hover:text-slate-900">{t('footer.vendorTerms')}</Link>
            <Link to="/refund-policy" className="text-slate-600 hover:text-slate-900">{t('footer.refunds')}</Link>
            <Link to="/contact" className="text-slate-600 hover:text-slate-900">{t('footer.contact')}</Link>
            <Link to="/cookies" className="text-slate-600 hover:text-slate-900">{t('footer.cookies')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
