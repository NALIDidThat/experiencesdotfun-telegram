import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuthenticateTelegram, type User } from '@workspace/api-client-react';
import { getStoredInitData, getTelegramInitData, saveInitData } from '@/lib/telegram';

type AuthContextValue = {
  user: User | null;
  initData: string | null;
  loading: boolean;
  telegramAvailable: boolean;
  inTelegram: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  initData: null,
  loading: true,
  telegramAvailable: false,
  inTelegram: false,
  refresh: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initData, setInitData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const authenticate = useAuthenticateTelegram();

  const authenticateWith = async (candidate: string | null) => {
    if (!candidate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await authenticate.mutateAsync({ data: { initData: candidate } });
      await saveInitData(candidate);
      setInitData(candidate);
      setUser(response.user);
    } catch {
      setUser(null);
      setInitData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const liveData = getTelegramInitData();
      const storedData = await getStoredInitData();
      if (active) await authenticateWith(liveData ?? storedData);
    })();
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      initData,
      loading,
      telegramAvailable: Boolean(getTelegramInitData() || initData),
      inTelegram: Boolean(getTelegramInitData()),
      refresh: async () => {
        const latest = getTelegramInitData() ?? initData;
        await authenticateWith(latest);
      },
    }),
    [user, initData, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}