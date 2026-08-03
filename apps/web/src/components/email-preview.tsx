'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { EmailAddress, EmailPreview } from '@aljeel/shared-types';
import { downloadEmailAttachment } from '@/lib/invoices-api';

const IFRAME_STYLES = `
  html { color-scheme: light; }
  body {
    margin: 0;
    padding: 16px;
    background: #ffffff;
    color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    overflow-wrap: break-word;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  blockquote { margin: 0 0 0 12px; padding-left: 12px; border-left: 2px solid #e5e7eb; }
  a { color: #1d4ed8; }
`;

function addressLabel(address: EmailAddress): string {
  if (!address.address || address.name === address.address) return address.name;
  return `${address.name} <${address.address}>`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type EmailPreviewViewProps = {
  documentId: string;
  email: EmailPreview;
  className?: string;
};

export function EmailPreviewView({
  documentId,
  email,
  className,
}: EmailPreviewViewProps) {
  const t = useTranslations('documents');
  const [downloading, setDownloading] = useState<number | null>(null);

  const srcDoc = useMemo(() => {
    const body = email.bodyHtml ?? '';
    return `<!doctype html><html dir="auto"><head><meta charset="utf-8"><style>${IFRAME_STYLES}</style></head><body>${body}</body></html>`;
  }, [email.bodyHtml]);

  async function onDownloadAttachment(index: number, fileName: string) {
    setDownloading(index);
    try {
      await downloadEmailAttachment(documentId, index, fileName);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div
      className={`flex h-[min(80vh,900px)] flex-col overflow-hidden rounded-lg border bg-background ${className ?? ''}`}
    >
      <header className="shrink-0 border-b bg-muted/30 px-4 py-3">
        <h3 className="text-sm font-semibold" title={email.subject}>
          {email.subject || t('emailNoSubject')}
        </h3>
        <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[auto_minmax(0,1fr)]">
          {email.from && (
            <>
              <dt className="font-medium">{t('emailFrom')}</dt>
              <dd className="truncate" title={addressLabel(email.from)}>
                {addressLabel(email.from)}
              </dd>
            </>
          )}
          {email.to.length > 0 && (
            <>
              <dt className="font-medium">{t('emailTo')}</dt>
              <dd className="truncate">{email.to.map(addressLabel).join(', ')}</dd>
            </>
          )}
          {email.cc.length > 0 && (
            <>
              <dt className="font-medium">{t('emailCc')}</dt>
              <dd className="truncate">{email.cc.map(addressLabel).join(', ')}</dd>
            </>
          )}
          {email.sentAt && (
            <>
              <dt className="font-medium">{t('emailDate')}</dt>
              <dd>{new Date(email.sentAt).toLocaleString()}</dd>
            </>
          )}
        </dl>

        {email.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {email.attachments.map((attachment) => (
              <button
                key={attachment.index}
                type="button"
                disabled={downloading === attachment.index}
                onClick={() =>
                  onDownloadAttachment(attachment.index, attachment.fileName)
                }
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
                title={`${attachment.fileName} (${formatBytes(attachment.sizeBytes)})`}
              >
                <span aria-hidden>📎</span>
                <span className="truncate">{attachment.fileName}</span>
                <span className="text-muted-foreground">
                  {formatBytes(attachment.sizeBytes)}
                </span>
              </button>
            ))}
          </div>
        )}

        {email.imagesNotShown > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('emailImagesBlocked', { count: email.imagesNotShown })}
          </p>
        )}
      </header>

      {email.bodyHtml ? (
        <iframe
          title={email.subject || t('emailNoSubject')}
          srcDoc={srcDoc}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="min-h-0 w-full flex-1 bg-white"
        />
      ) : (
        <p className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          {t('emailEmptyBody')}
        </p>
      )}
    </div>
  );
}
