export type AsateelInvoiceManifestIssueCode =
  | 'ASATEEL_INVOICE_TABLE_REQUIRED'
  | 'ASATEEL_INVOICE_TABLE_EMPTY'
  | 'ASATEEL_INVOICE_FILES_MISSING'
  | 'ASATEEL_INVOICE_FILES_EXTRA';

export interface AsateelInvoiceManifestIssue {
  code: AsateelInvoiceManifestIssueCode;
  message: string;
  details?: {
    missingInvoiceNos?: string[];
    extraFileNames?: string[];
    sourceSpreadsheet?: string;
  };
}

export interface AsateelInvoiceManifestValidation {
  error: AsateelInvoiceManifestIssue | null;
  warning: AsateelInvoiceManifestIssue | null;
}

const INVOICE_NO_HEADER = /invoice\s*(?:no\.?|number)/i;
const SUPPLIER_DESCRIPTION_INVOICE = /(?:^|\/)\s*(\d{4,5})\s*$/;
const EXPENSES_DESCRIPTION_HEADERS = new Set([
  'descriptioncomments',
  'description',
  'comments',
]);

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

function extractInvoiceNoColumnNumbers(grid: unknown[][]): string[] {
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

function normalizedHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeExpensesInvoiceNo(value: unknown): string | null {
  const invoiceNo = normalizeInvoiceNoCell(value);
  if (!invoiceNo || !/^\d{4,5}$/.test(invoiceNo)) return null;
  return invoiceNo.padStart(5, '0');
}

/**
 * Mirrors asateel_poc.py load_expenses_format:
 * - row-level description invoices use _supplier_description_invoice's regex;
 * - the Invoice Number header value fills down until the next header value;
 * - description values take precedence over the current header invoice.
 *
 * Supplier rows may populate more than one cell in the four-column merged
 * DESCRIPTION / Comments span, so every matching cell is retained.
 */
function extractExpensesFormatInvoiceNumbers(grid: unknown[][]): string[] {
  for (let headerRow = 0; headerRow < Math.min(grid.length, 10); headerRow += 1) {
    const cells = grid[headerRow] ?? [];
    const invoiceColumn = cells.findIndex(
      (cell) => normalizedHeader(cell) === 'invoicenumber',
    );
    const descriptionColumn = cells.findIndex((cell) =>
      EXPENSES_DESCRIPTION_HEADERS.has(normalizedHeader(cell)),
    );
    if (invoiceColumn < 0 || descriptionColumn < 0) continue;

    const numbers: string[] = [];
    let currentInvoice: string | null = null;
    for (let row = headerRow + 1; row < grid.length; row += 1) {
      const values = grid[row] ?? [];
      const headerInvoice = normalizeExpensesInvoiceNo(values[invoiceColumn]);
      if (headerInvoice) currentInvoice = headerInvoice;

      const descriptionInvoices: string[] = [];
      for (let column = descriptionColumn; column < descriptionColumn + 4; column += 1) {
        const match = SUPPLIER_DESCRIPTION_INVOICE.exec(String(values[column] ?? '').trim());
        if (match?.[1]) descriptionInvoices.push(match[1].padStart(5, '0'));
      }
      if (descriptionInvoices.length > 0) {
        numbers.push(...descriptionInvoices);
      } else if (currentInvoice) {
        numbers.push(currentInvoice);
      }
    }
    return [...new Set(numbers)];
  }
  return [];
}

export function extractInvoiceNumbersFromGrid(grid: unknown[][]): string[] {
  const expensesNumbers = extractExpensesFormatInvoiceNumbers(grid);
  const columnNumbers = extractInvoiceNoColumnNumbers(grid);
  if (expensesNumbers.length === 0) return columnNumbers;

  // Expenses Format uses the same Invoice Number header for fill-down. Keep the
  // existing column path additive while returning its numeric values in the
  // pipeline's canonical five-character form.
  const normalizedColumnNumbers = columnNumbers.map(
    (invoiceNo) => normalizeExpensesInvoiceNo(invoiceNo) ?? invoiceNo,
  );
  return [...new Set([...normalizedColumnNumbers, ...expensesNumbers])];
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

function attachmentBasename(fileName: string): string {
  return fileName.split(/[\\/]/).pop() ?? fileName;
}

export function validateAsateelInvoiceManifest(
  invoiceNos: string[],
  folderFileNames: string[],
): AsateelInvoiceManifestValidation {
  if (invoiceNos.length === 0) {
    return {
      error: {
        code: 'ASATEEL_INVOICE_TABLE_EMPTY',
        message:
          'The uploaded spreadsheet does not contain any invoice numbers in the Invoice No column.',
      },
      warning: null,
    };
  }

  const attachments = folderFileNames.filter((fileName) => !isSpreadsheetFileName(fileName));
  const missingInvoiceNos = invoiceNos.filter(
    (invoiceNo) => !attachments.some((fileName) => fileMatchesInvoiceNo(fileName, invoiceNo)),
  );
  const extraFileNames = attachments
    .filter(
      (fileName) =>
        !invoiceNos.some((invoiceNo) => fileMatchesInvoiceNo(fileName, invoiceNo)),
    )
    .map(attachmentBasename);

  const error =
    missingInvoiceNos.length > 0
      ? {
          code: 'ASATEEL_INVOICE_FILES_MISSING' as const,
          message: `Missing uploaded files for invoice numbers: ${missingInvoiceNos.join(', ')}.`,
          details: { missingInvoiceNos },
        }
      : null;

  const warning =
    extraFileNames.length > 0
      ? {
          code: 'ASATEEL_INVOICE_FILES_EXTRA' as const,
          message: `These files are not listed in the spreadsheet Invoice No column: ${extraFileNames.join(', ')}.`,
          details: { extraFileNames },
        }
      : null;

  return { error, warning };
}
