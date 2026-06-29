'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type DragEvent } from 'react';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  isAcceptedDocumentFile,
} from '@aljeel/shared-types';

const ACCEPT_ATTR = `${ALLOWED_DOCUMENT_MIME_TYPES.join(',')},.pdf,.xml`;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export function FileDropzone({ files, onChange, disabled }: FileDropzoneProps) {
  const t = useTranslations('documents');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(incoming)) {
      if (!isAcceptedDocumentFile(file.name, file.type, file.size)) {
        rejected.push(file.name);
      } else {
        accepted.push(file);
      }
    }
    setWarning(rejected.length > 0 ? t('rejected', { files: rejected.join(', ') }) : null);
    if (accepted.length > 0) {
      onChange([...files, ...accepted]);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    addFiles(e.dataTransfer.files);
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-primary'}`}
      >
        <p className="text-sm font-medium">{t('dropTitle')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('dropHint')}</p>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {warning && <p className="mt-2 text-xs text-destructive">{warning}</p>}

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
            >
              <span className="truncate">
                {file.name}
                <span className="ms-2 text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={disabled}
                className="ms-3 text-xs text-destructive hover:underline disabled:opacity-50"
              >
                {t('remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
