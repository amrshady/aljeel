import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { AsateelInvoiceManifestService } from './asateel-invoice-manifest.service';

function streamFromBuffer(buffer: Buffer): Readable {
  return Readable.from([buffer]);
}

function buildShippingReportXlsx(invoiceNos: string[]): Buffer {
  const grid = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', 'Invoice No'],
    ...invoiceNos.map((invoiceNo, index) => [
      String(index + 1),
      'Central',
      '',
      '2-May-2026',
      `D-${index + 1}`,
      `V-${index + 1}`,
      'Reefer Truck',
      'ABC123',
      '10',
      'Riyadh',
      "Ha'il",
      'Customer',
      '1',
      invoiceNo,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

describe('AsateelInvoiceManifestService', () => {
  it('passes when every invoice number has a matching attachment', async () => {
    const report = buildShippingReportXlsx(['03041', '03042']);
    const kb = {
      createReadStream: vi.fn().mockResolvedValue(streamFromBuffer(report)),
    };
    const storage = {
      createReadStream: vi.fn().mockReturnValue(streamFromBuffer(buildShippingReportXlsx([]))),
    };
    const service = new AsateelInvoiceManifestService(storage as never, kb as never);

    const result = await service.validateUploadedFolder([
      {
        fileName: 'report.xlsx',
        storageKey: 'invoices/inv-1/report.xlsx',
      },
      { fileName: '03041_0001.pdf', storageKey: 'local:unused' },
      { fileName: '03042_0001.pdf', storageKey: 'local:unused' },
      { fileName: 'Main 8-2026.xlsx', storageKey: 'local:summary.xlsx' },
    ]);

    expect(result.error).toBeNull();
    expect(result.warning).toBeNull();
  });

  it('reports missing attachment files for invoice numbers', async () => {
    const report = buildShippingReportXlsx(['03041', '03042', '03067']);
    const kb = {
      createReadStream: vi.fn().mockResolvedValue(streamFromBuffer(report)),
    };
    const service = new AsateelInvoiceManifestService({} as never, kb as never);

    const result = await service.validateUploadedFolder([
      { fileName: 'report.xlsx', storageKey: 'invoices/inv-1/report.xlsx' },
      { fileName: '03041_0001.pdf', storageKey: 'local:unused' },
      { fileName: '03042_0001.pdf', storageKey: 'local:unused' },
    ]);

    expect(result.error?.code).toBe('ASATEEL_INVOICE_FILES_MISSING');
    expect(result.error?.details?.missingInvoiceNos).toEqual(['03067']);
    expect(result.warning).toBeNull();
  });

  it('warns when extra attachments are not listed in the spreadsheet', async () => {
    const report = buildShippingReportXlsx(['03041']);
    const kb = {
      createReadStream: vi.fn().mockResolvedValue(streamFromBuffer(report)),
    };
    const service = new AsateelInvoiceManifestService({} as never, kb as never);

    const result = await service.validateUploadedFolder([
      { fileName: 'report.xlsx', storageKey: 'invoices/inv-1/report.xlsx' },
      { fileName: '03041_0001.pdf', storageKey: 'local:unused' },
      { fileName: '99999_0001.pdf', storageKey: 'local:unused' },
    ]);

    expect(result.error).toBeNull();
    expect(result.warning?.code).toBe('ASATEEL_INVOICE_FILES_EXTRA');
    expect(result.warning?.details?.extraFileNames).toEqual(['99999_0001.pdf']);
  });

  it('requires a spreadsheet with an Invoice No column', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Area', 'Date'], ['Central', '2-May-2026']]),
      'Summary',
    );
    const emptySheet = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    const kb = {
      createReadStream: vi.fn().mockResolvedValue(streamFromBuffer(emptySheet)),
    };
    const service = new AsateelInvoiceManifestService({} as never, kb as never);

    const result = await service.validateUploadedFolder([
      { fileName: 'empty.xlsx', storageKey: 'invoices/inv-1/empty.xlsx' },
      { fileName: '03041_0001.pdf', storageKey: 'local:unused' },
    ]);

    expect(result.error?.code).toBe('ASATEEL_INVOICE_TABLE_REQUIRED');
    expect(result.warning).toBeNull();
  });
});
