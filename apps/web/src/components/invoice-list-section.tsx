'use client';

import { Button } from '@aljeel/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { archiveInvoice, listInvoices } from '@/lib/invoices-api';
import { Link } from '@/i18n/routing';
import {
  InvoiceFolderPagination,
  InvoiceFolderTable,
  type InvoiceFolderRow,
} from './invoice-folder-table';

type InvoiceListSectionProps = {
  status: string;
  showArchived: boolean;
  onShowDrafts?: () => void;
};

export function InvoiceListSection({ status, showArchived, onShowDrafts }: InvoiceListSectionProps) {
  const t = useTranslations('invoices');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [status, showArchived]);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoices', 'list', page, status, showArchived],
    queryFn: () =>
      listInvoices({
        page: String(page),
        pageSize: '10',
        archived: showArchived ? 'true' : 'false',
        ...(status ? { status } : {}),
      }),
  });

  const { data: drafts } = useQuery({
    queryKey: ['invoices', 'list', 'unfinished-drafts'],
    queryFn: () =>
      listInvoices({
        page: '1',
        pageSize: '5',
        status: 'DRAFT',
        archived: 'false',
        sort: '-updatedAt',
      }),
    enabled: !showArchived && status !== 'DRAFT',
  });

  const archiveMutation = useMutation({
    mutationFn: archiveInvoice,
    onMutate: (id) => setArchivingId(id),
    onSettled: () => setArchivingId(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  function canArchive(invoiceStatus: string) {
    return invoiceStatus === 'DRAFT' || invoiceStatus === 'REJECTED';
  }

  const rows: InvoiceFolderRow[] =
    data?.data.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      documentCount: invoice.documentCount,
      totalSizeBytes: invoice.totalSizeBytes,
      updatedAt: invoice.updatedAt,
      status: invoice.status,
    })) ?? [];

  return (
    <section className="space-y-4">
      {!showArchived && status !== 'DRAFT' && drafts && drafts.data.length > 0 && (
        <section className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="rounded-lg bg-[#1E40AF]/10 p-2 text-[#1E40AF]">
                <FileWarning className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-[#1E40AF]">
                  {t('unfinishedTitle', { count: drafts.total })}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('unfinishedHint')}</p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onShowDrafts}
              className="shrink-0"
            >
              {t('viewDrafts')}
            </Button>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-[#E5E7EB]">
            <InvoiceFolderTable
              rows={drafts.data.map((invoice) => ({
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                documentCount: invoice.documentCount,
                totalSizeBytes: invoice.totalSizeBytes,
                updatedAt: invoice.updatedAt,
                status: invoice.status,
              }))}
              linkHref={(id) => `/invoices/${id}`}
              showSize
              showStatus
              renderActions={(row) => (
                <Link href={`/invoices/${row.id}`}>
                  <Button type="button" size="sm">
                    {t('resume')}
                  </Button>
                </Link>
              )}
            />
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <InvoiceFolderTable
          rows={rows}
          isLoading={isLoading}
          isError={isError}
          linkHref={(id) => `/invoices/${id}`}
          showSize
          emptyContent={
            <div className="p-12 text-center">
              <p className="font-medium">{t('empty')}</p>
              {!showArchived && (
                <Link href="/invoices/new" className="mt-4 inline-block">
                  <Button>{t('newInvoice')}</Button>
                </Link>
              )}
            </div>
          }
          renderActions={
            !showArchived
              ? (row) =>
                  canArchive(row.status ?? '') ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={archiveMutation.isPending}
                      onClick={() => archiveMutation.mutate(row.id)}
                    >
                      {archivingId === row.id ? t('archiving') : t('archive')}
                    </Button>
                  ) : null
              : undefined
          }
        />
      </div>

      {data && (
        <InvoiceFolderPagination
          page={page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      )}
    </section>
  );
}
