'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import {
  InvoiceFolderPagination,
  InvoiceFolderTable,
  type InvoiceFolderRow,
} from '@/components/invoice-folder-table';
import { RequireAuth } from '@/components/require-auth';
import { RequireRole } from '@/components/require-role';
import { listApExceptions } from '@/lib/ap-api';

function ApReviewContent() {
  const t = useTranslations('apReview');
  const [page, setPage] = useState(1);

  const { data: queue, isLoading } = useQuery({
    queryKey: ['ap', 'exceptions', page],
    queryFn: () =>
      listApExceptions({
        page: String(page),
        pageSize: '10',
      }),
  });

  const rows: InvoiceFolderRow[] =
    queue?.data.map((item) => ({
      id: item.id,
      invoiceNumber: item.invoiceNumber,
      documentCount: item.documentCount,
      totalSizeBytes: item.totalSizeBytes,
      updatedAt: item.updatedAt,
      supplierName: item.supplierName,
    })) ?? [];

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

      {isLoading && <p className="mt-6 text-muted-foreground">{t('loading')}</p>}

      {!isLoading && queue?.data.length === 0 && (
        <p className="mt-6 text-muted-foreground">{t('empty')}</p>
      )}

      {queue && queue.data.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border bg-card shadow-sm">
          <InvoiceFolderTable
            rows={rows}
            isLoading={isLoading}
            linkHref={(id) => `/invoices/${id}`}
            showSupplier
            showSize={false}
          />
          <div className="border-t px-3 py-2">
            <InvoiceFolderPagination
              page={page}
              pageSize={queue.pageSize}
              total={queue.total}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function ApReviewPage() {
  return (
    <RequireAuth>
      <RequireRole roles={['AP_CLERK', 'AP_APPROVER']}>
        <ApReviewContent />
      </RequireRole>
    </RequireAuth>
  );
}
