'use client';

import { Button } from '@aljeel/ui';
import { formatBytes } from '@aljeel/kb-upload';
import { isPlaceholderInvoiceNumber } from '@aljeel/shared-types';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link, useRouter } from '@/i18n/routing';

export type InvoiceFolderRow = {
  id: string;
  invoiceNumber: string;
  documentCount: number;
  totalSizeBytes: number;
  updatedAt: string;
  status?: string;
  supplierName?: string;
};

function formatModified(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function displayInvoiceName(invoiceNumber: string) {
  return isPlaceholderInvoiceNumber(invoiceNumber)
    ? invoiceNumber.slice('DRAFT-'.length)
    : invoiceNumber;
}

type InvoiceFolderTableProps = {
  rows: InvoiceFolderRow[];
  isLoading?: boolean;
  isError?: boolean;
  emptyContent?: ReactNode;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  linkHref?: (id: string) => string;
  showSupplier?: boolean;
  showStatus?: boolean;
  showSize?: boolean;
  statusNamespace?: 'invoices' | 'apReview';
  renderActions?: (row: InvoiceFolderRow) => ReactNode;
};

export function InvoiceFolderTable({
  rows,
  isLoading,
  isError,
  emptyContent,
  selectedId,
  onSelect,
  linkHref,
  showSupplier = false,
  showStatus = false,
  showSize = true,
  statusNamespace = 'invoices',
  renderActions,
}: InvoiceFolderTableProps) {
  const t = useTranslations('invoices');
  const tStatus = useTranslations(statusNamespace);
  const locale = useLocale();
  const router = useRouter();
  const navigateOnRow = !!(linkHref && !onSelect);

  if (isLoading) {
    return <p className="p-8 text-center text-muted-foreground">{t('loading')}</p>;
  }

  if (isError) {
    return <p className="p-8 text-center text-destructive">{t('error')}</p>;
  }

  if (rows.length === 0) {
    return emptyContent ?? <p className="p-8 text-center text-muted-foreground">{t('empty')}</p>;
  }

  const nameCell = (row: InvoiceFolderRow) => {
    const label = (
      <span className="flex min-w-0 items-center gap-2 font-medium">
        <span className="text-lg leading-none" aria-hidden>
          📁
        </span>
        <span className="truncate">{displayInvoiceName(row.invoiceNumber)}</span>
      </span>
    );

    if (linkHref) {
      return (
        <Link href={linkHref(row.id)} className="hover:underline">
          {label}
        </Link>
      );
    }

    return label;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col />
          {showSupplier && <col className="w-[12rem]" />}
          <col className="w-[6rem]" />
          <col className="w-[11rem]" />
          {showSize && <col className="w-[6rem]" />}
          {showStatus && <col className="w-[8rem]" />}
          {renderActions && <col className="w-[7rem]" />}
        </colgroup>
        <thead>
          <tr className="border-b bg-muted/40 text-muted-foreground">
            <th className="p-3 text-start font-medium">{t('columns.name')}</th>
            {showSupplier && (
              <th className="p-3 text-start font-medium">{t('columns.supplier')}</th>
            )}
            <th className="p-3 text-start font-medium">{t('columns.files')}</th>
            <th className="p-3 text-start font-medium">{t('columns.modified')}</th>
            {showSize && <th className="p-3 text-start font-medium">{t('columns.size')}</th>}
            {showStatus && <th className="p-3 text-start font-medium">{t('columns.status')}</th>}
            {renderActions && (
              <th className="p-3 text-end font-medium">{t('columns.actions')}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b last:border-0 hover:bg-muted/50 ${
                onSelect || navigateOnRow ? 'cursor-pointer' : ''
              } ${selectedId === row.id ? 'bg-muted' : ''}`}
              onClick={
                onSelect
                  ? () => onSelect(row.id)
                  : navigateOnRow && linkHref
                    ? () => router.push(linkHref(row.id))
                    : undefined
              }
            >
              <td className="p-3 text-start">{nameCell(row)}</td>
              {showSupplier && (
                <td className="p-3 text-start text-muted-foreground">{row.supplierName}</td>
              )}
              <td className="p-3 text-start text-muted-foreground">
                {t('fileCount', { count: row.documentCount })}
              </td>
              <td className="p-3 text-start text-muted-foreground whitespace-nowrap">
                {formatModified(row.updatedAt, locale)}
              </td>
              {showSize && (
                <td className="p-3 text-start text-muted-foreground">
                  {formatBytes(row.totalSizeBytes)}
                </td>
              )}
              {showStatus && (
                <td className="p-3 text-start">{row.status && tStatus(`status.${row.status}`)}</td>
              )}
              {renderActions && (
                <td className="p-3 text-end" onClick={(e) => e.stopPropagation()}>
                  {renderActions(row)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InvoiceFolderPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations('invoices');
  const totalPages = Math.ceil(total / pageSize);

  if (total <= pageSize) {
    return null;
  }

  return (
    <div className="mt-4 flex justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t('prev')}
      </Button>
      <span className="flex items-center text-sm text-muted-foreground">
        {t('page', { page, total: totalPages })}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page * pageSize >= total}
        onClick={() => onPageChange(page + 1)}
      >
        {t('next')}
      </Button>
    </div>
  );
}
