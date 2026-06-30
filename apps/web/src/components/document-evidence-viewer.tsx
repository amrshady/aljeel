'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { getDocumentViewUrl } from '@/lib/invoices-api';

function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function isPdf(mimeType: string, fileName: string): boolean {
  return mimeType === 'application/pdf' || fileExtension(fileName) === 'pdf';
}

function isImage(mimeType: string, fileName: string): boolean {
  if (mimeType.startsWith('image/')) return true;
  return ['png', 'gif', 'jpg', 'jpeg', 'webp', 'tif', 'tiff'].includes(
    fileExtension(fileName),
  );
}

type DocumentEvidenceViewerProps = {
  documentId: string | null;
  fileName?: string;
  mimeType?: string;
  className?: string;
};

export function DocumentEvidenceViewer({
  documentId,
  fileName,
  mimeType,
  className,
}: DocumentEvidenceViewerProps) {
  const t = useTranslations('documents');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['documents', documentId, 'view'],
    queryFn: () => getDocumentViewUrl(documentId!),
    enabled: !!documentId,
    staleTime: 5 * 60 * 1000,
  });

  const src = useMemo(() => {
    if (!data) return null;
    if (data.kind === 'remote') return data.url;
    return URL.createObjectURL(data.blob);
  }, [data, documentId]);

  useEffect(() => {
    if (data?.kind !== 'blob' || !src) return;
    return () => URL.revokeObjectURL(src);
  }, [data, src]);

  if (!documentId) {
    return (
      <div
        className={`flex min-h-[280px] items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground ${className ?? ''}`}
      >
        {t('viewerSelectFile')}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={`flex min-h-[280px] items-center justify-center rounded-lg border bg-muted/20 p-6 text-sm text-muted-foreground ${className ?? ''}`}
      >
        {t('viewerLoading')}
      </div>
    );
  }

  if (isError || !data || !src) {
    const message =
      error instanceof ApiClientError ? error.message : t('viewerError');
    return (
      <div
        className={`flex min-h-[280px] items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive ${className ?? ''}`}
      >
        {message}
      </div>
    );
  }

  const resolvedName = data.fileName || fileName || '';
  const resolvedMime = data.mimeType || mimeType || 'application/octet-stream';

  if (isPdf(resolvedMime, resolvedName)) {
    return (
      <div className={`flex min-h-[min(80vh,900px)] flex-col overflow-hidden rounded-lg border bg-background ${className ?? ''}`}>
        <iframe
          key={src}
          title={resolvedName}
          src={src}
          className="min-h-[min(80vh,900px)] w-full flex-1 bg-white"
        />
      </div>
    );
  }

  if (isImage(resolvedMime, resolvedName)) {
    return (
      <div
        className={`flex min-h-[min(80vh,900px)] items-center justify-center overflow-hidden rounded-lg border bg-muted/20 p-4 ${className ?? ''}`}
      >
        <img
          key={src}
          src={src}
          alt={resolvedName}
          className="max-h-[min(80vh,900px)] max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-[min(80vh,900px)] flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20 p-6 text-center text-sm ${className ?? ''}`}
    >
      <p className="font-medium">{t('viewerUnsupported')}</p>
      <p className="text-muted-foreground">{resolvedName}</p>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline"
      >
        {t('viewerOpenTab')}
      </a>
    </div>
  );
}
