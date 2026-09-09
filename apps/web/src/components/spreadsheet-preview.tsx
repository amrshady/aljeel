'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { downloadInvoiceDocument, getDocumentViewUrl, type DocumentView } from '@/lib/invoices-api';
import {
  MAX_SPREADSHEET_PREVIEW_BYTES,
  SpreadsheetPreviewError,
  columnLetter,
  parseSpreadsheetPreview,
  type SpreadsheetWorkbookPreview,
} from '@/lib/spreadsheet-preview';

type SpreadsheetPreviewViewProps = {
  documentId: string;
  fileName: string;
  view: DocumentView;
  className?: string;
};

async function readViewBytes(view: DocumentView, documentId: string): Promise<ArrayBuffer> {
  if (view.kind === 'blob') return view.blob.arrayBuffer();

  try {
    const response = await fetch(view.url);
    if (response.ok) return response.arrayBuffer();
  } catch {
    // Signed object URLs often lack CORS; fall through to the API proxy.
  }

  const proxied = await getDocumentViewUrl(documentId, { proxy: true });
  if (proxied.kind !== 'blob') {
    throw new SpreadsheetPreviewError('PARSE', 'Could not load spreadsheet');
  }
  return proxied.blob.arrayBuffer();
}

async function loadSpreadsheetPreview(
  view: DocumentView,
  documentId: string,
  fileName: string,
): Promise<SpreadsheetWorkbookPreview> {
  const size = view.kind === 'blob' ? view.blob.size : undefined;
  if (size != null && size > MAX_SPREADSHEET_PREVIEW_BYTES) {
    throw new SpreadsheetPreviewError('TOO_LARGE', 'This spreadsheet is too large to preview');
  }

  const buffer = await readViewBytes(view, documentId);
  return parseSpreadsheetPreview(buffer, fileName);
}

export function SpreadsheetPreviewView({
  documentId,
  fileName,
  view,
  className,
}: SpreadsheetPreviewViewProps) {
  const t = useTranslations('documents');
  const [activeSheet, setActiveSheet] = useState(0);
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadInvoiceDocument(documentId, fileName);
    } finally {
      setDownloading(false);
    }
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['documents', documentId, 'spreadsheet'],
    queryFn: () => loadSpreadsheetPreview(view, documentId, fileName),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    setActiveSheet(0);
  }, [documentId]);

  if (isLoading) {
    return (
      <div
        className={`flex h-[min(80vh,900px)] items-center justify-center rounded-lg border bg-muted/20 p-6 text-sm text-muted-foreground ${className ?? ''}`}
      >
        {t('viewerLoading')}
      </div>
    );
  }

  if (isError || !data) {
    const code = error instanceof SpreadsheetPreviewError ? error.code : 'PARSE';
    const message =
      code === 'TOO_LARGE' ? t('spreadsheetTooLarge') : t('spreadsheetParseError');
    return (
      <div
        className={`flex h-[min(80vh,900px)] flex-col items-center justify-center gap-3 rounded-lg border bg-muted/20 p-6 text-center text-sm ${className ?? ''}`}
      >
        <p className="font-medium">{message}</p>
        <p className="text-muted-foreground">{fileName}</p>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="text-primary underline disabled:opacity-50"
        >
          {t('download')}
        </button>
      </div>
    );
  }

  const sheet = data.sheets[Math.min(activeSheet, Math.max(data.sheets.length - 1, 0))];
  const colCount = sheet?.rows[0]?.length ?? sheet?.totalCols ?? 0;

  return (
    <div
      className={`flex h-[min(80vh,900px)] flex-col overflow-hidden rounded-lg border bg-background ${className ?? ''}`}
    >
      <header className="flex shrink-0 items-center gap-3 border-b bg-muted/30 px-3 py-2">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex w-max items-center gap-1" role="tablist" aria-label={t('spreadsheetSheetsLabel')}>
            {data.sheets.map((item, index) => {
              const selected = index === activeSheet;
              return (
                <button
                  key={`${item.name}-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveSheet(index)}
                  className={`max-w-[12rem] truncate rounded-md px-2.5 py-1 text-xs ${
                    selected
                      ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
                  }`}
                  title={item.name}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="shrink-0 text-xs text-primary underline disabled:opacity-50"
        >
          {t('download')}
        </button>
      </header>

      {sheet && (sheet.truncatedRows || sheet.truncatedCols) ? (
        <p className="shrink-0 border-b bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
          {[
            sheet.truncatedRows
              ? t('spreadsheetTruncatedRows', {
                  shown: sheet.rows.length,
                  total: sheet.totalRows,
                })
              : null,
            sheet.truncatedCols
              ? t('spreadsheetTruncatedCols', {
                  shown: colCount,
                  total: sheet.totalCols,
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto bg-muted/10" dir="ltr">
        {!sheet || sheet.rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            {t('spreadsheetEmpty')}
          </div>
        ) : (
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-20 w-10 border-b border-r border-border bg-muted px-1 py-1 text-center font-medium text-muted-foreground"
                />
                {Array.from({ length: colCount }, (_, index) => (
                  <th
                    key={columnLetter(index)}
                    scope="col"
                    className="sticky top-0 z-10 min-w-[5.5rem] border-b border-r border-border bg-muted px-2 py-1 text-center font-medium text-muted-foreground"
                  >
                    {columnLetter(index)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-background">
              {sheet.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-muted/40">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-r border-border bg-muted px-1 py-1 text-center font-medium tabular-nums text-muted-foreground"
                  >
                    {rowIndex + 1}
                  </th>
                  {Array.from({ length: colCount }, (_, colIndex) => {
                    const value = row[colIndex] ?? '';
                    return (
                      <td
                        key={`${rowIndex}-${colIndex}`}
                        title={value}
                        className="max-w-[16rem] truncate border-b border-r border-border px-2 py-1 text-foreground"
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
