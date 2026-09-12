export type SupplierReconMatchStatus =
  | 'FOUND'
  | 'NOT_IN_ALJEEL'
  | 'NOT_IN_SUPPLIER'
  | 'AMOUNT_MISMATCH';

export interface AljeelInvoiceLine {
  invoiceNumber: string;
  date: string | null;
  supplierName: string | null;
  unpaidAmount: number;
  invoiceAmount: number;
  prepaymentAvailable: number;
}

export interface SupplierStatementLine {
  invoiceNumber: string;
  date: string | null;
  amount: number;
  description: string | null;
  notes: string | null;
}

export interface SupplierReconMatchRow {
  invoiceNumber: string;
  date: string | null;
  supplierAmount: number | null;
  aljeelAmount: number | null;
  unpaidAmount: number | null;
  status: SupplierReconMatchStatus;
  notes: string | null;
}

export interface SupplierReconResult {
  supplierName: string | null;
  currency: string;
  asOfDate: string;
  booksBalance: number;
  supplierBalance: number;
  prepaymentAvailable: number;
  prepaymentBlocked: boolean;
  matches: SupplierReconMatchRow[];
  paymentRequest: SupplierReconMatchRow[];
  notBookedInAljeel: SupplierReconMatchRow[];
  notInSupplierBooks: SupplierReconMatchRow[];
  amountMismatches: SupplierReconMatchRow[];
  addNotBookedTotal: number;
  deductNotInSupplierTotal: number;
  adjustedBalance: number;
  beginningDifference: number;
}

const MARKS = /[\u202d\u202c\u200e\u200f]/g;
const SL_INVOICE = /SL\s*\/\s*\d+\s*\/\s*\d{6}\s*\/\s*\d+/i;
const TOTAL_LABEL = /^(total|net to pay|الإجمالي|اجمالي)$/i;

export function cleanCell(value: unknown): string {
  return String(value ?? '')
    .replace(MARKS, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function amountsEqual(left: number, right: number): boolean {
  return Math.abs(roundMoney(left) - roundMoney(right)) < 0.005;
}

export function extractInvoiceNumber(value: unknown): string | null {
  const text = cleanCell(value);
  if (!text || TOTAL_LABEL.test(text)) return null;

  const sl = text.match(SL_INVOICE);
  if (sl) return sl[0].replace(/\s+/g, '').toUpperCase();

  const beforeColon = text.split(':')[0]?.trim() ?? '';
  if (
    beforeColon &&
    !/\s/.test(beforeColon) &&
    /^[A-Z0-9][A-Z0-9._/-]{4,}$/i.test(beforeColon)
  ) {
    return beforeColon.toUpperCase();
  }

  return null;
}

export function isTotalLabel(value: unknown): boolean {
  return TOTAL_LABEL.test(cleanCell(value));
}

export function reconcileSupplierStatement(
  aljeelLines: AljeelInvoiceLine[],
  supplierLines: SupplierStatementLine[],
  options?: { asOfDate?: string; currency?: string },
): SupplierReconResult {
  const aljeelByNumber = new Map<string, AljeelInvoiceLine>();
  for (const line of aljeelLines) {
    aljeelByNumber.set(line.invoiceNumber, line);
  }
  const supplierByNumber = new Map<string, SupplierStatementLine>();
  for (const line of supplierLines) {
    supplierByNumber.set(line.invoiceNumber, line);
  }

  const invoiceNumbers = [
    ...new Set([...aljeelByNumber.keys(), ...supplierByNumber.keys()]),
  ].sort();

  const matches: SupplierReconMatchRow[] = invoiceNumbers.map((invoiceNumber) => {
    const aljeel = aljeelByNumber.get(invoiceNumber);
    const supplier = supplierByNumber.get(invoiceNumber);
    if (aljeel && supplier) {
      const mismatch = !amountsEqual(aljeel.invoiceAmount, supplier.amount);
      return {
        invoiceNumber,
        date: supplier.date ?? aljeel.date,
        supplierAmount: roundMoney(supplier.amount),
        aljeelAmount: roundMoney(aljeel.invoiceAmount),
        unpaidAmount: roundMoney(aljeel.unpaidAmount),
        status: mismatch ? 'AMOUNT_MISMATCH' : 'FOUND',
        notes: mismatch
          ? `Aljeel ${roundMoney(aljeel.invoiceAmount)} vs supplier ${roundMoney(supplier.amount)}`
          : supplier.notes,
      };
    }
    if (supplier) {
      return {
        invoiceNumber,
        date: supplier.date,
        supplierAmount: roundMoney(supplier.amount),
        aljeelAmount: null,
        unpaidAmount: null,
        status: 'NOT_IN_ALJEEL',
        notes: supplier.notes ?? supplier.description,
      };
    }
    return {
      invoiceNumber,
      date: aljeel?.date ?? null,
      supplierAmount: null,
      aljeelAmount: roundMoney(aljeel?.invoiceAmount ?? 0),
      unpaidAmount: roundMoney(aljeel?.unpaidAmount ?? 0),
      status: 'NOT_IN_SUPPLIER',
      notes: null,
    };
  });

  const paymentRequest = matches.filter((row) => row.status === 'FOUND');
  const notBookedInAljeel = matches.filter((row) => row.status === 'NOT_IN_ALJEEL');
  const notInSupplierBooks = matches.filter((row) => row.status === 'NOT_IN_SUPPLIER');
  const amountMismatches = matches.filter((row) => row.status === 'AMOUNT_MISMATCH');

  const booksBalance = roundMoney(
    aljeelLines.reduce((sum, line) => sum + line.unpaidAmount, 0),
  );
  const supplierBalance = roundMoney(
    supplierLines.reduce((sum, line) => sum + line.amount, 0),
  );
  const prepaymentAvailable = roundMoney(
    aljeelLines.reduce((sum, line) => sum + line.prepaymentAvailable, 0),
  );
  const addNotBookedTotal = roundMoney(
    notBookedInAljeel.reduce((sum, row) => sum + (row.supplierAmount ?? 0), 0),
  );
  const deductNotInSupplierTotal = roundMoney(
    notInSupplierBooks.reduce((sum, row) => sum + (row.unpaidAmount ?? 0), 0),
  );
  const adjustedBalance = roundMoney(
    booksBalance + addNotBookedTotal - deductNotInSupplierTotal,
  );

  const supplierName =
    aljeelLines.find((line) => line.supplierName)?.supplierName ?? null;

  return {
    supplierName,
    currency: options?.currency ?? 'SAR',
    asOfDate: options?.asOfDate ?? new Date().toISOString().slice(0, 10),
    booksBalance,
    supplierBalance,
    prepaymentAvailable,
    prepaymentBlocked: prepaymentAvailable > 0.005,
    matches,
    paymentRequest,
    notBookedInAljeel,
    notInSupplierBooks,
    amountMismatches,
    addNotBookedTotal,
    deductNotInSupplierTotal,
    adjustedBalance,
    beginningDifference: roundMoney(supplierBalance - adjustedBalance),
  };
}

export function paymentDetailsFileName(booksBalance: number): string {
  const tag = Math.round(booksBalance).toLocaleString('en-US');
  return `${tag} Payment details.xlsx`;
}
