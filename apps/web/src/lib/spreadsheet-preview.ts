import * as XLSX from 'xlsx';
import { sniffContainerMagic } from '@aljeel/shared-types';

/** Keep in-browser parsing snappy; larger workbooks can still be opened in Excel. */
export const MAX_SPREADSHEET_PREVIEW_BYTES = 25 * 1024 * 1024;
export const MAX_SPREADSHEET_PREVIEW_ROWS = 500;
export const MAX_SPREADSHEET_PREVIEW_COLS = 40;

const SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xlsm', 'xls', 'xlsb', 'csv']);

const SPREADSHEET_MIME_SNIPPETS = [
  'spreadsheetml',
  'ms-excel',
  'text/csv',
  'application/csv',
];

export class SpreadsheetPreviewError extends Error {
  constructor(
    public readonly code: 'TOO_LARGE' | 'PARSE',
    message: string,
  ) {
    super(message);
    this.name = 'SpreadsheetPreviewError';
  }
}

export type SpreadsheetSheetPreview = {
  name: string;
  rows: string[][];
  totalRows: number;
  totalCols: number;
  truncatedRows: boolean;
  truncatedCols: boolean;
};

export type SpreadsheetWorkbookPreview = {
  sheets: SpreadsheetSheetPreview[];
};

export function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

export function isSpreadsheetDocument(mimeType: string, fileName: string): boolean {
  if (SPREADSHEET_EXTENSIONS.has(fileExtension(fileName))) return true;
  const mime = mimeType.trim().toLowerCase();
  return SPREADSHEET_MIME_SNIPPETS.some((snippet) => mime.includes(snippet));
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function trimTrailingEmptyRows(rows: unknown[][]): unknown[][] {
  let last = rows.length - 1;
  while (last >= 0) {
    const row = rows[last] ?? [];
    if (row.some((cell) => cell != null && String(cell).trim() !== '')) break;
    last -= 1;
  }
  return rows.slice(0, last + 1);
}

function readWorkbook(data: ArrayBuffer | Uint8Array, fileName: string): XLSX.WorkBook {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (fileExtension(fileName) === 'csv') {
    return XLSX.read(new TextDecoder().decode(bytes), { type: 'string' });
  }
  const sniff = sniffContainerMagic(fileName, bytes);
  if (!sniff.ok) {
    throw new Error(sniff.reason ?? 'unrecognized spreadsheet');
  }
  return XLSX.read(bytes, { type: 'array', cellDates: true });
}

export function parseSpreadsheetPreview(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
): SpreadsheetWorkbookPreview {
  const byteLength = data.byteLength;
  if (byteLength > MAX_SPREADSHEET_PREVIEW_BYTES) {
    throw new SpreadsheetPreviewError(
      'TOO_LARGE',
      'This spreadsheet is too large to preview',
    );
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = readWorkbook(data, fileName);
  } catch (error) {
    if (error instanceof SpreadsheetPreviewError) throw error;
    throw new SpreadsheetPreviewError(
      'PARSE',
      error instanceof Error ? error.message : 'Could not read this spreadsheet',
    );
  }

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const rawRows = sheet
      ? (XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: '',
          raw: false,
          blankrows: true,
        }) as unknown[][])
      : [];
    const trimmed = trimTrailingEmptyRows(rawRows);
    const totalRows = trimmed.length;
    const totalCols = trimmed.reduce((max, row) => Math.max(max, row.length), 0);
    const visibleRows = trimmed.slice(0, MAX_SPREADSHEET_PREVIEW_ROWS);
    const rows = visibleRows.map((row) => {
      const cells: string[] = [];
      const limit = Math.min(totalCols, MAX_SPREADSHEET_PREVIEW_COLS);
      for (let i = 0; i < limit; i += 1) {
        cells.push(cellToString(row[i]));
      }
      return cells;
    });

    return {
      name,
      rows,
      totalRows,
      totalCols,
      truncatedRows: totalRows > MAX_SPREADSHEET_PREVIEW_ROWS,
      truncatedCols: totalCols > MAX_SPREADSHEET_PREVIEW_COLS,
    };
  });

  return { sheets };
}
