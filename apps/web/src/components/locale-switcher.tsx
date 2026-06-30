'use client';

import { Button } from '@aljeel/ui';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('locale');

  const nextLocale = locale === 'en' ? 'ar' : 'en';

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={() => router.replace(pathname, { locale: nextLocale })}
    >
      {t('switch')}
    </Button>
  );
}
