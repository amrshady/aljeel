import { describe, expect, it } from 'vitest';
import { isAcceptedDocumentFile, resolveDocumentMimeType } from './document';

describe('resolveDocumentMimeType', () => {
  it('infers PDF from extension when browser sends octet-stream', () => {
    expect(resolveDocumentMimeType('invoice.pdf', 'application/octet-stream')).toBe(
      'application/pdf',
    );
  });

  it('accepts PDF by extension even with empty mime', () => {
    expect(isAcceptedDocumentFile('scan.pdf', '', 1024)).toBe(true);
  });
});
