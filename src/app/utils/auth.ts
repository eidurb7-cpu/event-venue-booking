const CURRENT_USER_STORAGE = 'currentUser';
const ADMIN_TOKEN_STORAGE = 'adminDashboardToken';
const ADMIN_USER_STORAGE = 'adminDashboardUser';

type AppRole = 'customer' | 'vendor' | 'admin';

export type AppSessionUser = {
  role: AppRole;
  user: {
    id: string;
    name: string;
    email: string;
    status?: string;
  };
};

export function getCurrentUser(): AppSessionUser | null {
  const raw = localStorage.getItem(CURRENT_USER_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.role || !parsed?.user?.email) return null;
    return parsed as AppSessionUser;
  } catch {
    return null;
  }
}

export function setCurrentUser(session: AppSessionUser) {
  localStorage.setItem(CURRENT_USER_STORAGE, JSON.stringify(session));
}

export function clearCurrentUser() {
  localStorage.removeItem(CURRENT_USER_STORAGE);
}

export function getAdminToken() {
  return sessionStorage.getItem(ADMIN_TOKEN_STORAGE) || '';
}

export function setAdminSession(token: string, user: { id: string; name: string; email: string }) {
  sessionStorage.setItem(ADMIN_TOKEN_STORAGE, token);
  sessionStorage.setItem(ADMIN_USER_STORAGE, JSON.stringify(user));
  setCurrentUser({ role: 'admin', user });
}

export function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_TOKEN_STORAGE);
  sessionStorage.removeItem(ADMIN_USER_STORAGE);
  const current = getCurrentUser();
  if (current?.role === 'admin') clearCurrentUser();
}

export function getAdminUser() {
  const raw = sessionStorage.getItem(ADMIN_USER_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.email && parsed?.name) return parsed as { id: string; name: string; email: string };
  } catch {
    // Backward compatibility with older string-only value.
    return { id: '', name: raw, email: '' };
  }
  return null;
}
