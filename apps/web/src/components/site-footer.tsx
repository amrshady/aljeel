'use client';

import { useTranslations } from 'next-intl';

export function SiteFooter() {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-6 text-center text-xs text-muted-foreground">
        <p>{t('copyright', { year })}</p>
        <p className="mt-1">{t('rights')}</p>
      </div>
    </footer>
  );
}
