import { getCurrentUser } from './auth';

export type Consent = {
  v: number;
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  ts: number;
};

type ConsentCategory = 'preferences' | 'analytics' | 'marketing';

const COOKIE_NAME = 'uc_consent';
const CONSENT_EVENT = 'consent:updated';
const SESSION_ID_KEY = 'anonymousSessionId';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export function getConsent(): Consent | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;

  try {
    const value = decodeURIComponent(match.split('=')[1] || '');
    const parsed = JSON.parse(value) as Consent;
    if (
      typeof parsed?.v !== 'number' ||
      typeof parsed?.preferences !== 'boolean' ||
      typeof parsed?.analytics !== 'boolean' ||
      typeof parsed?.marketing !== 'boolean'
    ) {
      return null;
    }
    return {
      v: parsed.v,
      necessary: true,
      preferences: parsed.preferences,
      analytics: parsed.analytics,
      marketing: parsed.marketing,
      ts: typeof parsed.ts === 'number' ? parsed.ts : Date.now(),
    };
  } catch {
    return null;
  }
}

export function setConsent(consent: Omit<Consent, 'ts' | 'necessary'>) {
  const payload: Consent = {
    ...consent,
    necessary: true,
    ts: Date.now(),
  };
  const value = encodeURIComponent(JSON.stringify(payload));
  document.cookie = `${COOKIE_NAME}=${value}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: payload }));
  return payload;
}

export function canUse(category: ConsentCategory) {
  const consent = getConsent();
  if (!consent) return false;
  return consent[category];
}

export function onConsentChange(handler: (consent: Consent) => void) {
  const listener = (event: Event) => {
    const custom = event as CustomEvent<Consent>;
    if (custom.detail) handler(custom.detail);
  };
  window.addEventListener(CONSENT_EVENT, listener);
  return () => window.removeEventListener(CONSENT_EVENT, listener);
}

function getAnonymousSessionId() {
  const existing = localStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `sess_${Date.now()}`;
  localStorage.setItem(SESSION_ID_KEY, id);
  return id;
}

export async function saveConsentToBackend(consent: Consent) {
  const currentUser = getCurrentUser();
  const body = {
    v: consent.v,
    necessary: true,
    preferences: consent.preferences,
    analytics: consent.analytics,
    marketing: consent.marketing,
    ts: consent.ts,
    sessionId: getAnonymousSessionId(),
    userEmail: currentUser?.user?.email || null,
  };

  try {
    await fetch(`${API_BASE}/api/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // No-op: consent is always stored in cookie even if backend call fails.
  }
}
