'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { fetchInvoiceDocument, listInvoiceDocuments } from '@/lib/invoices-api';

interface InvoicePdfPreviewProps {
  invoiceId: string;
}

export function InvoicePdfPreview({ invoiceId }: InvoicePdfPreviewProps) {
  const t = useTranslations('invoiceDetail');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ['invoices', invoiceId, 'documents'],
    queryFn: () => listInvoiceDocuments(invoiceId),
  });

  const invoiceDoc = documents.find((doc) => doc.type === 'INVOICE');

  const { data: blob, isLoading: blobLoading, isError } = useQuery({
    queryKey: ['documents', invoiceDoc?.id, 'preview'],
    queryFn: () => fetchInvoiceDocument(invoiceDoc!.id),
    enabled: !!invoiceDoc,
  });

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  if (docsLoading) {
    return <p className="text-sm text-muted-foreground">{t('invoicePreviewLoading')}</p>;
  }

  if (!invoiceDoc) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        {t('invoicePreviewMissing')}
      </div>
    );
  }

  if (blobLoading) {
    return <p className="text-sm text-muted-foreground">{t('invoicePreviewLoading')}</p>;
  }

  if (isError || !objectUrl) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {t('invoicePreviewError')}
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{t('invoicePreviewTitle')}</h2>
        <span className="truncate text-sm text-muted-foreground">{invoiceDoc.fileName}</span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <iframe
          src={objectUrl}
          title={invoiceDoc.fileName}
          className="h-[min(80vh,900px)] w-full"
        />
      </div>
    </section>
  );
}
