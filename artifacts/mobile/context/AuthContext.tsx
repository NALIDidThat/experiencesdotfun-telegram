import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthenticateTelegram, type User } from '@workspace/api-client-react';
import {
  clearStoredInitData,
  getStoredInitData,
  getTelegramInitData,
  loadTelegramWebApp,
  openTelegramBot,
  saveInitData,
} from '@/lib/telegram';

type AuthContextValue = {
  user: User | null;
  initData: string | null;
  loading: boolean;
  telegramAvailable: boolean;
  inTelegram: boolean;
  authError: string | null;
  refresh: () => Promise<boolean>;
  login: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  initData: null,
  loading: true,
  telegramAvailable: false,
  inTelegram: false,
  authError: null,
  refresh: async () => false,
  login: async () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initData, setInitData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const authenticate = useAuthenticateTelegram();
  const authenticateRef = useRef(authenticate);
  authenticateRef.current = authenticate;

  const authenticateWith = useCallback(async (candidate: string | null, reportMissing = true) => {
    if (!candidate) {
      if (reportMissing) {
        setAuthError('Telegram login data is unavailable. Open the app from the Experiences.fun bot.');
      }
      setLoading(false);
      return false;
    }
    setLoading(true);
    setAuthError(null);
    try {
      const response = await authenticateRef.current.mutateAsync({ data: { initData: candidate } });
      await saveInitData(candidate);
      setInitData(candidate);
      setUser(response.user);
      return true;
    } catch (error) {
      setUser(null);
      setInitData(null);
      await clearStoredInitData();
      const message = (error as { data?: { message?: string } })?.data?.message;
      setAuthError(message ?? 'Telegram login failed. Reopen the Mini App and try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async () => {
    await loadTelegramWebApp();
    const liveData = getTelegramInitData();
    const storedData = liveData ? null : await getStoredInitData();
    const authenticated = await authenticateWith(liveData ?? storedData);
    if (!authenticated) openTelegramBot();
    return authenticated;
  }, [authenticateWith]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadTelegramWebApp();
      const liveData = getTelegramInitData();
      const storedData = liveData ? null : await getStoredInitData();
      if (active) await authenticateWith(liveData ?? storedData, false);
    })();
    return () => {
      active = false;
    };
  }, [authenticateWith]);

  const value = useMemo(
    () => ({
      user,
      initData,
      loading,
      telegramAvailable: Boolean(getTelegramInitData() || initData),
      inTelegram: Boolean(getTelegramInitData()),
      authError,
      refresh: async () => {
        const latest = getTelegramInitData() ?? initData;
        return authenticateWith(latest);
      },
      login,
    }),
    [user, initData, loading, authError, authenticateWith, login],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}