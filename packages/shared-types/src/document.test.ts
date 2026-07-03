import { describe, expect, it } from 'vitest';
import {
  isAcceptedDocumentFile,
  MAX_DOCUMENT_SIZE_BYTES,
  resolveDocumentMimeType,
} from './document';

describe('resolveDocumentMimeType', () => {
  it('infers PDF from extension when browser sends octet-stream', () => {
    expect(resolveDocumentMimeType('invoice.pdf', 'application/octet-stream')).toBe(
      'application/pdf',
    );
  });

  it('falls back to octet-stream for unknown extensions', () => {
    expect(resolveDocumentMimeType('data.bin', '')).toBe('application/octet-stream');
  });

  it('accepts files within the size limit', () => {
    expect(isAcceptedDocumentFile('archive.zip', 'application/zip', 1024)).toBe(true);
    expect(isAcceptedDocumentFile('notes.docx', '', 2048)).toBe(true);
    expect(isAcceptedDocumentFile('invoice.pdf', 'application/pdf', MAX_DOCUMENT_SIZE_BYTES)).toBe(
      true,
    );
  });

  it('rejects files over the size limit', () => {
    const over = MAX_DOCUMENT_SIZE_BYTES + 1;
    expect(isAcceptedDocumentFile('big.pdf', 'application/pdf', over)).toBe(false);
  });
});
