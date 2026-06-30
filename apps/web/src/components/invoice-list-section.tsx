'use client';

import { Button } from '@aljeel/ui';
import { formatBytes } from '@aljeel/kb-upload';
import { isPlaceholderInvoiceNumber } from '@aljeel/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { archiveInvoice, listInvoices } from '@/lib/invoices-api';
import { Link } from '@/i18n/routing';

function formatModified(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function displayName(invoiceNumber: string) {
  return isPlaceholderInvoiceNumber(invoiceNumber)
    ? invoiceNumber.slice('DRAFT-'.length)
    : invoiceNumber;
}

type InvoiceListSectionProps = {
  status: string;
  showArchived: boolean;
};

export function InvoiceListSection({ status, showArchived }: InvoiceListSectionProps) {
  const t = useTranslations('invoices');
  const locale = useLocale();
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

  return (
    <section>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {isLoading ? (
          <p className="p-8 text-center text-muted-foreground">{t('loading')}</p>
        ) : isError ? (
          <p className="p-8 text-center text-destructive">{t('error')}</p>
        ) : !data?.data.length ? (
          <div className="p-12 text-center">
            <p className="font-medium">{t('empty')}</p>
            {!showArchived && (
              <Link href="/invoices/new" className="mt-4 inline-block">
                <Button>{t('newInvoice')}</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-start text-muted-foreground">
                  <th className="p-3 font-medium">{t('columns.name')}</th>
                  <th className="p-3 font-medium">{t('columns.files')}</th>
                  <th className="p-3 font-medium">{t('columns.modified')}</th>
                  <th className="p-3 font-medium">{t('columns.size')}</th>
                  <th className="p-3 font-medium text-end">{t('columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((invoice) => (
                  <tr key={invoice.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-3">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="flex min-w-0 items-center gap-2 font-medium hover:underline"
                      >
                        <span className="text-lg leading-none" aria-hidden>
                          📁
                        </span>
                        <span className="truncate">{displayName(invoice.invoiceNumber)}</span>
                      </Link>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {t('fileCount', { count: invoice.documentCount })}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatModified(invoice.updatedAt, locale)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatBytes(invoice.totalSizeBytes)}
                    </td>
                    <td className="p-3 text-end">
                      {!showArchived && canArchive(invoice.status) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={archiveMutation.isPending}
                          onClick={() => archiveMutation.mutate(invoice.id)}
                        >
                          {archivingId === invoice.id ? t('archiving') : t('archive')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </section>
  );
}
