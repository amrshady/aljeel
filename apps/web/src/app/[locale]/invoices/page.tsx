'use client';

import { Button } from '@aljeel/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/app-shell';
import { RequireAuth } from '@/components/require-auth';
import { listInvoices } from '@/lib/invoices-api';
import { Link } from '@/i18n/routing';
import { useState } from 'react';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  SCHEDULED: 'bg-violet-100 text-violet-800',
  PAID: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  ON_HOLD: 'bg-orange-100 text-orange-800',
};

function InvoicesContent() {
  const t = useTranslations('invoices');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoices', 'list', page, status],
    queryFn: () =>
      listInvoices({
        page: String(page),
        pageSize: '10',
        ...(status ? { status } : {}),
      }),
  });

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link href="/invoices/new">
          <Button>{t('newInvoice')}</Button>
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          variant={status === '' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setStatus('');
            setPage(1);
          }}
        >
          {t('all')}
        </Button>
        {(['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PAID', 'REJECTED'] as const).map((s) => (
          <Button
            key={s}
            variant={status === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {t(`status.${s}`)}
          </Button>
        ))}
      </div>

      <div className="mt-6 rounded-xl border bg-card shadow-sm">
        {isLoading ? (
          <p className="p-8 text-center text-muted-foreground">{t('loading')}</p>
        ) : isError ? (
          <p className="p-8 text-center text-destructive">{t('error')}</p>
        ) : !data?.data.length ? (
          <div className="p-12 text-center">
            <p className="font-medium">{t('empty')}</p>
            <Link href="/invoices/new" className="mt-4 inline-block">
              <Button>{t('newInvoice')}</Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y">
            {data.data.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="flex flex-col gap-2 p-4 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{invoice.invoiceNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(invoice.invoiceDate).toLocaleDateString()} · {invoice.currency}{' '}
                      {invoice.total}
                    </p>
                  </div>
                  <span
                    className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[invoice.status] ?? 'bg-muted'}`}
                  >
                    {t(`status.${invoice.status}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <div className="mt-4 flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('prev')}
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            {t('page', { page, total: Math.ceil(data.total / data.pageSize) })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * data.pageSize >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('next')}
          </Button>
        </div>
      )}
    </AppShell>
  );
}

export default function InvoicesPage() {
  return (
    <RequireAuth>
      <InvoicesContent />
    </RequireAuth>
  );
}
