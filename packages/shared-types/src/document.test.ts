import { describe, expect, it } from 'vitest';
import { isAcceptedDocumentFile, resolveDocumentMimeType } from './document';

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
  });

  it('rejects files over the size limit', () => {
    const over = 50 * 1024 * 1024 + 1;
    expect(isAcceptedDocumentFile('big.pdf', 'application/pdf', over)).toBe(false);
  });
});
