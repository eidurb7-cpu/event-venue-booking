import AsyncStorage from '@react-native-async-storage/async-storage';

const MOBILE_TOKEN_KEY = 'eventvenue_mobile_token';
const MOBILE_ROLE_KEY = 'eventvenue_mobile_role';
const MOBILE_EMAIL_KEY = 'eventvenue_mobile_email';

export async function saveSession(token: string, role: string, email: string) {
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
    role: role?.[1] || '',
    email: email?.[1] || '',
  };
}
