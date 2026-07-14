'use client';

import { Button } from '@aljeel/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { markAlreadyUploadedFiles } from '@/lib/document-dedup';
import { deleteInvoiceDocument, listInvoiceDocuments } from '@/lib/invoices-api';
import { uploadInvoiceDocumentViaKb } from '@/lib/kb-upload-api';
import {
  KbFileUploader,
  KbUploadRow,
  applyKbUploadProgress,
  fileIcon,
  formatBytes,
  kbFileKey,
  patchKbFile,
  type KbQueuedFile,
} from './kb-file-uploader';

interface InvoiceDocumentsProps {
  invoiceId: string;
  editable: boolean;
  viewable?: boolean;
  selectedDocumentId?: string | null;
  onSelectDocument?: (documentId: string) => void;
  compact?: boolean;
}

function DocumentSkeleton() {
  return (
    <li className="flex items-center gap-3 p-3">
      <div className="h-5 w-5 animate-pulse rounded bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </li>
  );
}

function PendingFileRow({
  item,
  onRemove,
  canRemove,
  t,
}: {
  item: KbQueuedFile;
  onRemove?: () => void;
  canRemove: boolean;
  t: ReturnType<typeof useTranslations<'documents'>>;
}) {
  return (
    <li className="px-2 py-1">
      <KbUploadRow item={item} onRemove={onRemove} canRemove={canRemove} t={t} />
    </li>
  );
}

export function InvoiceDocuments({
  invoiceId,
  editable,
  viewable = false,
  selectedDocumentId,
  onSelectDocument,
  compact = false,
}: InvoiceDocumentsProps) {
  const t = useTranslations('documents');
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<KbQueuedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['invoices', invoiceId, 'documents'],
    queryFn: () => listInvoiceDocuments(invoiceId),
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: KbQueuedFile[]) => {
      setPending((current) =>
        current.map((f) =>
          files.some((q) => kbFileKey(q) === kbFileKey(f))
            ? { ...f, status: 'queued' as const, progress: 0 }
            : f,
        ),
      );
      const latestDocuments = await listInvoiceDocuments(invoiceId);
      const { nextQueue, uploadQueue } = await markAlreadyUploadedFiles(
        files,
        latestDocuments,
      );
      const byKey = new Map(nextQueue.map((item) => [kbFileKey(item), item]));
      setPending((current) => current.map((file) => byKey.get(kbFileKey(file)) ?? file));

      for (const item of uploadQueue) {
        const key = kbFileKey(item);
        setPending((current) => patchKbFile(current, key, { status: 'signing', progress: 0 }));
        try {
          await uploadInvoiceDocumentViaKb(
            invoiceId,
            item.file,
            'OTHER',
            (progress) =>
              setPending((current) => applyKbUploadProgress(current, key, progress)),
            item.checksumSha256,
            item.relativePath,
          );
          setPending((current) => patchKbFile(current, key, { status: 'done', progress: 100 }));
        } catch (err) {
          const message = err instanceof ApiClientError ? err.message : t('uploadError');
          setPending((current) => patchKbFile(current, key, { status: 'error', error: message }));
          throw err;
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId, 'documents'] });
      setPending((current) => current.filter((file) => file.status === 'skipped'));
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : t('uploadError'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => deleteInvoiceDocument(documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId, 'documents'] });
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : t('deleteError'));
    },
  });

  const busy = uploadMutation.isPending || deleteMutation.isPending;
  const pendingUploads = pending.filter((f) => f.status === 'pending');
  const uploading = pending.filter((f) => !['pending'].includes(f.status));
  const showList = isLoading || uploading.length > 0 || documents.length > 0;

  return (
    <section className={compact ? undefined : 'mt-8'}>
      {!compact && (
        <>
          <h2 className="font-semibold">{t('title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </>
      )}

      {showList && (
        <div
          className={`overflow-hidden rounded-xl border bg-card shadow-sm ${compact ? '' : 'mt-4'}`}
        >
          <ul
            className={`divide-y ${compact ? 'max-h-[min(80vh,900px)] overflow-y-auto' : ''}`}
          >
            {isLoading && (
              <>
                <DocumentSkeleton />
                <DocumentSkeleton />
              </>
            )}
            {!isLoading &&
              uploading.map((item) => (
                <PendingFileRow key={kbFileKey(item)} item={item} canRemove={false} t={t} />
              ))}
            {!isLoading &&
              documents.map((doc) => (
                <li
                  key={doc.id}
                  className={`flex items-center justify-between gap-3 p-3 text-sm ${
                    viewable ? 'cursor-pointer hover:bg-muted/50' : ''
                  } ${selectedDocumentId === doc.id ? 'bg-muted' : ''}`}
                  onClick={
                    viewable && onSelectDocument
                      ? () => onSelectDocument(doc.id)
                      : undefined
                  }
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="text-lg leading-none" aria-hidden>
                      {fileIcon(doc.fileName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{doc.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(doc.sizeBytes)} · {t(`scan.${doc.virusScanStatus}`)}
                      </p>
                    </div>
                  </div>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={busy}
                      className="shrink-0 text-xs text-destructive hover:underline disabled:opacity-50"
                    >
                      {t('remove')}
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      {!isLoading && !showList && !editable && (
        <p className="mt-4 text-sm text-muted-foreground">{t('empty')}</p>
      )}

      {editable && (
        <div className="mt-4">
          <KbFileUploader
            files={pendingUploads}
            onChange={(next) => {
              const kept = pending.filter((f) => f.status !== 'pending');
              setPending([...kept, ...next]);
            }}
            blockNewFiles={busy}
            allowFolder
            showFileList={false}
            title={t('dropTitle')}
            hint={t('dropHint')}
          />
          {pendingUploads.length > 0 && (
            <Button
              type="button"
              className="mt-3"
              disabled={busy}
              onClick={() => uploadMutation.mutate(pendingUploads)}
            >
              {uploadMutation.isPending
                ? t('uploading')
                : t('uploadCount', { count: pendingUploads.length })}
            </Button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
