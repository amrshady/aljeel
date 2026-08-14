'use client';

import { Button } from '@aljeel/ui';
import { FileSpreadsheet, FileText, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ChangeEvent, useRef, useState } from 'react';
import { generateSolventumChargeback } from '@/lib/ap-api';

function isWorkbook(file: File) {
  return /\.xlsx?$/i.test(file.name);
}

function isPdf(file: File) {
  return /\.pdf$/i.test(file.name);
}

export function SolventumChargebackUploader() {
  const t = useTranslations('invoiceForm.solventum');
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workbookCount = files.filter(isWorkbook).length;
  const pdfCount = files.filter(isPdf).length;
  const invalidCount = files.length - workbookCount - pdfCount;
  const canRun = workbookCount === 1 && pdfCount >= 1 && invalidCount === 0 && !running;

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const additions = Array.from(event.target.files ?? []);
    setFiles((current) => [...current, ...additions]);
    setError(null);
    event.target.value = '';
  }

  async function run() {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    try {
      await generateSolventumChargeback(files);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('runError'));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#1E40AF]">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('body')}</p>
      </div>

      <div className="rounded-xl border border-dashed border-[#2563EB]/40 bg-[#2563EB]/5 p-6">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          multiple
          accept=".xlsx,.xls,.pdf,application/pdf"
          onChange={addFiles}
        />
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={running}>
          {t('addFiles')}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">{t('gateHint')}</p>
      </div>

      {files.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card" aria-label={t('selectedFiles')}>
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 p-3">
              {isWorkbook(file) ? (
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-[#1E40AF]" aria-hidden />
              ) : (
                <FileText className="h-5 w-5 shrink-0 text-[#2563EB]" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                disabled={running}
                aria-label={t('remove', { name: file.name })}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {workbookCount > 1 && <p className="text-sm text-destructive">{t('tooManyWorkbooks')}</p>}
      {invalidCount > 0 && <p className="text-sm text-destructive">{t('invalidFiles')}</p>}
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" disabled={!canRun} onClick={run} className="bg-[#2563EB]">
        {running ? t('running') : t('run')}
      </Button>
    </section>
  );
}
