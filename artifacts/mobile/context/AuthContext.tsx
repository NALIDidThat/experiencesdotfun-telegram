import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAuthenticateTelegram,
  getMe,
  useLoginWithEmail,
  useSignUpWithEmail,
  type AuthResponse,
  type User,
  type UserType,
} from '@workspace/api-client-react';
import {
  getTelegramInitData,
  isTelegramMiniApp,
  loadTelegramWebApp,
} from '@/lib/telegram';
import { clearStoredAuthToken, getStoredAuthToken, saveAuthToken } from '@/lib/auth-storage';

type AuthContextValue = {
  user: User | null;
  initData: string | null;
  loading: boolean;
  telegramAvailable: boolean;
  inTelegram: boolean;
  authError: string | null;
  clearAuthError: () => void;
  refresh: () => Promise<boolean>;
  signOut: () => Promise<void>;
  login: (accountType?: UserType) => Promise<boolean>;
  activateProfileSession: (response: AuthResponse) => Promise<boolean>;
  loginWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (name: string, username: string, email: string, password: string, accountType: UserType) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  initData: null,
  loading: true,
  telegramAvailable: false,
  inTelegram: false,
  authError: null,
  clearAuthError: () => {},
  refresh: async () => false,
  signOut: async () => {},
  login: async () => false,
  activateProfileSession: async () => false,
  loginWithEmail: async () => false,
  signUpWithEmail: async () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [initData, setInitData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const clearAuthError = useCallback(() => setAuthError(null), []);
  const refresh = useCallback(async () => {
    try {
      const currentUser = await getMe();
      setUser(currentUser);
      return true;
    } catch {
      return false;
    }
  }, []);
  const signOut = useCallback(async () => {
    await clearStoredAuthToken();
    queryClient.clear();
    setUser(null);
    setInitData(null);
    setAuthError(null);
  }, [queryClient]);
  const authenticate = useAuthenticateTelegram();
  const authenticateRef = useRef(authenticate);
  authenticateRef.current = authenticate;
  const emailLoginMutation = useLoginWithEmail();
  const emailLoginRef = useRef(emailLoginMutation);
  emailLoginRef.current = emailLoginMutation;
  const emailSignupMutation = useSignUpWithEmail();
  const emailSignupRef = useRef(emailSignupMutation);
  emailSignupRef.current = emailSignupMutation;

  const authenticateWith = useCallback(async (
    candidate: string | null,
    reportMissing = true,
    preserveExistingSession = false,
    accountType?: UserType,
  ) => {
    if (!candidate) {
      if (reportMissing) {
        setAuthError(isTelegramMiniApp()
          ? 'Telegram opened Experiences.fun without sign-in data. Close the Mini App and reopen it from the official bot.'
          : 'Telegram sign-in data is unavailable. Open Experiences.fun from the official bot, or use email.');
      }
      setLoading(false);
      return false;
    }
    setLoading(true);
    setAuthError(null);
    try {
      const response = await authenticateRef.current.mutateAsync({
        data: { initData: candidate, ...(accountType ? { userType: accountType } : {}) },
      });
      if (!response.sessionToken) {
        throw new Error('Telegram sign-in did not create a profile session.');
      }
      queryClient.clear();
      await saveAuthToken(response.sessionToken);
      setInitData(candidate);
      setUser(response.user);
      return true;
    } catch (error) {
      if (!preserveExistingSession) {
        setUser(null);
        setInitData(null);
        await clearStoredAuthToken();
      }
      const message = (error as { data?: { message?: string } })?.data?.message;
      setAuthError(message ?? 'Telegram login failed. Reopen the Mini App and try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  const completeEmailAuth = useCallback(async (response: AuthResponse) => {
    if (!response.sessionToken) {
      setAuthError('Email login did not return a valid session. Please try again.');
      setLoading(false);
      return false;
    }
    await saveAuthToken(response.sessionToken);
    setInitData(null);
    setUser(response.user);
    setAuthError(null);
    setLoading(false);
    return true;
  }, []);

  const activateProfileSession = useCallback(async (response: AuthResponse) => {
    if (!response.sessionToken) {
      setAuthError('Profile switching did not return a valid session. Please try again.');
      return false;
    }
    queryClient.clear();
    await saveAuthToken(response.sessionToken);
    setInitData(null);
    setUser(response.user);
    setAuthError(null);
    return true;
  }, [queryClient]);

  const restoreStoredSession = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = await getMe();
      setInitData(null);
      setUser(currentUser);
      setAuthError(null);
      return true;
    } catch {
      await clearStoredAuthToken();
      setUser(null);
      setInitData(null);
      setAuthError('Your saved session has expired. Sign in again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      return await completeEmailAuth(await emailLoginRef.current.mutateAsync({ data: { email, password } }));
    } catch (error) {
      const message = (error as { data?: { message?: string } })?.data?.message;
      setAuthError(message ?? 'Email login failed. Check your details and try again.');
      setLoading(false);
      return false;
    }
  }, [completeEmailAuth]);

  const signUpWithEmail = useCallback(async (name: string, username: string, email: string, password: string, accountType: UserType) => {
    setLoading(true);
    setAuthError(null);
    try {
      return await completeEmailAuth(await emailSignupRef.current.mutateAsync({
        data: { name, username, email, password, userType: accountType },
      }));
    } catch (error) {
      const message = (error as { data?: { message?: string } })?.data?.message;
      setAuthError(message ?? 'We could not create your account. Please try again.');
      setLoading(false);
      return false;
    }
  }, [completeEmailAuth]);

  const login = useCallback(async (accountType?: UserType) => {
    await loadTelegramWebApp();
    const liveData = getTelegramInitData();
    const storedData = liveData ? null : await getStoredAuthToken();
    if (!liveData && storedData?.startsWith('email_')) {
      return restoreStoredSession();
    }
    return authenticateWith(liveData ?? storedData, true, Boolean(user), accountType);
  }, [authenticateWith, restoreStoredSession, user]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadTelegramWebApp();
      const storedData = await getStoredAuthToken();
      if (!active) return;
      if (!storedData) {
        setLoading(false);
        return;
      }
      if (storedData.startsWith('email_') || storedData.startsWith('telegram_')) {
        await restoreStoredSession();
        return;
      }
      await authenticateWith(storedData, false);
    })();
    return () => {
      active = false;
    };
  }, [authenticateWith, restoreStoredSession]);

  const value = useMemo(
    () => ({
      user,
      initData,
      loading,
      telegramAvailable: isTelegramMiniApp() || Boolean(initData),
      inTelegram: isTelegramMiniApp(),
      authError,
      clearAuthError,
      refresh,
      signOut,
      login,
      activateProfileSession,
      loginWithEmail,
      signUpWithEmail,
    }),
    [user, initData, loading, authError, clearAuthError, refresh, signOut, login, activateProfileSession, loginWithEmail, signUpWithEmail],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}