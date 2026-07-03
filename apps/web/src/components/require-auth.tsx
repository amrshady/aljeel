'use client';

import { useAuth } from '@/components/auth-provider';
import { PageLoading } from '@/components/loading-spinner';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const t = useTranslations('auth');

  if (isLoading) {
    return <PageLoading />;
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold text-primary">{t('accessRequiredTitle')}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('accessRequiredBody')}</p>
        <a
          href="/cdn-cgi/access/login"
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t('signInWithAccess')}
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
