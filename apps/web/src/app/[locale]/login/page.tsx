'use client';

import { Button } from '@aljeel/ui';
import { useTranslations } from 'next-intl';
import { AljeelLogo } from '@/components/aljeel-logo';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { SiteFooter } from '@/components/site-footer';
import { useRouter } from '@/i18n/routing';

const devAuth = process.env.NEXT_PUBLIC_AUTH_DEV_MODE === 'true';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex h-1.5" dir="ltr" aria-hidden="true">
        <div className="flex-1 bg-denim" />
        <div className="flex-1 bg-pimento" />
      </div>
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
            {devAuth ? t('devSubtitle') : t('cloudflareSubtitle')}
          </p>
          <Button
            size="lg"
            className="mt-8 w-full"
            onClick={() => {
              if (devAuth) {
                router.push('/dashboard');
                return;
              }
              window.location.assign('/cdn-cgi/access/login');
            }}
          >
            {devAuth ? t('continueLocal') : t('signInWithAccess')}
          </Button>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
