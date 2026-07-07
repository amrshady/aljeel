export type AsateelInvoiceManifestIssueCode =
  | 'ASATEEL_INVOICE_TABLE_REQUIRED'
  | 'ASATEEL_INVOICE_TABLE_EMPTY'
  | 'ASATEEL_INVOICE_FILES_MISSING';

export interface AsateelInvoiceManifestIssue {
  code: AsateelInvoiceManifestIssueCode;
  message: string;
  details?: {
    missingInvoiceNos?: string[];
    sourceSpreadsheet?: string;
  };
}

const INVOICE_NO_HEADER = /invoice\s*(?:no\.?|number)/i;

export function isSpreadsheetFileName(fileName: string): boolean {
  return /\.(xlsx|xlsm|xls|xlsb)$/i.test(fileName.trim());
}

function basename(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** Build match variants for spreadsheet values and attachment basenames. */
export function invoiceNoVariants(value: string | number): string[] {
  const raw = String(value).trim();
  if (!raw || !/^[\dA-Za-z-]+$/.test(raw)) {
    return [];
  }

  const variants = new Set<string>([raw]);
  if (/^\d+$/.test(raw)) {
    variants.add(raw.padStart(5, '0'));
    const trimmed = raw.replace(/^0+/, '') || '0';
    variants.add(trimmed);
    variants.add(trimmed.padStart(5, '0'));
  }
  return [...variants];
}

function fileNameCandidates(fileName: string): string[] {
  const trimmed = fileName.trim();
  const base = basename(trimmed);
  return trimmed === base ? [base] : [trimmed, base];
}

export function fileMatchesInvoiceNo(fileName: string, invoiceNo: string | number): boolean {
  const candidates = fileNameCandidates(fileName);
  return invoiceNoVariants(invoiceNo).some((variant) =>
    candidates.some((candidate) => {
      const base = basename(candidate);
      if (base === variant) return true;
      return base.startsWith(`${variant}_`) || base.startsWith(`${variant}-`);
    }),
  );
}

export function findInvoiceNoColumn(grid: unknown[][]): {
  columnIndex: number;
  headerRow: number;
} | null {
  for (let row = 0; row < grid.length; row += 1) {
    const cells = grid[row] ?? [];
    for (let column = 0; column < cells.length; column += 1) {
      const label = String(cells[column] ?? '').trim();
      if (INVOICE_NO_HEADER.test(label)) {
        return { columnIndex: column, headerRow: row };
      }
    }
  }
  return null;
}

function normalizeInvoiceNoCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Number.isInteger(value) ? String(value) : null;
  }
  const text = String(value).trim();
  if (!text || /^(total|sum|#|no\.?)$/i.test(text)) return null;
  if (!/^[\dA-Za-z-]+$/.test(text)) return null;
  return text;
}

export function extractInvoiceNumbersFromGrid(grid: unknown[][]): string[] {
  const location = findInvoiceNoColumn(grid);
  if (!location) return [];

  const numbers: string[] = [];
  let emptyStreak = 0;
  for (let row = location.headerRow + 1; row < grid.length; row += 1) {
    const cell = grid[row]?.[location.columnIndex];
    const invoiceNo = normalizeInvoiceNoCell(cell);
    if (!invoiceNo) {
      emptyStreak += 1;
      if (emptyStreak >= 5) break;
      continue;
    }
    emptyStreak = 0;
    numbers.push(invoiceNo);
  }

  return [...new Set(numbers)];
}

export function extractInvoiceNumbersFromWorkbookSheets(
  sheets: unknown[][][],
): string[] {
  const numbers = new Set<string>();
  for (const sheet of sheets) {
    for (const invoiceNo of extractInvoiceNumbersFromGrid(sheet)) {
      numbers.add(invoiceNo);
    }
  }
  return [...numbers];
}

export function validateAsateelInvoiceManifest(
  invoiceNos: string[],
  folderFileNames: string[],
): AsateelInvoiceManifestIssue | null {
  if (invoiceNos.length === 0) {
    return {
      code: 'ASATEEL_INVOICE_TABLE_EMPTY',
      message:
        'The uploaded spreadsheet does not contain any invoice numbers in the Invoice No column.',
    };
  }

  const attachments = folderFileNames.filter((fileName) => !isSpreadsheetFileName(fileName));
  const missingInvoiceNos = invoiceNos.filter(
    (invoiceNo) => !attachments.some((fileName) => fileMatchesInvoiceNo(fileName, invoiceNo)),
  );

  if (missingInvoiceNos.length > 0) {
    return {
      code: 'ASATEEL_INVOICE_FILES_MISSING',
      message: `Missing uploaded files for invoice numbers: ${missingInvoiceNos.join(', ')}.`,
      details: { missingInvoiceNos },
    };
  }

  return null;
}
