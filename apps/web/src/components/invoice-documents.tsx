'use client';

import { Button } from '@aljeel/ui';
import type { DocumentType } from '@aljeel/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiClientError } from '@/lib/api-client';
import {
  deleteInvoiceDocument,
  downloadInvoiceDocument,
  listInvoiceDocuments,
  uploadInvoiceDocument,
} from '@/lib/invoices-api';
import { FileDropzone, formatBytes } from './file-dropzone';

interface InvoiceDocumentsProps {
  invoiceId: string;
  editable: boolean;
  excludeTypes?: DocumentType[];
  uploadType?: DocumentType;
}

export function InvoiceDocuments({
  invoiceId,
  editable,
  excludeTypes = [],
  uploadType = 'INVOICE',
}: InvoiceDocumentsProps) {
  const t = useTranslations('documents');
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['invoices', invoiceId, 'documents'],
    queryFn: () => listInvoiceDocuments(invoiceId),
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        await uploadInvoiceDocument(invoiceId, file, uploadType);
      }
    },
    onSuccess: async () => {
      setPending([]);
      setError(null);
      await queryClient.invalidateQueries({
        queryKey: ['invoices', invoiceId, 'documents'],
      });
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : t('uploadError'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => deleteInvoiceDocument(documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['invoices', invoiceId, 'documents'],
      });
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : t('deleteError'));
    },
  });

  const busy = uploadMutation.isPending || deleteMutation.isPending;
  const visibleDocuments = documents.filter((doc) => !excludeTypes.includes(doc.type));

  return (
    <section className="mt-8">
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

      <div className="mt-4 rounded-xl border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t('loading')}</p>
        ) : visibleDocuments.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y">
            {visibleDocuments.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{doc.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.type} · {formatBytes(doc.sizeBytes)} ·{' '}
                    {t(`scan.${doc.virusScanStatus}`)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadInvoiceDocument(doc.id, doc.fileName)}
                    className="text-xs text-primary hover:underline"
                  >
                    {t('download')}
                  </button>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={busy}
                      className="text-xs text-destructive hover:underline disabled:opacity-50"
                    >
                      {t('remove')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editable && (
        <div className="mt-4">
          <FileDropzone files={pending} onChange={setPending} disabled={busy} />
          {pending.length > 0 && (
            <Button
              type="button"
              className="mt-3"
              disabled={busy}
              onClick={() => uploadMutation.mutate(pending)}
            >
              {uploadMutation.isPending
                ? t('uploading')
                : t('uploadCount', { count: pending.length })}
            </Button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
