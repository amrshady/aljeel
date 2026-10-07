'use client';

import { useAuth } from '@/components/auth-provider';
import { PageLoading } from '@/components/loading-spinner';
import { SiteFooter } from '@/components/site-footer';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

const devAuth = process.env.NEXT_PUBLIC_AUTH_DEV_MODE === 'true';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading, reload } = useAuth();
  const t = useTranslations('auth');

  if (isLoading) {
    return <PageLoading />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="flex h-1.5" dir="ltr" aria-hidden="true">
          <div className="flex-1 bg-denim" />
          <div className="flex-1 bg-pimento" />
        </div>
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold text-primary">{t('accessRequiredTitle')}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {devAuth ? t('devAccessRequiredBody') : t('accessRequiredBody')}
          </p>
          {devAuth ? (
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {t('continueLocal')}
            </button>
          ) : (
            <a
              href="/cdn-cgi/access/login"
              className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {t('signInWithAccess')}
            </a>
          )}
        </div>
        <SiteFooter />
      </div>
    );
  }

  return <>{children}</>;
}
