'use client';

import type { UserRole } from '@aljeel/shared-types';
import { Button } from '@aljeel/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApReviewActions } from '@/components/ap-review-actions';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/components/auth-provider';
import { DocumentEvidenceViewer } from '@/components/document-evidence-viewer';
import { InvoiceDocuments } from '@/components/invoice-documents';
import { InvoiceTimeline } from '@/components/invoice-timeline';
import { RequireAuth } from '@/components/require-auth';
import { ApiClientError } from '@/lib/api-client';
import { getApInvoice } from '@/lib/ap-api';
import { getInvoice, listInvoiceDocuments, submitInvoice } from '@/lib/invoices-api';
import { Link } from '@/i18n/routing';

const AP_ROLES = new Set<UserRole>(['AP_CLERK', 'AP_APPROVER']);

function InvoiceDetailContent() {
  const t = useTranslations('invoiceDetail');
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isApUser = !!(user && AP_ROLES.has(user.role));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['invoices', params.id, isApUser ? 'ap' : 'supplier'],
    queryFn: () =>
      isApUser ? getApInvoice(params.id) : getInvoice(params.id),
    enabled: !!user,
  });

  const { data: documents } = useQuery({
    queryKey: ['invoices', params.id, 'documents'],
    queryFn: () => listInvoiceDocuments(params.id),
    enabled: !!params.id,
  });

  useEffect(() => {
    const first = documents?.[0];
    if (!selectedDocumentId && first) {
      setSelectedDocumentId(first.id);
    }
  }, [documents, selectedDocumentId]);

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
        <Link
          href={isApUser ? '/ap/review' : '/dashboard'}
          className="mt-4 inline-block text-primary underline"
        >
          {isApUser ? t('backToReview') : t('back')}
        </Link>
      </AppShell>
    );
  }

  const canSubmit = !isApUser && (invoice.status === 'DRAFT' || invoice.status === 'REJECTED');
  const canUploadDocs =
    !isApUser && !['APPROVED', 'SCHEDULED', 'PAID'].includes(invoice.status);
  const supplierName = 'supplierName' in invoice ? invoice.supplierName : undefined;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={isApUser ? '/ap/review' : '/dashboard'}
            className="text-sm text-primary underline"
          >
            {isApUser ? t('backToReview') : t('back')}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {supplierName ? `${supplierName} · ` : ''}
            {new Date(invoice.invoiceDate).toLocaleDateString()} ·{' '}
            {t(`status.${invoice.status}`)}
          </p>
        </div>
        {canSubmit && (
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? t('submitting') : t('submit')}
          </Button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {invoice.rejectionReason && (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <p className="font-medium">{t('rejectionReason')}</p>
          <p className="mt-1">{invoice.rejectionReason}</p>
        </div>
      )}

      {isApUser && (
        <div className="mt-6">
          <ApReviewActions invoiceId={invoice.id} status={invoice.status} />
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t('documentsTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('documentsHint')}</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <InvoiceDocuments
            invoiceId={invoice.id}
            editable={canUploadDocs}
            viewable
            compact
            selectedDocumentId={selectedDocumentId}
            onSelectDocument={setSelectedDocumentId}
          />
          <DocumentEvidenceViewer
            documentId={selectedDocumentId}
            className="min-h-[min(80vh,900px)]"
          />
        </div>
      </section>

      <div className="mt-8 rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold">{t('timeline')}</h2>
        <div className="mt-4">
          <InvoiceTimeline events={invoice.timeline} />
        </div>
      </div>
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
