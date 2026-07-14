import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { JawalEvidenceCheckService } from './jawal-evidence-check.service';

function streamFromBuffer(buffer: Buffer): Readable {
  return Readable.from([buffer]);
}

function buildJawalXlsx(
  rows: Array<[string, string, string, string, string?]>,
): Buffer {
  const grid = [
    ['Ref.No', 'Ticket', 'Description', 'Account', 'Type'],
    ...rows.map((row) => [...row]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Lines');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

describe('JawalEvidenceCheckService', () => {
  it('blocks submission when Ref.No is malformed', async () => {
    const report = buildJawalXlsx([
      ['CE-202-26', '6905428831', 'Travel', '51000001', 'Travel'],
    ]);
    const kb = {
      createReadStream: vi.fn().mockResolvedValue(streamFromBuffer(report)),
    };
    const service = new JawalEvidenceCheckService({} as never, kb as never);

    const result = await service.validateUploadedFolder([
      {
        fileName: 'invoice-source.xlsx',
        storageKey: 'invoices/inv-1/invoice-source.xlsx',
        sizeBytes: report.length,
      },
      {
        fileName: 'CE-20-2026/approval.msg',
        storageKey: 'local:unused',
        sizeBytes: 120,
      },
    ]);

    expect(result.error?.code).toBe('JAWAL_REF_MALFORMED');
    expect(result.error?.details?.malformedRefs).toContain('CE-202-26');
  });

  it('passes a travel line with matching folder + .msg + supporting pdf', async () => {
    const report = buildJawalXlsx([
      ['SIS-14', '6905428831', 'Staff travel', '51000001', 'Travel'],
    ]);
    const kb = {
      createReadStream: vi.fn().mockResolvedValue(streamFromBuffer(report)),
    };
    const service = new JawalEvidenceCheckService({} as never, kb as never);

    const result = await service.validateUploadedFolder([
      {
        fileName: 'invoice-source.xlsx',
        storageKey: 'invoices/inv-1/invoice-source.xlsx',
        sizeBytes: report.length,
      },
      {
        fileName: 'SIS-14/approval.msg',
        storageKey: 'local:a',
        sizeBytes: 180,
      },
      {
        fileName: 'SIS-14/eticket.pdf',
        storageKey: 'local:b',
        sizeBytes: 300,
      },
    ]);

    expect(result.error).toBeNull();
  });
});
