'use client';

import { Button } from '@aljeel/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
};

export function InvoiceListSection({ status, showArchived }: InvoiceListSectionProps) {
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
    <section>
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
