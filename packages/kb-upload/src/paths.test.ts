import { describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', () => ({
  randomUUID: () => 'fixed-uuid',
}));

import { invoiceDocumentKey, sanitizeKbFileName, toFullObjectKey } from './paths';

describe('sanitizeKbFileName', () => {
  it('takes the last path segment', () => {
    expect(sanitizeKbFileName('folder/sub/invoice.pdf')).toBe('invoice.pdf');
  });

  it('replaces unsafe characters', () => {
    expect(sanitizeKbFileName('my file (1).pdf')).toBe('my_file_1_.pdf');
  });

  it('falls back to file when sanitized name is empty', () => {
    expect(sanitizeKbFileName('')).toBe('file');
  });
});

describe('invoiceDocumentKey', () => {
  it('builds key with invoice id and sanitized name', () => {
    expect(invoiceDocumentKey('inv-1', 'scan.pdf')).toBe('invoices/inv-1/fixed-uuid-scan.pdf');
  });
});

describe('toFullObjectKey', () => {
  it('joins tenant prefix and storage key', () => {
    expect(toFullObjectKey('current/', 'invoices/inv-1/file.pdf')).toBe(
      'current/invoices/inv-1/file.pdf',
    );
  });
});
