import { describe, expect, it } from 'vitest';
import {
  extractInvoiceNumbersFromGrid,
  fileMatchesInvoiceNo,
  findInvoiceNoColumn,
  invoiceNoVariants,
  validateAsateelInvoiceManifest,
} from './asateel-invoice-manifest';

describe('asateel invoice manifest', () => {
  const grid = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', 'Invoice No'],
    ['1', 'Central', '', '2-May-2026', 'D-001', 'V-001', 'Reefer Truck', 'ABC123', '10', 'Riyadh', "Ha'il", 'Customer A', '1', '03041'],
    ['2', 'Central', '', '2-May-2026', 'D-002', 'V-002', 'Reefer Truck', 'ABC124', '10', 'Riyadh', 'Dammam', 'Customer B', '1', '3042'],
    ['3', 'Central', '', '2-May-2026', 'D-003', 'V-003', 'Reefer Truck', 'ABC125', '10', 'Riyadh', 'Jeddah', 'Customer C', '1', '03067'],
  ];

  it('finds the Invoice No column', () => {
    expect(findInvoiceNoColumn(grid)).toEqual({ columnIndex: 13, headerRow: 0 });
  });

  it('extracts invoice numbers from the shipping report table', () => {
    expect(extractInvoiceNumbersFromGrid(grid)).toEqual(['03041', '3042', '03067']);
  });

  it('matches attachment names with optional suffixes and leading zeros', () => {
    expect(fileMatchesInvoiceNo('03041_0001.pdf', '03041')).toBe(true);
    expect(fileMatchesInvoiceNo('3042_0001.pdf', '3042')).toBe(true);
    expect(fileMatchesInvoiceNo('03067_0001.pdf', '99999')).toBe(false);
  });

  it('matches Arabic suffix file names and sanitized storage names', () => {
    expect(fileMatchesInvoiceNo('03298-8 اداره.pdf', '03298')).toBe(true);
    expect(fileMatchesInvoiceNo('0001_2026/03298-8 اداره.pdf', '03298')).toBe(true);
    expect(fileMatchesInvoiceNo('03298-8______.pdf', '03298')).toBe(true);
  });

  it('builds padded and unpadded variants', () => {
    expect(invoiceNoVariants('3042')).toContain('03042');
    expect(invoiceNoVariants('03041')).toContain('3041');
  });

  it('requires a matching file for every invoice number', () => {
    const result = validateAsateelInvoiceManifest(['03041', '3042', '03067'], [
      '03041_0001.pdf',
      '3042_0001.pdf',
      'Main 8-2026.xlsx',
    ]);
    expect(result.error?.code).toBe('ASATEEL_INVOICE_FILES_MISSING');
    expect(result.error?.details?.missingInvoiceNos).toEqual(['03067']);
    expect(result.warning).toBeNull();
  });

  it('passes when every invoice number has a matching attachment', () => {
    const result = validateAsateelInvoiceManifest(['03041', '3042'], [
      '03041_0001.pdf',
      '3042_0001.pdf',
      'report.xlsx',
    ]);
    expect(result.error).toBeNull();
    expect(result.warning).toBeNull();
  });

  it('warns when attachments are not listed in the spreadsheet', () => {
    const result = validateAsateelInvoiceManifest(['03041'], [
      '03041_0001.pdf',
      '99999_0001.pdf',
      'report.xlsx',
    ]);
    expect(result.error).toBeNull();
    expect(result.warning?.code).toBe('ASATEEL_INVOICE_FILES_EXTRA');
    expect(result.warning?.details?.extraFileNames).toEqual(['99999_0001.pdf']);
  });

  it('blocks on missing files even when extra files are present', () => {
    const result = validateAsateelInvoiceManifest(['03041', '03042'], [
      '03041_0001.pdf',
      '99999_0001.pdf',
      'report.xlsx',
    ]);
    expect(result.error?.code).toBe('ASATEEL_INVOICE_FILES_MISSING');
    expect(result.error?.details?.missingInvoiceNos).toEqual(['03042']);
    expect(result.warning?.code).toBe('ASATEEL_INVOICE_FILES_EXTRA');
  });
});
