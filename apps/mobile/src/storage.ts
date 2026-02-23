import AsyncStorage from '@react-native-async-storage/async-storage';

const MOBILE_TOKEN_KEY = 'eventvenue_mobile_token';
const MOBILE_ROLE_KEY = 'eventvenue_mobile_role';
const MOBILE_EMAIL_KEY = 'eventvenue_mobile_email';
const MOBILE_CUSTOMER_PLAN_KEY = 'eventvenue_mobile_customer_plan';
const MOBILE_VENDOR_CALENDAR_PREFS_KEY = 'eventvenue_mobile_vendor_calendar_prefs';

export type MobileRole = 'customer' | 'vendor' | 'admin' | '';

export async function saveSession(token: string, role: MobileRole, email: string) {
  await AsyncStorage.multiSet([
    [MOBILE_TOKEN_KEY, token],
    [MOBILE_ROLE_KEY, role],
    [MOBILE_EMAIL_KEY, email],
  ]);
}

export async function clearSession() {
  await AsyncStorage.multiRemove([MOBILE_TOKEN_KEY, MOBILE_ROLE_KEY, MOBILE_EMAIL_KEY]);
}

export async function loadSession() {
  const [token, role, email] = await AsyncStorage.multiGet([MOBILE_TOKEN_KEY, MOBILE_ROLE_KEY, MOBILE_EMAIL_KEY]);
  return {
    token: token?.[1] || '',
    role: (role?.[1] || '') as MobileRole,
    email: email?.[1] || '',
  };
}

export type MobilePlannedService = {
  id: string;
  title: string;
  vendorName: string;
  serviceName: string;
  date: string;
  availability?: Record<string, boolean>;
  basePrice?: number | null;
};

export async function saveCustomerPlan(plan: MobilePlannedService[]) {
  await AsyncStorage.setItem(MOBILE_CUSTOMER_PLAN_KEY, JSON.stringify(plan));
}

export async function loadCustomerPlan() {
  const raw = await AsyncStorage.getItem(MOBILE_CUSTOMER_PLAN_KEY);
  if (!raw) return [] as MobilePlannedService[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === 'string');
  } catch {
    return [];
  }
}

export type VendorCalendarPrefs = {
  bulkStartDate?: string;
  bulkDays?: number;
};

export async function saveVendorCalendarPrefs(prefs: VendorCalendarPrefs) {
  await AsyncStorage.setItem(MOBILE_VENDOR_CALENDAR_PREFS_KEY, JSON.stringify(prefs));
}

export async function loadVendorCalendarPrefs() {
  const raw = await AsyncStorage.getItem(MOBILE_VENDOR_CALENDAR_PREFS_KEY);
  if (!raw) return {} as VendorCalendarPrefs;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as VendorCalendarPrefs;
  } catch {
    return {};
  }
}
