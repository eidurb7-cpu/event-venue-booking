import { useEffect } from 'react';
import { Consent, getConsent, onConsentChange } from '../utils/consent';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '';

function loadScriptOnce(id: string, src: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function ensureGa(consent: Consent) {
  if (!consent.analytics || !GA_MEASUREMENT_ID) return;
  loadScriptOnce('ga-script', `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
  const anyWindow = window as Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
  if (!anyWindow.dataLayer) anyWindow.dataLayer = [];
  if (!anyWindow.gtag) {
    anyWindow.gtag = function gtag(...args: unknown[]) {
      anyWindow.dataLayer?.push(args);
    };
    anyWindow.gtag('js', new Date());
    anyWindow.gtag('config', GA_MEASUREMENT_ID);
  }
}

function ensureMetaPixel(consent: Consent) {
  if (!consent.marketing || !META_PIXEL_ID) return;
  const anyWindow = window as Window & { fbq?: (...args: unknown[]) => void; _fbq?: (...args: unknown[]) => void };
  if (anyWindow.fbq) return;
  const fbq = function (...args: unknown[]) {
    (fbq as unknown as { queue: unknown[] }).queue.push(args);
  } as unknown as ((...args: unknown[]) => void) & { queue: unknown[]; loaded?: boolean; version?: string };
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  anyWindow.fbq = fbq;
  anyWindow._fbq = fbq;

  loadScriptOnce('meta-pixel-script', 'https://connect.facebook.net/en_US/fbevents.js');
  anyWindow.fbq('init', META_PIXEL_ID);
  anyWindow.fbq('track', 'PageView');
}

function applyConsent(consent: Consent) {
  if (consent.analytics) ensureGa(consent);
  if (consent.marketing) ensureMetaPixel(consent);
}

export function ConsentScriptLoader() {
  useEffect(() => {
    const existing = getConsent();
    if (existing) applyConsent(existing);

    return onConsentChange((consent) => {
      applyConsent(consent);
    });
  }, []);

  return null;
}
