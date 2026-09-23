import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

const INIT_DATA_KEY = '@experiences/init-data';
const TELEGRAM_BOT_USERNAME = 'experiencesdotfun_bot';

type TelegramWindow = Window & {
  Telegram?: { WebApp?: { initData?: string; ready?: () => void } };
};

export async function getStoredInitData(): Promise<string | null> {
  return AsyncStorage.getItem(INIT_DATA_KEY);
}

export async function saveInitData(initData: string): Promise<void> {
  await AsyncStorage.setItem(INIT_DATA_KEY, initData);
}

export function getTelegramInitData(): string | null {
  if (typeof window === 'undefined') return null;
  const telegram = (window as TelegramWindow).Telegram;
  telegram?.WebApp?.ready?.();
  return telegram?.WebApp?.initData || null;
}

export function hasTelegramWebApp(): boolean {
  return typeof window !== 'undefined' && Boolean((window as TelegramWindow).Telegram?.WebApp);
}

export function openTelegramBot(username?: string | null): void {
  const url = `https://t.me/${username || TELEGRAM_BOT_USERNAME}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url).catch(() => undefined);
}