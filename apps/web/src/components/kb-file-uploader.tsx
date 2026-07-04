'use client';

import { isAcceptedDocumentFile } from '@aljeel/shared-types';
import { formatBytes, type KbUploadProgress } from '@aljeel/kb-upload';
import { useTranslations } from 'next-intl';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from 'react';

export type KbFileStatus =
  | 'pending'
  | 'queued'
  | 'signing'
  | 'uploading'
  | 'finalizing'
  | 'done'
  | 'skipped'
  | 'error';

export interface KbQueuedFile {
  file: File;
  /** Path within an uploaded folder (e.g. `Invoices/scan.pdf`). */
  relativePath?: string;
  progress: number;
  status: KbFileStatus;
  checksumSha256?: string;
  error?: string;
}

interface KbFileUploaderProps {
  files: KbQueuedFile[];
  onChange: (files: KbQueuedFile[]) => void;
  disabled?: boolean;
  /** Prevents picking new files while an upload is in progress. */
  blockNewFiles?: boolean;
  multiple?: boolean;
  accept?: string;
  single?: boolean;
  /** Allow selecting or dropping a whole folder. */
  allowFolder?: boolean;
  /** Called when a folder is added (top-level folder name). */
  onFolderName?: (name: string) => void;
  title?: string;
  hint?: string;
  /** When false, only renders the dropzone (file list shown elsewhere). */
  showFileList?: boolean;
  /** Scroll target for the file list (e.g. during submit). */
  listRef?: RefObject<HTMLDivElement | null>;
}

export function kbFileKey(item: Pick<KbQueuedFile, 'file' | 'relativePath'>): string {
  const path =
    item.relativePath ??
    (item.file as File & { webkitRelativePath?: string }).webkitRelativePath ??
    item.file.name;
  return `${path}-${item.file.size}-${item.file.lastModified}`;
}

function displayPath(item: KbQueuedFile): string {
  return item.relativePath ?? item.file.name;
}

function fileRelativePath(file: File): string | undefined {
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return path && path.length > 0 ? path : undefined;
}

function folderNameFromFiles(files: File[]): string | null {
  for (const file of files) {
    const relativePath = fileRelativePath(file);
    if (relativePath?.includes('/')) {
      return relativePath.split('/')[0] ?? null;
    }
  }
  return null;
}

type ScannedFile = { file: File; relativePath: string };

async function readDirectoryEntry(
  entry: FileSystemDirectoryEntry,
  pathPrefix: string,
): Promise<ScannedFile[]> {
  const reader = entry.createReader();
  const results: ScannedFile[] = [];

  const readEntries = (): Promise<FileSystemEntry[]> =>
    new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

  let entries = await readEntries();
  while (entries.length > 0) {
    for (const child of entries) {
      const childPath = pathPrefix ? `${pathPrefix}/${child.name}` : child.name;
      if (child.isFile) {
        const file = await new Promise<File>((resolve, reject) => {
          (child as FileSystemFileEntry).file(resolve, reject);
        });
        results.push({ file, relativePath: childPath });
      } else if (child.isDirectory) {
        results.push(
          ...(await readDirectoryEntry(child as FileSystemDirectoryEntry, childPath)),
        );
      }
    }
    entries = await readEntries();
  }
  return results;
}

async function scanDataTransfer(dt: DataTransfer): Promise<{
  files: ScannedFile[];
  folderName: string | null;
}> {
  const items = Array.from(dt.items);
  const entries = items
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry != null);

  if (entries.length === 0) {
    const plainFiles = Array.from(dt.files);
    return {
      files: plainFiles.map((file) => ({
        file,
        relativePath: fileRelativePath(file) ?? file.name,
      })),
      folderName: folderNameFromFiles(plainFiles),
    };
  }

  const all: ScannedFile[] = [];
  let folderName: string | null = null;

  for (const entry of entries) {
    if (entry.isDirectory) {
      folderName = folderName ?? entry.name;
      all.push(...(await readDirectoryEntry(entry as FileSystemDirectoryEntry, entry.name)));
    } else if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      all.push({ file, relativePath: file.name });
    }
  }

  return { files: all, folderName };
}

export function patchKbFile(
  files: KbQueuedFile[],
  key: string,
  patch: Partial<KbQueuedFile>,
): KbQueuedFile[] {
  return files.map((item) => (kbFileKey(item) === key ? { ...item, ...patch } : item));
}

export function applyKbUploadProgress(
  files: KbQueuedFile[],
  key: string,
  progress: KbUploadProgress,
): KbQueuedFile[] {
  return patchKbFile(files, key, {
    status: progress.phase,
    progress: progress.percent,
  });
}

export function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return '📕';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📗';
  if (['ppt', 'pptx'].includes(ext)) return '📙';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff'].includes(ext)) return '🖼️';
  if (['txt', 'md', 'xml'].includes(ext)) return '📄';
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) return '🗜️';
  return '📎';
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? ''}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 4.5 4.5 0 0 1 3.258 7.606"
      />
    </svg>
  );
}

export function UploadProgressBar({
  status,
  progress,
  compact,
}: {
  status: KbFileStatus;
  progress: number;
  /** Horizontal inline bar (files-portal style). */
  compact?: boolean;
}) {
  const barClass = compact
    ? 'h-1.5 flex-[0_0_11rem] overflow-hidden rounded-full bg-muted sm:flex-[0_0_12rem]'
    : 'mt-2.5 h-2 overflow-hidden rounded-full bg-muted';

  if (status === 'uploading' && progress > 0) {
    return (
      <div className={barClass}>
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(progress, 2)}%` }}
        />
      </div>
    );
  }

  if (
    status === 'queued' ||
    status === 'signing' ||
    status === 'finalizing' ||
    (status === 'uploading' && progress === 0)
  ) {
    return (
      <div className={barClass}>
        <div className="h-full w-1/3 rounded-full bg-primary/60" />
      </div>
    );
  }

  if (status === 'done' || status === 'skipped') {
    return (
      <div className={barClass}>
        <div
          className={`h-full w-full rounded-full ${
            status === 'skipped' ? 'bg-[#2563EB]/60' : 'bg-green-500/80'
          }`}
        />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={barClass}>
        <div className="h-full w-full rounded-full bg-destructive/60" />
      </div>
    );
  }

  return compact ? <div className={barClass} /> : null;
}

export function uploadStatusText(
  status: KbFileStatus,
  progress: number,
  t: ReturnType<typeof useTranslations<'documents'>>,
): string {
  switch (status) {
    case 'queued':
      return t('statusQueued');
    case 'signing':
      return t('statusSigning');
    case 'uploading':
      return progress > 0 ? t('statusUploading', { percent: progress }) : t('statusUploadingStart');
    case 'finalizing':
      return t('statusFinalizing');
    case 'done':
      return t('statusDone');
    case 'skipped':
      return t('statusSkipped');
    case 'error':
      return t('statusFailed');
    default:
      return '';
  }
}

export function statusLabel(
  status: KbFileStatus,
  progress: number,
  t: ReturnType<typeof useTranslations<'documents'>>,
): string {
  return uploadStatusText(status, progress, t);
}

const FILE_ROW_TRANSITION_MS = 200;

function KbUploadRowAnimated({
  item,
  onRemove,
  canRemove,
  t,
}: {
  item: KbQueuedFile;
  onRemove: () => void;
  canRemove: boolean;
  t: ReturnType<typeof useTranslations<'documents'>>;
}) {
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setEntered(true);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  function handleRemove() {
    if (exiting) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      onRemove();
      return;
    }
    setExiting(true);
    window.setTimeout(onRemove, FILE_ROW_TRANSITION_MS);
  }

  return (
    <div
      className={`transition-all duration-200 motion-reduce:translate-x-0 motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:opacity-100 motion-reduce:transition-none ${
        exiting
          ? 'pointer-events-none scale-95 opacity-0 translate-x-2 ease-in'
          : entered
            ? 'scale-100 opacity-100 translate-y-0 ease-out'
            : 'scale-[0.98] opacity-0 -translate-y-2 ease-out'
      }`}
    >
      <KbUploadRow
        item={item}
        onRemove={handleRemove}
        canRemove={canRemove && !exiting}
        t={t}
      />
    </div>
  );
}

export function KbUploadRow({
  item,
  onRemove,
  canRemove,
  t,
}: {
  item: KbQueuedFile;
  onRemove?: () => void;
  canRemove?: boolean;
  t: ReturnType<typeof useTranslations<'documents'>>;
}) {
  const active = ['queued', 'signing', 'uploading', 'finalizing'].includes(item.status);
  const isDone = item.status === 'done';
  const isSkipped = item.status === 'skipped';
  const isError = item.status === 'error';
  const showProgress = active || isDone || isSkipped || isError;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm ${
        active
          ? 'border-primary/30 bg-primary/[0.02]'
          : isDone
            ? 'border-green-500/30'
            : isSkipped
              ? 'border-[#2563EB]/25 bg-[#2563EB]/[0.03]'
              : isError
                ? 'border-destructive/30'
                : ''
      }`}
    >
      <span className="shrink-0 text-base leading-none" aria-hidden>
        {fileIcon(item.file.name)}
      </span>
      <p className="min-w-0 flex-1 truncate font-medium">{displayPath(item)}</p>
      {showProgress && (
        <UploadProgressBar status={item.status} progress={item.progress} compact />
      )}
      {showProgress && (
        <span
          className={`${isSkipped ? 'w-28' : 'w-16'} shrink-0 text-right text-xs tabular-nums ${
            isError
              ? 'font-medium text-destructive'
              : isDone
                ? 'font-medium text-green-600'
                : isSkipped
                  ? 'font-medium text-[#1E40AF]'
                  : 'text-muted-foreground'
          }`}
          title={isError ? item.error : undefined}
        >
          {isError ? t('statusFailed') : uploadStatusText(item.status, item.progress, t)}
        </span>
      )}
      {item.status === 'pending' && canRemove && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-xs text-destructive hover:underline"
        >
          {t('remove')}
        </button>
      )}
    </div>
  );
}

export function KbFileUploader({
  files,
  onChange,
  disabled,
  blockNewFiles,
  multiple = true,
  accept = '*/*',
  single = false,
  allowFolder = false,
  onFolderName,
  title,
  hint,
  showFileList = true,
  listRef,
}: KbFileUploaderProps) {
  const t = useTranslations('documents');
  const inputId = useId();
  const folderInputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const isUploading = files.some((f) =>
    ['queued', 'signing', 'uploading', 'finalizing'].includes(f.status),
  );
  const zoneDisabled = disabled || blockNewFiles || scanning;

  function mergeIncoming(incoming: ScannedFile[], folderName: string | null) {
    const accepted: KbQueuedFile[] = [];
    const rejected: string[] = [];
    for (const { file, relativePath } of incoming) {
      if (!isAcceptedDocumentFile(file.name, file.type, file.size)) {
        rejected.push(relativePath);
      } else {
        accepted.push({ file, relativePath, progress: 0, status: 'pending' });
      }
    }
    setWarning(rejected.length > 0 ? t('rejected', { files: rejected.join(', ') }) : null);
    if (folderName) {
      onFolderName?.(folderName);
    }
    if (accepted.length > 0) {
      onChange(single ? accepted : [...files, ...accepted]);
    }
  }

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const scanned = Array.from(incoming).map((file) => ({
      file,
      relativePath: fileRelativePath(file) ?? file.name,
    }));
    mergeIncoming(scanned, folderNameFromFiles(Array.from(incoming)));
  }

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (zoneDisabled) return;

    if (allowFolder && e.dataTransfer.items?.length) {
      setScanning(true);
      try {
        const { files: scanned, folderName } = await scanDataTransfer(e.dataTransfer);
        mergeIncoming(scanned, folderName);
      } finally {
        setScanning(false);
      }
      return;
    }

    addFiles(e.dataTransfer.files);
  }

  function removeByKey(key: string) {
    onChange(files.filter((item) => kbFileKey(item) !== key));
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !zoneDisabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !zoneDisabled) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!zoneDisabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed bg-card ${
          dragging
            ? 'border-primary bg-primary/5'
            : isUploading
              ? 'border-primary/40'
              : 'border-muted-foreground/25 hover:border-primary/50'
        } ${zoneDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-muted/30'}`}
      >
        <div className="flex flex-col items-center justify-center px-6 py-8 text-center sm:flex-row sm:gap-5 sm:text-start">
          <div
            className={`mb-3 flex h-14 w-14 shrink-0 items-center justify-center rounded-full sm:mb-0 ${
              dragging || isUploading
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <UploadIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {scanning
                ? t('scanningFolder')
                : dragging
                  ? allowFolder
                    ? t('dropActiveFolder')
                    : t('dropActive')
                  : (title ?? t('dropTitle'))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{hint ?? t('dropHint')}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('browsePrompt')}{' '}
              <span className="font-medium text-primary underline-offset-2 hover:underline">
                {t('browseLink')}
              </span>
              {allowFolder && (
                <>
                  {' '}
                  {t('browseOr')}{' '}
                  <span
                    role="button"
                    tabIndex={0}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!zoneDisabled) folderInputRef.current?.click();
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !zoneDisabled) {
                        e.stopPropagation();
                        e.preventDefault();
                        folderInputRef.current?.click();
                      }
                    }}
                  >
                    {t('browseFolderLink')}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          className="hidden"
          disabled={zoneDisabled}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {allowFolder && (
          <input
            id={folderInputId}
            ref={folderInputRef}
            type="file"
            // @ts-expect-error non-standard webkitdirectory attribute for folder picker
            webkitdirectory=""
            multiple
            className="hidden"
            disabled={zoneDisabled}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        )}
      </div>

      {warning && (
        <p className="animate-in fade-in slide-in-from-top-1 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive duration-200 motion-reduce:animate-none">
          {warning}
        </p>
      )}

      {showFileList && files.length > 0 && (
        <div ref={listRef} className="space-y-2">
          {files.map((item) => (
            <KbUploadRowAnimated
              key={kbFileKey(item)}
              item={item}
              canRemove={!zoneDisabled}
              onRemove={() => removeByKey(kbFileKey(item))}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { formatBytes };
