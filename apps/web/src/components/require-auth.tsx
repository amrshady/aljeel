'use client';

import { useAuth } from '@/components/auth-provider';
import { PageLoading } from '@/components/loading-spinner';
import { useRouter } from '@/i18n/routing';
import { useEffect, type ReactNode } from 'react';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return <PageLoading />;
  }

  return <>{children}</>;
}
