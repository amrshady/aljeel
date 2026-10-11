'use client';

import { ASATEEL_REGION_CODES } from '@aljeel/shared-types';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { AppShell } from '@/components/app-shell';
import { PageLoading } from '@/components/loading-spinner';
import { RequireAuth } from '@/components/require-auth';
import { RequireRole } from '@/components/require-role';
import { Link } from '@/i18n/routing';
import { listSignatureBatches } from '@/lib/signatures-api';

function SignaturesContent() {
  const t = useTranslations('signatures');
  const tRegion = useTranslations('invoiceForm.asateelRegions');
  const locale = useLocale();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['signatures'],
    queryFn: listSignatureBatches,
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        {isLoading ? <PageLoading /> : null}
        {isError ? <p className="text-sm text-destructive">{t('loadError')}</p> : null}
        {data && data.length === 0 ? (
          <section className="rounded-xl border border-dashed bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          </section>
        ) : null}
        {data && data.length > 0 ? (
          <ul className="space-y-3">
            {data.map((batch) => (
              <li key={batch.id}>
                <Link
                  href={`/signatures/${batch.id}`}
                  className="block rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{batch.invoiceNumber}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{batch.supplierName}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('progress', { signed: batch.signedCount, total: batch.invoiceCount })}
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {batch.asateelRegion
                      ? `${tRegion(batch.asateelRegion, {
                          code: ASATEEL_REGION_CODES[batch.asateelRegion],
                        })} · `
                      : ''}
                    {t('submitted', {
                      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                        new Date(batch.updatedAt),
                      ),
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function SignaturesPage() {
  return (
    <RequireAuth>
      <RequireRole roles={['ASATEEL_SIGNER']}>
        <SignaturesContent />
      </RequireRole>
    </RequireAuth>
  );
}
