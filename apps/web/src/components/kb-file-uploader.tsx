'use client';

import { isAcceptedDocumentFile } from '@aljeel/shared-types';
import { formatBytes, type KbUploadProgress } from '@aljeel/kb-upload';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useDropzone, type FileWithPath } from 'react-dropzone';

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
  /** Jawal: let vendors fix evidence relative paths before upload/submit. */
  canRename?: boolean;
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

function fileRelativePath(file: File & { path?: string }): string | undefined {
  const raw =
    file.path ||
    (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (!raw || raw.length === 0) return undefined;
  // Windows Explorer / dropzone can produce backslashes; dropzone may prefix "/".
  return raw.replace(/\\/g, '/').replace(/^\//, '');
}

function folderNameFromFiles(files: Array<File & { path?: string }>): string | null {
  for (const file of files) {
    const relativePath = fileRelativePath(file);
    if (relativePath?.includes('/')) {
      return relativePath.split('/')[0] ?? null;
    }
  }
  return null;
}

type ScannedFile = { file: File; relativePath: string };

/** File System Access directory handle — not always in TS DOM libs. */
type DropFileSystemHandle = {
  kind: 'file' | 'directory';
  name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterable<DropFileSystemHandle>;
};

type ShowDirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DropFileSystemHandle>;
};

function filesFromFileList(fileList: FileList | File[]): ScannedFile[] {
  return Array.from(fileList).map((file) => ({
    file,
    relativePath: fileRelativePath(file) ?? file.name,
  }));
}

function scannedFromDropzoneFiles(
  incoming: Array<File & { path?: string }>,
): ScannedFile[] {
  return incoming.map((file) => {
    const path = (file.path ?? fileRelativePath(file) ?? file.name).replace(/\\/g, '/');
    // react-dropzone / file-selector often prefixes with "/"
    const relativePath = path.replace(/^\//, '') || file.name;
    return { file, relativePath };
  });
}

/**
 * Walk a directory handle from showDirectoryPicker (durable permission —
 * not tied to expiring drag-data). Soft-fails on OneDrive placeholders.
 */
async function readDirectoryHandle(
  dir: DropFileSystemHandle,
  pathPrefix: string,
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  const subdirs: Array<{ handle: DropFileSystemHandle; path: string }> = [];
  const iterable = dir.values?.();
  if (!iterable) return results;

  try {
    for await (const handle of iterable) {
      const childPath = pathPrefix ? `${pathPrefix}/${handle.name}` : handle.name;
      try {
        if (handle.kind === 'file') {
          const file = await handle.getFile?.();
          if (file) results.push({ file, relativePath: childPath });
        } else if (handle.kind === 'directory') {
          subdirs.push({ handle, path: childPath });
        }
      } catch {
        // Skip unreadable children (OneDrive online-only, etc.).
      }
    }
  } catch {
    return results;
  }

  for (const sub of subdirs) {
    try {
      results.push(...(await readDirectoryHandle(sub.handle, sub.path)));
    } catch {
      // Skip unreadable nested folders.
    }
  }
  return results;
}

/** Chrome/Edge: durable folder picker. Returns null if cancelled / unsupported. */
async function pickFolderViaDirectoryPicker(): Promise<{
  files: ScannedFile[];
  folderName: string;
} | null> {
  const showPicker = (window as ShowDirectoryPickerWindow).showDirectoryPicker;
  if (typeof showPicker !== 'function') return null;

  try {
    const dir = await showPicker({ mode: 'read' });
    const files = await readDirectoryHandle(dir, dir.name);
    return { files, folderName: dir.name };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
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
  onRename,
  canRemove,
  canRename,
  t,
}: {
  item: KbQueuedFile;
  onRemove: () => void;
  onRename?: (nextPath: string) => void;
  canRemove: boolean;
  canRename?: boolean;
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
        onRename={onRename}
        canRemove={canRemove && !exiting}
        canRename={canRename && !exiting}
        t={t}
      />
    </div>
  );
}

export function KbUploadRow({
  item,
  onRemove,
  onRename,
  canRemove,
  canRename,
  t,
}: {
  item: KbQueuedFile;
  onRemove?: () => void;
  onRename?: (nextPath: string) => void;
  canRemove?: boolean;
  canRename?: boolean;
  t: ReturnType<typeof useTranslations<'documents'>>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(displayPath(item));
  const active = ['queued', 'signing', 'uploading', 'finalizing'].includes(item.status);
  const isDone = item.status === 'done';
  const isSkipped = item.status === 'skipped';
  const isError = item.status === 'error';
  const showProgress = active || isDone || isSkipped || isError;
  const allowRename = Boolean(canRename && onRename && item.status === 'pending');

  function startRename() {
    setDraftName(displayPath(item));
    setEditing(true);
  }

  function saveRename() {
    const next = draftName.trim();
    if (!next || !onRename) return;
    onRename(next);
    setEditing(false);
  }

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
      {editing ? (
        <form
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveRename();
          }}
        >
          <input
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm"
            aria-label={t('rename')}
          />
          <button type="submit" className="text-xs font-medium text-primary hover:underline">
            {t('saveRename')}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-muted-foreground hover:underline"
          >
            {t('cancelRename')}
          </button>
        </form>
      ) : (
        <p className="min-w-0 flex-1 truncate font-medium" title={displayPath(item)}>
          {displayPath(item)}
        </p>
      )}
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
      {!editing && item.status === 'pending' && (
        <div className="flex shrink-0 items-center gap-3">
          {allowRename && (
            <button
              type="button"
              onClick={startRename}
              className="text-xs text-primary hover:underline"
            >
              {t('rename')}
            </button>
          )}
          {canRemove && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-destructive hover:underline"
            >
              {t('remove')}
            </button>
          )}
        </div>
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
  canRename = false,
  listRef,
}: KbFileUploaderProps) {
  const t = useTranslations('documents');
  const folderInputId = useId();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const isUploading = files.some((f) =>
    ['queued', 'signing', 'uploading', 'finalizing'].includes(f.status),
  );
  const zoneDisabled = disabled || blockNewFiles || scanning;

  const mergeIncoming = useCallback(
    (incoming: ScannedFile[], folderName: string | null) => {
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
    },
    [files, onChange, onFolderName, single, t],
  );

  function addFilesFromList(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) {
      if (allowFolder) setWarning(t('folderScanEmpty'));
      return;
    }
    const scanned = filesFromFileList(incoming);
    mergeIncoming(scanned, folderNameFromFiles(Array.from(incoming)));
  }

  async function chooseFolder() {
    if (zoneDisabled) return;
    setWarning(null);
    setScanning(true);
    try {
      // Prefer durable Chrome/Edge directory picker over drag-drop (Windows/OneDrive).
      const picked = await pickFolderViaDirectoryPicker();
      if (picked) {
        if (picked.files.length === 0) {
          setWarning(t('folderScanEmpty'));
          return;
        }
        mergeIncoming(picked.files, picked.folderName);
        return;
      }
      // Fallback: native webkitdirectory input (works when showDirectoryPicker is missing).
      folderInputRef.current?.click();
    } catch {
      setWarning(t('folderScanEmpty'));
    } finally {
      setScanning(false);
    }
  }

  const onDropzoneFiles = useCallback(
    (incoming: FileWithPath[]) => {
      if (zoneDisabled || incoming.length === 0) {
        if (allowFolder && incoming.length === 0) setWarning(t('folderUseBrowse'));
        return;
      }
      setWarning(null);
      const scanned = scannedFromDropzoneFiles(incoming);
      const folderName = folderNameFromFiles(incoming);
      mergeIncoming(scanned, folderName);
    },
    [allowFolder, mergeIncoming, t, zoneDisabled],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    // Keep classic <input> so webkitdirectory / multi-file both work on Windows.
    useFsAccessApi: false,
    noClick: true,
    noKeyboard: true,
    disabled: zoneDisabled,
    multiple,
    onDrop: (accepted) => onDropzoneFiles(accepted as unknown as FileWithPath[]),
    onDropRejected: () => {
      if (allowFolder) setWarning(t('folderUseBrowse'));
    },
  });

  function removeByKey(key: string) {
    onChange(files.filter((item) => kbFileKey(item) !== key));
  }

  function renameByKey(key: string, nextPath: string) {
    const trimmed = nextPath.trim();
    if (!trimmed) return;
    onChange(
      files.map((item) =>
        kbFileKey(item) === key ? { ...item, relativePath: trimmed } : item,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div
        {...getRootProps({
          className: `rounded-xl border-2 border-dashed bg-card ${
            isDragActive
              ? 'border-primary bg-primary/5'
              : isUploading
                ? 'border-primary/40'
                : 'border-muted-foreground/25 hover:border-primary/50'
          } ${zoneDisabled ? 'cursor-not-allowed opacity-70' : ''}`,
        })}
      >
        <div className="flex flex-col items-center justify-center px-6 py-8 text-center sm:flex-row sm:gap-5 sm:text-start">
          <div
            className={`mb-3 flex h-14 w-14 shrink-0 items-center justify-center rounded-full sm:mb-0 ${
              isDragActive || isUploading
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
                : isDragActive
                  ? allowFolder
                    ? t('dropActiveFolder')
                    : t('dropActive')
                  : (title ?? (allowFolder ? t('dropTitleFolderFirst') : t('dropTitle')))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hint ?? (allowFolder ? t('dropHintFolderFirst') : t('dropHint'))}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {allowFolder && (
                <button
                  type="button"
                  disabled={zoneDisabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    void chooseFolder();
                  }}
                  className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {t('chooseFolder')}
                </button>
              )}
              <button
                type="button"
                disabled={zoneDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (zoneDisabled) return;
                  // Prefer dropzone open so accept/multiple props stay in sync.
                  open();
                }}
                className="rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                {t('chooseFiles')}
              </button>
            </div>
            {allowFolder && (
              <p className="mt-3 text-xs text-muted-foreground">{t('folderWindowsTip')}</p>
            )}
          </div>
        </div>

        <input {...getInputProps({ id: inputId, accept })} />
        <input
          id={inputId + '-legacy'}
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          className="hidden"
          disabled={zoneDisabled}
          onChange={(e) => {
            addFilesFromList(e.target.files);
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
              addFilesFromList(e.target.files);
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
              canRename={canRename && !zoneDisabled}
              onRemove={() => removeByKey(kbFileKey(item))}
              onRename={(nextPath) => renameByKey(kbFileKey(item), nextPath)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { formatBytes };
