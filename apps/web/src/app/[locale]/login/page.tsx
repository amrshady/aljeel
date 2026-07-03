'use client';

import { Button } from '@aljeel/ui';
import { useTranslations } from 'next-intl';
import { AljeelLogo } from '@/components/aljeel-logo';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { SiteFooter } from '@/components/site-footer';

export default function LoginPage() {
  const t = useTranslations('auth');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex justify-end px-6 py-5">
        <LocaleSwitcher />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16 pt-4">
        <div className="w-full max-w-md text-center">
          <AljeelLogo priority />
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-primary">
            {t('title')}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t('cloudflareSubtitle')}
          </p>
          <Button
            size="lg"
            className="mt-8 w-full"
            onClick={() => window.location.assign('/cdn-cgi/access/login')}
          >
            {t('signInWithAccess')}
          </Button>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
