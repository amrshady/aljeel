'use client';

import { Button } from '@aljeel/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { InvoiceDocuments } from '@/components/invoice-documents';
import { InvoiceTimeline } from '@/components/invoice-timeline';
import { RequireAuth } from '@/components/require-auth';
import { ApiClientError } from '@/lib/api-client';
import { getInvoice, submitInvoice } from '@/lib/invoices-api';
import { Link } from '@/i18n/routing';

function InvoiceDetailContent() {
  const t = useTranslations('invoiceDetail');
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['invoices', params.id],
    queryFn: () => getInvoice(params.id),
  });

  async function onSubmit() {
    if (!invoice) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitInvoice(invoice.id);
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['invoices', params.id] });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('submitError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-muted-foreground">{t('loading')}</p>
      </AppShell>
    );
  }

  if (isError || !invoice) {
    return (
      <AppShell>
        <p className="text-destructive">{t('notFound')}</p>
        <Link href="/invoices" className="mt-4 inline-block text-primary underline">
          {t('back')}
        </Link>
      </AppShell>
    );
  }

  const canSubmit = invoice.status === 'DRAFT' || invoice.status === 'REJECTED';
  const canUploadDocs = !['APPROVED', 'SCHEDULED', 'PAID'].includes(invoice.status);

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/invoices" className="text-sm text-primary underline">
            {t('back')}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(invoice.invoiceDate).toLocaleDateString()} · {t(`status.${invoice.status}`)}
          </p>
        </div>
        {canSubmit && (
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? t('submitting') : t('submit')}
          </Button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('subtotal')}</p>
          <p className="text-xl font-semibold">
            {invoice.currency} {invoice.subtotal}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('vat')}</p>
          <p className="text-xl font-semibold">
            {invoice.currency} {invoice.vat}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('total')}</p>
          <p className="text-xl font-semibold">
            {invoice.currency} {invoice.total}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start text-muted-foreground">
              <th className="p-3 font-medium">{t('description')}</th>
              <th className="p-3 font-medium">{t('qty')}</th>
              <th className="p-3 font-medium">{t('unitPrice')}</th>
              <th className="p-3 font-medium">{t('amount')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-b last:border-0">
                <td className="p-3">{line.description}</td>
                <td className="p-3">{line.qty}</td>
                <td className="p-3">{line.unitPrice}</td>
                <td className="p-3">{line.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InvoiceDocuments invoiceId={invoice.id} editable={canUploadDocs} />

      <div className="mt-8 rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">{t('timeline')}</h2>
        <div className="mt-4">
          <InvoiceTimeline events={invoice.timeline} />
        </div>
      </div>

      {invoice.rejectionReason && (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">{t('rejectionReason')}</p>
          <p className="mt-1">{invoice.rejectionReason}</p>
        </div>
      )}
    </AppShell>
  );
}

export default function InvoiceDetailPage() {
  return (
    <RequireAuth>
      <InvoiceDetailContent />
    </RequireAuth>
  );
}
