'use client';

import { Button } from '@aljeel/ui';
import type { Document } from '@aljeel/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HighlightText, textMatchesQuery } from './highlight-text';
import { ApiClientError } from '@/lib/api-client';
import { markAlreadyUploadedFiles } from '@/lib/document-dedup';
import {
  allFolderPaths,
  buildDocumentTree,
  defaultExpandedFolderPaths,
  folderPathsForDocumentIds,
  type DocumentTreeNode,
} from '@/lib/document-tree';
import {
  deleteInvoiceDocument,
  downloadInvoiceDocumentsArchive,
  listInvoiceDocuments,
  renameInvoiceDocument,
} from '@/lib/invoices-api';
import { uploadInvoiceDocumentViaKb } from '@/lib/kb-upload-api';
import {
  KbFileUploader,
  KbUploadRow,
  applyKbUploadProgress,
  fileIcon,
  formatBytes,
  kbFileKey,
  patchKbFile,
  type KbQueuedFile,
} from './kb-file-uploader';

interface InvoiceDocumentsProps {
  invoiceId: string;
  editable: boolean;
  /** Jawal + draft/rejected only — rename logical evidence paths before submit. */
  canRename?: boolean;
  viewable?: boolean;
  selectedDocumentId?: string | null;
  onSelectDocument?: (documentId: string) => void;
  compact?: boolean;
}

function DocumentSkeleton() {
  return (
    <li className="flex items-center gap-3 p-3">
      <div className="h-5 w-5 animate-pulse rounded bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </li>
  );
}

function PendingFileRow({
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
  canRemove: boolean;
  canRename: boolean;
  t: ReturnType<typeof useTranslations<'documents'>>;
}) {
  return (
    <li className="px-2 py-1">
      <KbUploadRow
        item={item}
        onRemove={onRemove}
        onRename={onRename}
        canRemove={canRemove}
        canRename={canRename}
        t={t}
      />
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${
        open ? 'rotate-90' : ''
      }`}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Keeps file rows aligned with folder rows that have a chevron. */
function TreeGutter({ children }: { children?: ReactNode }) {
  return <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">{children}</span>;
}

export function InvoiceDocuments({
  invoiceId,
  editable,
  canRename = false,
  viewable = false,
  selectedDocumentId,
  onSelectDocument,
  compact = false,
}: InvoiceDocumentsProps) {
  const t = useTranslations('documents');
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<KbQueuedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [userToggledFolders, setUserToggledFolders] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const showSearch = compact && viewable;

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['invoices', invoiceId, 'documents'],
    queryFn: () => listInvoiceDocuments(invoiceId),
  });

  const documentById = useMemo(() => {
    const map = new Map<string, Document>();
    for (const doc of documents) map.set(doc.id, doc);
    return map;
  }, [documents]);

  const tree = useMemo(() => buildDocumentTree(documents), [documents]);

  const uploadMutation = useMutation({
    mutationFn: async (files: KbQueuedFile[]) => {
      setPending((current) =>
        current.map((f) =>
          files.some((q) => kbFileKey(q) === kbFileKey(f))
            ? { ...f, status: 'queued' as const, progress: 0 }
            : f,
        ),
      );
      const latestDocuments = await listInvoiceDocuments(invoiceId);
      const { nextQueue, uploadQueue } = await markAlreadyUploadedFiles(
        files,
        latestDocuments,
      );
      const byKey = new Map(nextQueue.map((item) => [kbFileKey(item), item]));
      setPending((current) => current.map((file) => byKey.get(kbFileKey(file)) ?? file));

      for (const item of uploadQueue) {
        const key = kbFileKey(item);
        setPending((current) => patchKbFile(current, key, { status: 'signing', progress: 0 }));
        try {
          await uploadInvoiceDocumentViaKb(
            invoiceId,
            item.file,
            'OTHER',
            (progress) =>
              setPending((current) => applyKbUploadProgress(current, key, progress)),
            item.checksumSha256,
            item.relativePath,
          );
          setPending((current) => patchKbFile(current, key, { status: 'done', progress: 100 }));
        } catch (err) {
          const message = err instanceof ApiClientError ? err.message : t('uploadError');
          setPending((current) => patchKbFile(current, key, { status: 'error', error: message }));
          throw err;
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId, 'documents'] });
      setPending((current) => current.filter((file) => file.status === 'skipped'));
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : t('uploadError'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => deleteInvoiceDocument(documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId, 'documents'] });
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : t('deleteError'));
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ documentId, fileName }: { documentId: string; fileName: string }) =>
      renameInvoiceDocument(documentId, fileName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId, 'documents'] });
      setEditingId(null);
      setDraftName('');
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : t('renameError'));
    },
  });

  const trimmedSearch = searchQuery.trim();
  const matchingDocumentIds = useMemo(() => {
    if (!trimmedSearch) return new Set<string>();
    return new Set(
      documents.filter((doc) => textMatchesQuery(doc.fileName, trimmedSearch)).map((doc) => doc.id),
    );
  }, [documents, trimmedSearch]);

  const firstMatchingDocumentId = useMemo(() => {
    if (!trimmedSearch) return null;
    return documents.find((doc) => textMatchesQuery(doc.fileName, trimmedSearch))?.id ?? null;
  }, [documents, trimmedSearch]);

  const matchingFolderPaths = useMemo(
    () => folderPathsForDocumentIds(tree, matchingDocumentIds),
    [tree, matchingDocumentIds],
  );

  const visibleExpandedPaths = useMemo(() => {
    if (trimmedSearch) {
      return matchingFolderPaths;
    }
    if (!userToggledFolders) {
      return defaultExpandedFolderPaths(tree);
    }
    return expandedPaths;
  }, [trimmedSearch, matchingFolderPaths, tree, userToggledFolders, expandedPaths]);

  useEffect(() => {
    if (!userToggledFolders && !trimmedSearch && tree.length > 0) {
      setExpandedPaths(defaultExpandedFolderPaths(tree));
    }
  }, [tree, userToggledFolders, trimmedSearch]);

  useEffect(() => {
    if (!firstMatchingDocumentId || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-doc-id="${firstMatchingDocumentId}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    onSelectDocument?.(firstMatchingDocumentId);
  }, [firstMatchingDocumentId, onSelectDocument]);

  const busy =
    uploadMutation.isPending ||
    deleteMutation.isPending ||
    renameMutation.isPending ||
    downloadingAll;
  const pendingUploads = pending.filter((f) => f.status === 'pending');
  const uploading = pending.filter((f) => !['pending'].includes(f.status));
  const showList =
    isLoading ||
    uploading.length > 0 ||
    pendingUploads.length > 0 ||
    documents.length > 0;
  const canDownloadAll = !isLoading && documents.length > 0;
  const hasFolders = tree.some((node) => node.kind === 'folder');

  async function handleDownloadAll() {
    if (!canDownloadAll || downloadingAll) return;
    setDownloadingAll(true);
    setError(null);
    try {
      await downloadInvoiceDocumentsArchive(invoiceId);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('downloadAllError'));
    } finally {
      setDownloadingAll(false);
    }
  }

  function toggleFolder(path: string) {
    setUserToggledFolders(true);
    setExpandedPaths((current) => {
      const base =
        current.size > 0 || userToggledFolders ? current : defaultExpandedFolderPaths(tree);
      const next = new Set(base);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function expandAllFolders() {
    setUserToggledFolders(true);
    setExpandedPaths(allFolderPaths(tree));
  }

  function collapseAllFolders() {
    setUserToggledFolders(true);
    setExpandedPaths(new Set());
  }

  function startRename(documentId: string, fileName: string) {
    setEditingId(documentId);
    setDraftName(fileName);
    setError(null);
  }

  function cancelRename() {
    setEditingId(null);
    setDraftName('');
  }

  function saveRename(documentId: string) {
    const next = draftName.trim();
    if (!next) {
      setError(t('renameEmpty'));
      return;
    }
    renameMutation.mutate({ documentId, fileName: next });
  }

  function renamePending(item: KbQueuedFile, nextPath: string) {
    const key = kbFileKey(item);
    const trimmed = nextPath.trim();
    if (!trimmed) {
      setError(t('renameEmpty'));
      return;
    }
    setPending((current) =>
      patchKbFile(current, key, {
        relativePath: trimmed,
      }),
    );
    setError(null);
  }

  function renderTreeNodes(nodes: DocumentTreeNode[], depth: number): ReactNode[] {
    const rows: ReactNode[] = [];

    for (const node of nodes) {
      if (node.kind === 'folder') {
        const open = visibleExpandedPaths.has(node.path);
        const folderMatchesSearch =
          trimmedSearch.length > 0 &&
          (matchingFolderPaths.has(node.path) || textMatchesQuery(node.name, trimmedSearch));

        rows.push(
          <li key={`folder:${node.path}`} className="list-none text-sm">
            <button
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 ${
                trimmedSearch && !folderMatchesSearch ? 'opacity-40' : ''
              }`}
              style={{ paddingInlineStart: `${10 + depth * 12}px` }}
              onClick={() => toggleFolder(node.path)}
              aria-expanded={open}
            >
              <TreeGutter>
                <Chevron open={open} />
              </TreeGutter>
              <span className="text-base leading-none" aria-hidden>
                📁
              </span>
              <span className="min-w-0 flex-1 break-all font-medium" title={node.path}>
                {trimmedSearch ? (
                  <HighlightText text={node.name} query={trimmedSearch} />
                ) : (
                  node.name
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t('folderFileCount', { count: node.fileCount })}
              </span>
            </button>
            {open && (
              <ul className="m-0 list-none p-0">{renderTreeNodes(node.children, depth + 1)}</ul>
            )}
          </li>,
        );
        continue;
      }

      const doc = documentById.get(node.document.id);
      if (!doc) continue;

      const editing = editingId === doc.id;
      const searchMatch =
        trimmedSearch.length > 0 && matchingDocumentIds.has(doc.id);
      const searchMismatch = trimmedSearch.length > 0 && !searchMatch;

      rows.push(
        <li
          key={doc.id}
          data-doc-id={doc.id}
          className={`list-none py-1.5 pe-3 text-sm ${
            viewable && !editing ? 'cursor-pointer hover:bg-muted/50' : ''
          } ${
            searchMatch
              ? 'bg-yellow-50 ring-1 ring-inset ring-yellow-300 dark:bg-yellow-950/30 dark:ring-yellow-600/50'
              : selectedDocumentId === doc.id
                ? 'bg-muted'
                : ''
          } ${searchMismatch ? 'opacity-40' : ''}`}
          style={{ paddingInlineStart: `${10 + depth * 12}px` }}
          onClick={
            viewable && onSelectDocument && !editing
              ? () => onSelectDocument(doc.id)
              : undefined
          }
        >
          <div className="flex min-w-0 items-start gap-2">
            <TreeGutter />
            <span className="mt-0.5 text-base leading-none" aria-hidden>
              {fileIcon(node.name)}
            </span>
            <div className="min-w-0 flex-1">
              {editing ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveRename(doc.id);
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    disabled={renameMutation.isPending}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    aria-label={t('rename')}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={renameMutation.isPending}
                      className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      {t('saveRename')}
                    </button>
                    <button
                      type="button"
                      onClick={cancelRename}
                      disabled={renameMutation.isPending}
                      className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                    >
                      {t('cancelRename')}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="break-all font-medium leading-snug" title={doc.fileName}>
                    {trimmedSearch ? (
                      <HighlightText text={node.name} query={trimmedSearch} />
                    ) : (
                      node.name
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatBytes(doc.sizeBytes)} · {t(`scan.${doc.virusScanStatus}`)}
                  </p>
                  {(canRename || editable) && (
                    <div
                      className="mt-1 flex flex-wrap items-center gap-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {canRename && (
                        <button
                          type="button"
                          onClick={() => startRename(doc.id, doc.fileName)}
                          disabled={busy}
                          className="text-xs text-primary hover:underline disabled:opacity-50"
                        >
                          {t('rename')}
                        </button>
                      )}
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
                  )}
                </>
              )}
            </div>
          </div>
        </li>,
      );
    }

    return rows;
  }

  return (
    <section className={compact ? undefined : 'mt-8'}>
      {!compact && (
        <>
          <h2 className="font-semibold">{t('title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </>
      )}

      {showList && (
        <div
          className={`overflow-hidden rounded-xl border bg-card shadow-sm ${compact ? '' : 'mt-4'}`}
        >
          {(showSearch || canDownloadAll || hasFolders) && (
            <div className="border-b">
              {showSearch && (
                <div className="px-3 pt-2">
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t('searchFiles')}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    aria-label={t('searchFiles')}
                  />
                  {trimmedSearch && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {matchingDocumentIds.size === 0
                        ? t('searchNoResults')
                        : t('searchMatchCount', { count: matchingDocumentIds.size })}
                    </p>
                  )}
                </div>
              )}
              {(hasFolders || canDownloadAll) && (
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {hasFolders && !trimmedSearch && (
                      <>
                        <button
                          type="button"
                          onClick={expandAllFolders}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {t('expandAll')}
                        </button>
                        <button
                          type="button"
                          onClick={collapseAllFolders}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {t('collapseAll')}
                        </button>
                      </>
                    )}
                  </div>
                  {canDownloadAll && (
                    <button
                      type="button"
                      onClick={() => void handleDownloadAll()}
                      disabled={busy}
                      className="shrink-0 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      {downloadingAll ? t('downloadingAll') : t('downloadAll')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <ul
            ref={listRef}
            className={`m-0 list-none p-0 ${compact ? 'max-h-[min(80vh,900px)] overflow-y-auto' : ''}`}
          >
            {isLoading && (
              <>
                <DocumentSkeleton />
                <DocumentSkeleton />
              </>
            )}
            {!isLoading &&
              uploading.map((item) => (
                <PendingFileRow
                  key={kbFileKey(item)}
                  item={item}
                  canRemove={false}
                  canRename={false}
                  t={t}
                />
              ))}
            {!isLoading &&
              pendingUploads.map((item) => (
                <PendingFileRow
                  key={kbFileKey(item)}
                  item={item}
                  canRemove={editable && !busy}
                  canRename={canRename && !busy}
                  onRemove={() =>
                    setPending((current) =>
                      current.filter((file) => kbFileKey(file) !== kbFileKey(item)),
                    )
                  }
                  onRename={(next) => renamePending(item, next)}
                  t={t}
                />
              ))}
            {!isLoading && renderTreeNodes(tree, 0)}
          </ul>
        </div>
      )}

      {!isLoading && !showList && !editable && (
        <p className="mt-4 text-sm text-muted-foreground">{t('empty')}</p>
      )}

      {editable && (
        <div className="mt-4">
          <KbFileUploader
            files={pendingUploads}
            onChange={(next) => {
              const kept = pending.filter((f) => f.status !== 'pending');
              setPending([...kept, ...next]);
            }}
            blockNewFiles={busy}
            allowFolder
            showFileList={false}
            title={t('dropTitle')}
            hint={t('dropHint')}
          />
          {pendingUploads.length > 0 && (
            <Button
              type="button"
              className="mt-3"
              disabled={busy}
              onClick={() => uploadMutation.mutate(pendingUploads)}
            >
              {uploadMutation.isPending
                ? t('uploading')
                : t('uploadCount', { count: pendingUploads.length })}
            </Button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
