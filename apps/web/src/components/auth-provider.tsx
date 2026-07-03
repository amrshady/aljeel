'use client';

import { AuthMeResponseSchema, type AuthMeResponse } from '@aljeel/shared-types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';

interface AuthState {
  user: AuthMeResponse | null;
  isLoading: boolean;
  logout: () => void;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState['user']>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const me = await apiFetch('/auth/me', { schema: AuthMeResponseSchema });
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const logout = useCallback(() => {
    setUser(null);
    window.location.assign('/cdn-cgi/access/logout');
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, logout, reload: loadUser }),
    [user, isLoading, logout, loadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
