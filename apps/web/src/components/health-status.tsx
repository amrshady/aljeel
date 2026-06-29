'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { getHealth } from '@/lib/api-client';

export function HealthStatus() {
  const t = useTranslations('health');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {t('checking')}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {t('error')}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 text-sm">
      <p className="font-medium">{t('ok')}</p>
      <p className="mt-1 text-muted-foreground">
        v{data.version} · {new Date(data.timestamp).toLocaleString()}
      </p>
    </div>
  );
}
