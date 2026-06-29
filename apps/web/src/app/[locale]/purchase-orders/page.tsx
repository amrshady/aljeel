'use client';

import { Button } from '@aljeel/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/app-shell';
import { RequireAuth } from '@/components/require-auth';
import { listPurchaseOrders } from '@/lib/purchase-orders-api';
import { Link } from '@/i18n/routing';
import { useState } from 'react';

function PurchaseOrdersContent() {
  const t = useTranslations('purchaseOrders');
  const [status, setStatus] = useState<string>('OPEN');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchase-orders', status, page],
    queryFn: () =>
      listPurchaseOrders({
        status: status === 'ALL' ? undefined : status,
        page: String(page),
      }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(['OPEN', 'CLOSED', 'ALL'] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={status === value ? 'default' : 'outline'}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {t(`filter.${value}`)}
          </Button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-muted-foreground">{t('loading')}</p>}
      {isError && <p className="mt-6 text-destructive">{t('error')}</p>}

      {data && data.data.length === 0 && (
        <p className="mt-6 text-muted-foreground">{t('empty')}</p>
      )}

      {data && data.data.length > 0 && (
        <div className="mt-6 rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-muted-foreground">
                <th className="p-3 font-medium">{t('poNumber')}</th>
                <th className="p-3 font-medium">{t('status')}</th>
                <th className="p-3 font-medium">{t('lines')}</th>
                <th className="p-3 font-medium">{t('currency')}</th>
                <th className="p-3 font-medium">{t('created')}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((po) => (
                <tr key={po.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="p-3">
                    <Link href={`/purchase-orders/${po.id}`} className="font-medium text-primary underline">
                      {po.poNumber}
                    </Link>
                  </td>
                  <td className="p-3">{po.status}</td>
                  <td className="p-3">{po.lineCount}</td>
                  <td className="p-3">{po.currency}</td>
                  <td className="p-3">{new Date(po.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('prev')}
          </Button>
          <span>{t('page', { page, total: totalPages })}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('next')}
          </Button>
        </div>
      )}
    </AppShell>
  );
}

export default function PurchaseOrdersPage() {
  return (
    <RequireAuth>
      <PurchaseOrdersContent />
    </RequireAuth>
  );
}
