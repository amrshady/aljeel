'use client';

import { AuthMeResponseSchema, AuthTokensSchema, LoginRequestSchema } from '@aljeel/shared-types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';

interface AuthState {
  user: ReturnType<typeof AuthMeResponseSchema.parse> | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<ReturnType<typeof AuthMeResponseSchema.parse>>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function storeTokens(tokens: { accessToken: string; refreshToken: string }) {
  localStorage.setItem('access_token', tokens.accessToken);
  localStorage.setItem('refresh_token', tokens.refreshToken);
}

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState['user']>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    try {
      const me = await apiFetch('/auth/me', { schema: AuthMeResponseSchema });
      setUser(me);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const login = useCallback(async (email: string, password: string) => {
    const dto = LoginRequestSchema.parse({ email, password });
    const tokens = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(dto),
      schema: AuthTokensSchema,
    });
    storeTokens(tokens);
    const me = await apiFetch('/auth/me', { schema: AuthMeResponseSchema });
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
