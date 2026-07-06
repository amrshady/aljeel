import { describe, expect, it } from 'vitest';
import { isXlsxFileName, validateInvoiceSubmitDocuments } from './invoice-submit';

describe('validateInvoiceSubmitDocuments', () => {
  it('requires at least one file', () => {
    expect(validateInvoiceSubmitDocuments([])).toEqual({
      code: 'DOCUMENTS_REQUIRED',
      message: 'At least one document must be attached before submitting.',
    });
  });

  it('requires at least two xlsx files', () => {
    expect(validateInvoiceSubmitDocuments(['invoice.pdf', 'report.XLSX'])).toEqual({
      code: 'XLSX_REQUIRED',
      message: 'At least 2 Excel (.xlsx) files are required before submitting.',
    });
  });

  it('passes when one other file and two xlsx files are present', () => {
    expect(
      validateInvoiceSubmitDocuments([
        'invoice.pdf',
        'sheet-a.xlsx',
        'folder/sheet-b.xlsx',
      ]),
    ).toBeNull();
  });
});

describe('isXlsxFileName', () => {
  it('matches xlsx case-insensitively', () => {
    expect(isXlsxFileName('data.XLSX')).toBe(true);
    expect(isXlsxFileName('data.xls')).toBe(false);
  });
});
