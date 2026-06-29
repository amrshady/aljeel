import { Button } from '@aljeel/ui';
import { useTranslations } from 'next-intl';
import { HealthStatus } from '@/components/health-status';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Link } from '@/i18n/routing';

export default function HomePage() {
  const t = useTranslations('app');

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <LocaleSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        <section className="space-y-6 text-center">
          <h2 className="text-4xl font-bold tracking-tight">{t('title')}</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{t('tagline')}</p>
          <div className="flex justify-center gap-4">
            <Link href="/login">
              <Button size="lg">{t('getStarted')}</Button>
            </Link>
            <Button variant="outline" size="lg">
              {t('learnMore')}
            </Button>
          </div>
        </section>

        <section className="mt-16 max-w-md mx-auto">
          <HealthStatus />
        </section>
      </main>
    </div>
  );
}
