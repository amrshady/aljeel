import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  MAX_SPREADSHEET_PREVIEW_COLS,
  MAX_SPREADSHEET_PREVIEW_ROWS,
  columnLetter,
  isSpreadsheetDocument,
  parseSpreadsheetPreview,
  SpreadsheetPreviewError,
} from './spreadsheet-preview';

function workbookBuffer(sheets: Record<string, unknown[][]>): Uint8Array {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

describe('isSpreadsheetDocument', () => {
  it('recognizes Excel extensions regardless of MIME', () => {
    expect(isSpreadsheetDocument('application/octet-stream', '426_3_8-2026/_8-2026_.xlsx')).toBe(
      true,
    );
    expect(isSpreadsheetDocument('', 'report.XLS')).toBe(true);
    expect(isSpreadsheetDocument('', 'macro.xlsm')).toBe(true);
    expect(isSpreadsheetDocument('', 'lines.csv')).toBe(true);
  });

  it('recognizes spreadsheet MIME types without an extension', () => {
    expect(
      isSpreadsheetDocument(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'invoice-source',
      ),
    ).toBe(true);
    expect(isSpreadsheetDocument('application/vnd.ms-excel', 'legacy')).toBe(true);
  });

  it('rejects PDFs and images', () => {
    expect(isSpreadsheetDocument('application/pdf', '03045_0001.pdf')).toBe(false);
    expect(isSpreadsheetDocument('image/png', 'scan.png')).toBe(false);
  });
});

describe('columnLetter', () => {
  it('uses Excel-style column labels', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(27)).toBe('AB');
  });
});

describe('parseSpreadsheetPreview', () => {
  it('reads sheet names and cell values', () => {
    const buffer = workbookBuffer({
      Lines: [
        ['Ref.No', 'Ticket'],
        [101, 'T-1'],
      ],
      Notes: [['ok']],
    });

    const preview = parseSpreadsheetPreview(buffer, 'invoice.xlsx');
    expect(preview.sheets.map((sheet) => sheet.name)).toEqual(['Lines', 'Notes']);
    expect(preview.sheets[0]?.rows[0]).toEqual(['Ref.No', 'Ticket']);
    expect(preview.sheets[0]?.rows[1]?.[1]).toBe('T-1');
    expect(preview.sheets[0]?.totalRows).toBe(2);
    expect(preview.sheets[0]?.truncatedRows).toBe(false);
  });

  it('parses CSV text', () => {
    const csv = 'Invoice,Amount\n42,15.5\n';
    const preview = parseSpreadsheetPreview(new TextEncoder().encode(csv), 'report.csv');
    expect(preview.sheets[0]?.rows[0]).toEqual(['Invoice', 'Amount']);
    expect(preview.sheets[0]?.rows[1]).toEqual(['42', '15.5']);
  });

  it('caps rows and columns for preview', () => {
    const wide = Array.from({ length: MAX_SPREADSHEET_PREVIEW_COLS + 3 }, (_, i) => `c${i}`);
    const tall = Array.from({ length: MAX_SPREADSHEET_PREVIEW_ROWS + 5 }, (_, i) => [`r${i}`]);
    const buffer = workbookBuffer({ Wide: [wide], Tall: tall });

    const preview = parseSpreadsheetPreview(buffer, 'big.xlsx');
    const wideSheet = preview.sheets[0];
    const tallSheet = preview.sheets[1];
    expect(wideSheet?.truncatedCols).toBe(true);
    expect(wideSheet?.rows[0]).toHaveLength(MAX_SPREADSHEET_PREVIEW_COLS);
    expect(tallSheet?.truncatedRows).toBe(true);
    expect(tallSheet?.rows).toHaveLength(MAX_SPREADSHEET_PREVIEW_ROWS);
    expect(tallSheet?.totalRows).toBe(MAX_SPREADSHEET_PREVIEW_ROWS + 5);
  });

  it('throws PARSE for garbage bytes pretending to be xlsx', () => {
    expect(() =>
      parseSpreadsheetPreview(new TextEncoder().encode('not-a-workbook'), 'broken.xlsx'),
    ).toThrow(SpreadsheetPreviewError);
  });
});
