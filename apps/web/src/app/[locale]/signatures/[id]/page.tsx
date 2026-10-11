'use client';

import { ASATEEL_REGION_CODES } from '@aljeel/shared-types';
import { Button } from '@aljeel/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { DocumentEvidenceViewer } from '@/components/document-evidence-viewer';
import { displayInvoiceName } from '@/components/invoice-folder-table';
import { InvoiceDocuments } from '@/components/invoice-documents';
import { PageLoading } from '@/components/loading-spinner';
import { RequireAuth } from '@/components/require-auth';
import { RequireRole } from '@/components/require-role';
import { Link, useRouter } from '@/i18n/routing';
import { ApiClientError } from '@/lib/api-client';
import { listInvoiceDocuments } from '@/lib/invoices-api';
import {
  approveSignatureBatch,
  approveSignatureLine,
  finishSignatureBatch,
  getSignatureBatch,
  rejectSignatureBatch,
  revokeSignatureLine,
} from '@/lib/signatures-api';

function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        on ? 'justify-end bg-emerald-600' : 'justify-start bg-[#D1D5DB]'
      }`}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
    </span>
  );
}

function SignatureBatchContent() {
  const t = useTranslations('signatures');
  const tDetail = useTranslations('invoiceDetail');
  const tRegion = useTranslations('invoiceForm.asateelRegions');
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pendingNo, setPendingNo] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['signatures', params.id],
    queryFn: () => getSignatureBatch(params.id),
  });
  const { data: documents } = useQuery({
    queryKey: ['invoices', params.id, 'documents'],
    queryFn: () => listInvoiceDocuments(params.id),
    enabled: !!params.id,
  });
  const setApproved = useMutation({
    mutationFn: ({ invoiceNo, approved }: { invoiceNo: string; approved: boolean }) =>
      approved
        ? approveSignatureLine(params.id, invoiceNo)
        : revokeSignatureLine(params.id, invoiceNo),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['signatures'] });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiClientError ? err.message : t('approveError'));
    },
    onSettled: () => setPendingNo(null),
  });
  const finish = useMutation({
    mutationFn: () => finishSignatureBatch(params.id),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['signatures'] });
      router.push('/signatures');
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiClientError ? err.message : t('doneError'));
    },
  });
  const approveBatch = useMutation({
    mutationFn: () => approveSignatureBatch(params.id),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['signatures'] });
      router.push('/signatures');
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiClientError ? err.message : t('approveBatchError'));
    },
  });
  const rejectBatch = useMutation({
    mutationFn: (reason: string) => rejectSignatureBatch(params.id, reason),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['signatures'] });
      router.push('/signatures');
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiClientError ? err.message : t('rejectBatchError'));
    },
  });

  useEffect(() => {
    const first = documents?.[0];
    if (!selectedDocumentId && first) {
      setSelectedDocumentId(first.id);
    }
  }, [documents, selectedDocumentId]);

  const selectedDocument = documents?.find((doc) => doc.id === selectedDocumentId) ?? null;

  if (isLoading) {
    return (
      <AppShell>
        <PageLoading className="min-h-[40vh]" />
      </AppShell>
    );
  }

  if (isError || !data) {
    return (
      <AppShell>
        <p className="text-destructive">{t('loadError')}</p>
        <Link href="/signatures" className="mt-4 inline-block text-primary underline">
          {t('back')}
        </Link>
      </AppShell>
    );
  }

  const allApproved = data.invoiceCount > 0 && data.signedCount === data.invoiceCount;
  const canAct = data.canApproveLines || data.canApproveBatch;
  const acting = finish.isPending || approveBatch.isPending || rejectBatch.isPending;

  function selectInvoice(invoiceNo: string) {
    const row = data?.rows.find((item) => item.invoiceNo === invoiceNo);
    const file = row?.files[0];
    if (file) setSelectedDocumentId(file.id);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/signatures" className="text-sm text-primary underline">
            {t('back')}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{displayInvoiceName(data.invoiceNumber)}</h1>
          <p className="text-sm text-muted-foreground">
            {data.supplierName}
            {data.asateelRegion
              ? ` · ${tRegion(data.asateelRegion, { code: ASATEEL_REGION_CODES[data.asateelRegion] })}`
              : ''}
            {` · ${new Date(data.invoiceDate).toLocaleDateString()} · ${tDetail('status.AWAITING_SIGNATURE')}`}
          </p>
          <p className="mt-2 text-sm">
            {t('progress', { signed: data.signedCount, total: data.invoiceCount })}
          </p>
        </div>
        {canAct ? (
          <div className="flex w-full max-w-sm flex-col items-stretch gap-3 sm:items-end">
            {data.canApproveBatch ? (
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <Button type="button" disabled={acting} onClick={() => approveBatch.mutate()}>
                  {approveBatch.isPending ? t('approvingBatch') : t('approveBatch')}
                </Button>
                <p className="max-w-xs text-xs text-muted-foreground sm:text-end">
                  {t('approveBatchHint')}
                </p>
              </div>
            ) : (
              <Button
                type="button"
                disabled={!allApproved || acting || setApproved.isPending}
                onClick={() => finish.mutate()}
              >
                {finish.isPending ? t('sending') : t('done')}
              </Button>
            )}
            <div className="w-full">
              <label htmlFor="reject-reason" className="text-sm font-medium">
                {t('rejectReason')}
              </label>
              <textarea
                id="reject-reason"
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                rows={2}
                value={rejectReason}
                disabled={acting}
                onChange={(event) => setRejectReason(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="mt-2 w-full border-destructive text-destructive hover:bg-destructive/10 sm:w-auto"
                disabled={acting || !rejectReason.trim()}
                onClick={() => rejectBatch.mutate(rejectReason.trim())}
              >
                {rejectBatch.isPending ? t('rejectingBatch') : t('rejectBatch')}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground sm:text-end">
                {t('rejectBatchHint')}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {!data.canApproveLines && !data.canApproveBatch ? (
        <p className="mt-6 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          {t('stage2Waiting')}
        </p>
      ) : null}

      <ul className="mt-6 space-y-3">
        {data.rows.map((row) => {
          const approved = row.signedAt !== null;
          const viewing = row.files.some((file) => file.id === selectedDocumentId);
          return (
            <li key={row.invoiceNo}>
              <div
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 shadow-sm ${
                  viewing ? 'border-primary/40' : 'border-[#E5E7EB]'
                } ${approved ? 'bg-emerald-50' : 'bg-card'}`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-start"
                  onClick={() => selectInvoice(row.invoiceNo)}
                >
                  <span className="block text-sm font-semibold">{row.invoiceNo}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {row.files.map((file) => file.fileName.split('/').pop()).join(', ') ||
                      tDetail('documentsHint')}
                  </span>
                </button>
                {data.canApproveLines ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={approved}
                    aria-label={`${row.invoiceNo}: ${t('approved')}`}
                    disabled={pendingNo === row.invoiceNo || finish.isPending}
                    onClick={() => {
                      setPendingNo(row.invoiceNo);
                      selectInvoice(row.invoiceNo);
                      setApproved.mutate({ invoiceNo: row.invoiceNo, approved: !approved });
                    }}
                    className="inline-flex shrink-0 items-center gap-2 rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full ${
                        approved
                          ? 'bg-emerald-600 text-white'
                          : 'border border-[#E5E7EB] bg-white text-[#D1D5DB]'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                    <span className={approved ? 'text-emerald-800' : 'text-muted-foreground'}>
                      {approved ? t('approved') : t('notApproved')}
                    </span>
                    <SwitchTrack on={approved} />
                  </button>
                ) : (
                  <span
                    className={`shrink-0 text-sm font-medium ${
                      approved ? 'text-emerald-700' : 'text-muted-foreground'
                    }`}
                  >
                    {approved ? t('approved') : t('notApproved')}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{tDetail('documentsTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.canApproveBatch ? t('batchDocumentsHint') : t('documentsHint')}
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
          <InvoiceDocuments
            invoiceId={params.id}
            editable={false}
            viewable
            compact
            selectedDocumentId={selectedDocumentId}
            onSelectDocument={setSelectedDocumentId}
          />
          <DocumentEvidenceViewer
            documentId={selectedDocumentId}
            fileName={selectedDocument?.fileName}
            mimeType={selectedDocument?.mimeType}
          />
        </div>
      </section>
    </AppShell>
  );
}

export default function SignatureBatchPage() {
  return (
    <RequireAuth>
      <RequireRole roles={['ASATEEL_SIGNER']}>
        <SignatureBatchContent />
      </RequireRole>
    </RequireAuth>
  );
}
