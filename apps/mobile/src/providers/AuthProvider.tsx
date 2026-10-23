import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BRAND, type AuthUser } from '@demo/shared';
import { api, setCurrentToken, setUnauthorizedHandler } from '../lib/config';

const STORAGE_KEY = 'hydro-one-demo-auth';

interface AuthState {
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { token: string; user: AuthUser };
          if (saved.user?.role === 'CUSTOMER') {
            setCurrentToken(saved.token);
            setToken(saved.token);
            setUser(saved.user);
          }
        }
      } catch {
        // storage unavailable (private window etc.) — start signed out
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const logout = useCallback(async () => {
    setCurrentToken(null);
    setToken(null);
    setUser(null);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email: email.trim().toLowerCase(), password });
    if (res.user.role !== 'CUSTOMER') {
      throw new Error(`This app is for customers. Staff should use the ${BRAND.staffProductName} web app.`);
    }
    setCurrentToken(res.token);
    setToken(res.token);
    setUser(res.user);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(res));
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ ready, token, user, login, logout }), [ready, token, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
