import type { Document } from '@aljeel/shared-types';
import { sanitizeEvidenceRelativePath } from '@aljeel/shared-types';
import { sha256File } from '@aljeel/kb-upload';
import type { KbQueuedFile } from '@/components/kb-file-uploader';

export function sanitizeDocumentFileName(name: string): string {
  return sanitizeEvidenceRelativePath(name);
}

function dedupKey(fileName: string, sizeBytes: number, checksumSha256: string): string {
  return `${fileName}\u0000${sizeBytes}\u0000${checksumSha256}`;
}

function documentHasChecksum(doc: Document): doc is Document & { checksumSha256: string } {
  return typeof doc.checksumSha256 === 'string' && doc.checksumSha256.length > 0;
}

export async function markAlreadyUploadedFiles(
  queue: KbQueuedFile[],
  documents: Document[],
): Promise<{ nextQueue: KbQueuedFile[]; uploadQueue: KbQueuedFile[] }> {
  const existing = new Set(
    documents
      .filter(documentHasChecksum)
      .filter((doc) => doc.virusScanStatus !== 'FAILED')
      .map((doc) => dedupKey(doc.fileName, doc.sizeBytes, doc.checksumSha256)),
  );

  const nextQueue: KbQueuedFile[] = [];
  const uploadQueue: KbQueuedFile[] = [];

  for (const item of queue) {
    const checksumSha256 = item.checksumSha256 ?? (await sha256File(item.file));
    const fileName = sanitizeDocumentFileName(item.relativePath ?? item.file.name);
    const nextItem = { ...item, checksumSha256 };
    if (existing.has(dedupKey(fileName, item.file.size, checksumSha256))) {
      nextQueue.push({ ...nextItem, status: 'skipped', progress: 100, error: undefined });
    } else {
      nextQueue.push(nextItem);
      uploadQueue.push(nextItem);
    }
  }

  return { nextQueue, uploadQueue };
}
