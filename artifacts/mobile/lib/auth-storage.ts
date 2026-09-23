import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearStoredInitData, getStoredInitData } from '@/lib/telegram';

const AUTH_TOKEN_KEY = '@experiences/auth-token';

export async function getStoredAuthToken(): Promise<string | null> {
  return (await AsyncStorage.getItem(AUTH_TOKEN_KEY)) ?? getStoredInitData();
}

export async function saveAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
}

export async function clearStoredAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
  await clearStoredInitData();
}