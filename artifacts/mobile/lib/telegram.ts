import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const INIT_DATA_KEY = '@experiences/init-data';

export async function getStoredInitData(): Promise<string | null> {
  return AsyncStorage.getItem(INIT_DATA_KEY);
}

export async function saveInitData(initData: string): Promise<void> {
  await AsyncStorage.setItem(INIT_DATA_KEY, initData);
}

export function getTelegramInitData(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const telegram = (window as typeof window & {
    Telegram?: { WebApp?: { initData?: string; ready?: () => void } };
  }).Telegram;
  telegram?.WebApp?.ready?.();
  return telegram?.WebApp?.initData || null;
}

export function openTelegramBot(username?: string | null): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(username ? `https://t.me/${username}` : 'https://telegram.org', '_blank');
  }
}