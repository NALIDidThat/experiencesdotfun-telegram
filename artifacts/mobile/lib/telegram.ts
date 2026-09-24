import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

const INIT_DATA_KEY = '@experiences/init-data';
const TELEGRAM_BOT_USERNAME = 'experiencesdotfun_bot';
const TELEGRAM_WEB_APP_SDK = 'https://telegram.org/js/telegram-web-app.js?59';
const TELEGRAM_SDK_TIMEOUT_MS = 4_000;
let telegramSdkPromise: Promise<void> | null = null;

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      ready?: () => void;
      expand?: () => void;
      openTelegramLink?: (url: string) => void;
    };
  };
};

export async function getStoredInitData(): Promise<string | null> {
  return AsyncStorage.getItem(INIT_DATA_KEY);
}

export async function saveInitData(initData: string): Promise<void> {
  await AsyncStorage.setItem(INIT_DATA_KEY, initData);
}

export async function clearStoredInitData(): Promise<void> {
  await AsyncStorage.removeItem(INIT_DATA_KEY);
}

export async function loadTelegramWebApp(): Promise<void> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if ((window as TelegramWindow).Telegram?.WebApp) return;
  if (telegramSdkPromise) return telegramSdkPromise;

  telegramSdkPromise = new Promise((resolve) => {
    let settled = false;
    const existing = document.querySelector<HTMLScriptElement>('script[data-telegram-web-app]');
    const script = existing ?? document.createElement('script');
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.removeEventListener('load', finish);
      script.removeEventListener('error', finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, TELEGRAM_SDK_TIMEOUT_MS);

    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', finish, { once: true });
    if (existing) {
      if (existing.dataset.telegramWebAppLoaded === 'true') finish();
      return;
    }

    script.src = TELEGRAM_WEB_APP_SDK;
    script.async = false;
    script.dataset.telegramWebApp = 'true';
    script.addEventListener('load', () => {
      script.dataset.telegramWebAppLoaded = 'true';
    }, { once: true });
    document.head.appendChild(script);
  });
  return telegramSdkPromise;
}

export function getTelegramInitData(): string | null {
  if (typeof window === 'undefined') return null;
  const telegram = (window as TelegramWindow).Telegram;
  telegram?.WebApp?.ready?.();
  telegram?.WebApp?.expand?.();
  return telegram?.WebApp?.initData || null;
}

export function openTelegramBot(username?: string | null): void {
  const url = `https://t.me/${username || TELEGRAM_BOT_USERNAME}?start=login`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const webApp = (window as TelegramWindow).Telegram?.WebApp;
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(url);
      return;
    }
    window.location.assign(url);
    return;
  }
  void Linking.openURL(url).catch(() => undefined);
}