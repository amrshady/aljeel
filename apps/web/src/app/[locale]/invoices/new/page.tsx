'use client';

import {
  ASATEEL_REGION_CODES,
  ASATEEL_REGION_VALUES,
  validateInvoiceSubmitDocuments,
  type AsateelRegion,
} from '@aljeel/shared-types';
import { Button } from '@aljeel/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, FileWarning } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { displayInvoiceName } from '@/components/invoice-folder-table';
import {
  KbFileUploader,
  applyKbUploadProgress,
  kbFileKey,
  patchKbFile,
  type KbQueuedFile,
} from '@/components/kb-file-uploader';
import { RequireAuth } from '@/components/require-auth';
import { markAlreadyUploadedFiles } from '@/lib/document-dedup';
import { validateLocalAsateelManifest } from '@/lib/asateel-manifest-validation';
import { formatAsateelManifestIssue, formatInvoiceError } from '@/lib/format-error';
import {
  createInvoiceDraft,
  listInvoiceDocuments,
  listInvoices,
  submitInvoice,
} from '@/lib/invoices-api';
import { uploadInvoiceDocumentViaKb } from '@/lib/kb-upload-api';
import { Link, useRouter } from '@/i18n/routing';

const UPLOAD_CONCURRENCY = 6;
const DONE_PAUSE_MS = 900;

function InvoiceUploadContent() {
  const t = useTranslations('invoiceForm');
  const tDetail = useTranslations('invoiceDetail');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<KbQueuedFile[]>([]);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [asateelRegion, setAsateelRegion] = useState<AsateelRegion | ''>('');
  const [draftInvoiceId, setDraftInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<'idle' | 'uploading' | 'submitting'>('idle');

  const { data: draftInvoices } = useQuery({
    queryKey: ['invoices', 'drafts', 'new-upload'],
    queryFn: () =>
      listInvoices({
        status: 'DRAFT',
        archived: 'false',
        pageSize: '25',
        sort: '-createdAt',
      }),
  });

  function fileLabel(item: KbQueuedFile): string {
    return item.relativePath ?? item.file.name;
  }

  function submitValidationError(fileNames: string[]): string | null {
    const issue = validateInvoiceSubmitDocuments(fileNames);
    if (!issue) return null;
    if (issue.code === 'XLSX_REQUIRED') return t('errors.xlsxRequired');
    return t('errors.filesRequired');
  }

  function validateForm(requireFiles: boolean): string | null {
    if (!requireFiles) return null;
    return submitValidationError(files.map(fileLabel));
  }

  async function uploadOne(invoiceId: string, item: KbQueuedFile) {
    const key = kbFileKey(item);
    setFiles((current) => patchKbFile(current, key, { status: 'signing', progress: 0 }));
    try {
      await uploadInvoiceDocumentViaKb(
        invoiceId,
        item.file,
        'OTHER',
        (progress) => {
          setFiles((current) => applyKbUploadProgress(current, key, progress));
        },
        item.checksumSha256,
      );
      setFiles((current) => patchKbFile(current, key, { status: 'done', progress: 100 }));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('error');
      setFiles((current) => patchKbFile(current, key, { status: 'error', error: message }));
      throw err;
    }
  }

  async function uploadAll(invoiceId: string, queue: KbQueuedFile[]) {
    let nextIndex = 0;
    const workers = Array(Math.min(UPLOAD_CONCURRENCY, queue.length))
      .fill(null)
      .map(async () => {
        while (nextIndex < queue.length) {
          const index = nextIndex++;
          const item = queue[index];
          if (!item) break;
          await uploadOne(invoiceId, item);
        }
      });
    await Promise.all(workers);
  }

  async function persistInvoice(submitAfter: boolean) {
    const validationError = validateForm(submitAfter);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (submitAfter) {
      const folderFiles = files.filter((file) => file.status !== 'skipped');
      const manifestIssue = await validateLocalAsateelManifest(folderFiles);
      if (manifestIssue) {
        setError(formatAsateelManifestIssue(manifestIssue, t));
        return;
      }
    }

    setUploading(true);
    setSubmitPhase('uploading');
    setError(null);

    const queue = files.filter((f) => f.status === 'pending' || f.status === 'error');
    setFiles((current) =>
      current.map((f) =>
        queue.some((q) => kbFileKey(q) === kbFileKey(f))
          ? { ...f, status: 'queued' as const, progress: 0, error: undefined }
          : f,
      ),
    );
    requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    try {
      let invoiceId = draftInvoiceId;
      if (!invoiceId) {
        const invoice = await createInvoiceDraft(
          folderName ?? undefined,
          asateelRegion || undefined,
        );
        invoiceId = invoice.id;
        setDraftInvoiceId(invoice.id);
      }
      const documents = await listInvoiceDocuments(invoiceId);
      const { nextQueue, uploadQueue } = await markAlreadyUploadedFiles(queue, documents);
      const byKey = new Map(nextQueue.map((item) => [kbFileKey(item), item]));
      setFiles((current) => current.map((file) => byKey.get(kbFileKey(file)) ?? file));

      await uploadAll(invoiceId, uploadQueue);

      if (submitAfter) {
        const finalDocuments = await listInvoiceDocuments(invoiceId);
        const submitError = submitValidationError(finalDocuments.map((doc) => doc.fileName));
        if (submitError) {
          setError(submitError);
          setSubmitPhase('idle');
          return;
        }
        setSubmitPhase('submitting');
        await submitInvoice(invoiceId);
      }

      await new Promise((resolve) => setTimeout(resolve, DONE_PAUSE_MS));
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      router.push(submitAfter ? '/dashboard' : `/invoices/${invoiceId}`);
    } catch (err) {
      setError(formatInvoiceError(err, t, t('error')));
      setSubmitPhase('idle');
    } finally {
      setUploading(false);
    }
  }

  async function onSaveDraft(e: FormEvent) {
    e.preventDefault();
    await persistInvoice(false);
  }

  async function onSaveAndSubmit(e: FormEvent) {
    e.preventDefault();
    await persistInvoice(true);
  }

  const canAddFiles =
    !uploading &&
    files.every((f) => f.status === 'pending' || f.status === 'error' || f.status === 'skipped');

  const buttonLabel = uploading
    ? submitPhase === 'submitting'
      ? t('submitting')
      : t('uploadingFiles')
    : null;

  return (
    <AppShell>
      <div className="max-w-3xl">
        <Link href="/dashboard" className="text-sm text-primary underline">
          {tDetail('back')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

        {draftInvoices && draftInvoices.data.length > 0 && (
          <section className="mt-6 rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-[#1E40AF]/10 p-2 text-[#1E40AF]">
                <FileWarning className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-[#1E40AF]">
                  {t('unfinishedTitle', { count: draftInvoices.total })}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('unfinishedHint')}</p>
                <div className="mt-4 divide-y rounded-lg border border-[#E5E7EB]">
                  {draftInvoices.data.map((draft) => (
                    <div
                      key={draft.id}
                      className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {displayInvoiceName(draft.invoiceNumber)}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{t('unfinishedFiles', { count: draft.documentCount })}</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" aria-hidden />
                            {t('unfinishedCreated', {
                              date: new Intl.DateTimeFormat(locale, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }).format(new Date(draft.createdAt)),
                            })}
                          </span>
                        </p>
                      </div>
                      <Link href={`/invoices/${draft.id}`} className="shrink-0">
                        <Button type="button" size="sm">
                          {t('resumeDraft')}
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <form className="mt-8 space-y-8">
          <div>
            <h2 className="font-semibold">{t('filesTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('filesHint')}</p>
            <div className="mt-3">
              <KbFileUploader
                files={files}
                onChange={setFiles}
                blockNewFiles={!canAddFiles}
                allowFolder
                onFolderName={(name) => {
                  setFolderName((prev) => {
                    if (prev !== name) setDraftInvoiceId(null);
                    return name;
                  });
                }}
                listRef={listRef}
                title={t('filesDropTitle')}
                hint={t('filesDropHint')}
              />
            </div>
          </div>

          <div className="max-w-xs">
            <label className="text-sm font-medium">{t('asateelRegion')}</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={asateelRegion}
              disabled={uploading}
              onChange={(event) => {
                setAsateelRegion(event.target.value as AsateelRegion | '');
                setDraftInvoiceId(null);
              }}
            >
              <option value="">{t('asateelRegionPlaceholder')}</option>
              {ASATEEL_REGION_VALUES.map((region) => (
                <option key={region} value={region}>
                  {t(`asateelRegions.${region}`, { code: ASATEEL_REGION_CODES[region] })}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={uploading} onClick={onSaveDraft}>
              {uploading ? buttonLabel : t('saveDraft')}
            </Button>
            <Button type="button" disabled={uploading} onClick={onSaveAndSubmit}>
              {uploading ? buttonLabel : t('submit')}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

export default function NewInvoicePage() {
  return (
    <RequireAuth>
      <InvoiceUploadContent />
    </RequireAuth>
  );
}
