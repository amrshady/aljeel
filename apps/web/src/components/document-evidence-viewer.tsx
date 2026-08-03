'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { mightBeEmailDocument } from '@aljeel/shared-types';
import { ApiClientError } from '@/lib/api-client';
import { getDocumentEmailPreview, getDocumentViewUrl } from '@/lib/invoices-api';
import { EmailPreviewView } from '@/components/email-preview';

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

  const resolvedName = fileName || data?.fileName || '';
  const resolvedMime = mimeType || data?.mimeType || 'application/octet-stream';

  // Emails are rendered from parsed JSON rather than raw bytes. The probe is
  // deliberately loose because exported .msg files often lose their extension;
  // the API sniffs the real bytes and rejects anything that is not an email.
  const emailEnabled =
    !!documentId && !!resolvedName && mightBeEmailDocument(resolvedName, resolvedMime);

  const email = useQuery({
    queryKey: ['documents', documentId, 'email'],
    queryFn: () => getDocumentEmailPreview(documentId!),
    enabled: emailEnabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const src = useMemo(() => {
    if (!data) return null;
    if (data.kind === 'remote') return data.url;
    return URL.createObjectURL(data.blob);
  }, [data]);

  useEffect(() => {
    if (data?.kind !== 'blob' || !src) return;
    return () => URL.revokeObjectURL(src);
  }, [data, src]);

  if (!documentId) {
    return (
      <div
        className={`flex h-[min(80vh,900px)] items-center justify-center rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground ${className ?? ''}`}
      >
        {t('viewerSelectFile')}
      </div>
    );
  }

  if (isLoading || (emailEnabled && email.isLoading)) {
    return (
      <div
        className={`flex h-[min(80vh,900px)] items-center justify-center rounded-lg border bg-muted/20 p-6 text-sm text-muted-foreground ${className ?? ''}`}
      >
        {t('viewerLoading')}
      </div>
    );
  }

  if (email.data) {
    return (
      <EmailPreviewView
        documentId={documentId}
        email={email.data}
        className={className}
      />
    );
  }

  if (isError || !data || !src) {
    const message =
      error instanceof ApiClientError ? error.message : t('viewerError');
    return (
      <div
        className={`flex h-[min(80vh,900px)] items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive ${className ?? ''}`}
      >
        {message}
      </div>
    );
  }

  if (isPdf(resolvedMime, resolvedName)) {
    return (
      <div className={`flex h-[min(80vh,900px)] flex-col overflow-hidden rounded-lg border bg-background ${className ?? ''}`}>
        <iframe
          key={src}
          title={resolvedName}
          src={src}
          className="h-full w-full flex-1 bg-white"
        />
      </div>
    );
  }

  if (isImage(resolvedMime, resolvedName)) {
    return (
      <div
        className={`flex h-[min(80vh,900px)] items-center justify-center overflow-hidden rounded-lg border bg-muted/20 p-4 ${className ?? ''}`}
      >
        <img
          key={src}
          src={src}
          alt={resolvedName}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  // An email that failed to parse is more useful to explain than to label
  // "unsupported", which would suggest the portal cannot read emails at all.
  const emailError = email.error;
  const unsupportedMessage =
    emailError instanceof ApiClientError && emailError.code !== 'NOT_AN_EMAIL'
      ? emailError.message
      : t('viewerUnsupported');

  return (
    <div
      className={`flex h-[min(80vh,900px)] flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20 p-6 text-center text-sm ${className ?? ''}`}
    >
      <p className="font-medium">{unsupportedMessage}</p>
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
