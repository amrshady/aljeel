'use client';

import { useAuth } from '@/components/auth-provider';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations('dashboard');

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  return <>{children}</>;
}
