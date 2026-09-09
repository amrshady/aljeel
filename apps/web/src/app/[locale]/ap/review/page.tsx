'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import {
  InvoiceFolderPagination,
  InvoiceFolderTable,
  type InvoiceFolderRow,
} from '@/components/invoice-folder-table';
import { RequireAuth } from '@/components/require-auth';
import { RequireRole } from '@/components/require-role';
import { listApExceptions } from '@/lib/ap-api';

type ApReviewTab = 'queue' | 'approved' | 'rejected';

const TABS: { id: ApReviewTab; labelKey: 'tabQueue' | 'tabApproved' | 'tabRejected' }[] = [
  { id: 'queue', labelKey: 'tabQueue' },
  { id: 'approved', labelKey: 'tabApproved' },
  { id: 'rejected', labelKey: 'tabRejected' },
];

const SEARCH_DEBOUNCE_MS = 300;

function ApReviewContent() {
  const t = useTranslations('apReview');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<ApReviewTab>('queue');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const { data: queue, isLoading } = useQuery({
    queryKey: ['ap', 'exceptions', tab, page, searchQuery],
    queryFn: () =>
      listApExceptions({
        view: tab === 'queue' ? 'queue' : 'processed',
        ...(tab === 'rejected' ? { outcome: 'rejected' } : {}),
        page: String(page),
        pageSize: '10',
        ...(searchQuery ? { q: searchQuery } : {}),
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

  const selectTab = (nextTab: ApReviewTab) => {
    setTab(nextTab);
    setPage(1);
  };

  const invoiceHref = (id: string) =>
    searchQuery ? `/invoices/${id}?q=${encodeURIComponent(searchQuery)}` : `/invoices/${id}`;

  const emptyMessage = searchQuery
    ? t('emptySearch')
    : tab === 'approved'
      ? t('emptyProcessedApproved')
      : tab === 'rejected'
        ? t('emptyProcessedRejected')
        : t('empty');

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-b border-[#E5E7EB]">
        <div className="flex">
          {TABS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={`px-1 pb-3 text-sm font-medium ${
                index > 0 ? 'ms-6' : ''
              } ${
                tab === item.id
                  ? 'border-b-2 border-[#2563EB] text-[#0B1F3A]'
                  : 'text-[#6B7280] hover:text-foreground'
              }`}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
        <label className="relative mb-2 w-full sm:mb-2.5 sm:w-72">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            maxLength={200}
            className="w-full rounded-md border bg-background py-1.5 ps-8 pe-3 text-sm"
          />
        </label>
      </div>

      {isLoading && <p className="mt-6 text-muted-foreground">{t('loading')}</p>}

      {!isLoading && queue?.data.length === 0 && (
        <p className="mt-6 text-muted-foreground">{emptyMessage}</p>
      )}

      {queue && queue.data.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border bg-card shadow-sm">
          <InvoiceFolderTable
            rows={rows}
            isLoading={isLoading}
            linkHref={invoiceHref}
            showSupplier
            showSize={false}
            highlightQuery={searchQuery}
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
