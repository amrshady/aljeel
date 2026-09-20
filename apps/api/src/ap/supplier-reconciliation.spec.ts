import { describe, expect, it } from 'vitest';
import {
  amountsEqual,
  extractInvoiceNumber,
  isAljeelPaid,
  paymentDetailsFileName,
  reconcileSupplierStatement,
  type AljeelInvoiceLine,
  type SupplierStatementLine,
} from './supplier-reconciliation';

function aljeelLine(
  invoiceNumber: string,
  unpaidAmount: number,
  extras: Partial<AljeelInvoiceLine> = {},
): AljeelInvoiceLine {
  return {
    invoiceNumber,
    date: extras.date ?? '2026-01-01',
    supplierName: extras.supplierName ?? 'Acme',
    unpaidAmount,
    invoiceAmount: extras.invoiceAmount ?? unpaidAmount,
    prepaymentAvailable: extras.prepaymentAvailable ?? 0,
  };
}

function supplierLine(
  invoiceNumber: string,
  amount: number,
  extras: Partial<SupplierStatementLine> = {},
): SupplierStatementLine {
  return {
    invoiceNumber,
    date: extras.date ?? '2026-01-01',
    amount,
    description: extras.description ?? null,
    notes: extras.notes ?? null,
  };
}

describe('extractInvoiceNumber', () => {
  it('pulls SL invoice numbers out of Arabic sales-voucher text', () => {
    expect(extractInvoiceNumber('SL/1/202604/000045 : قسيمة مبيعات رقم')).toBe(
      'SL/1/202604/000045',
    );
  });

  it('normalizes spaces inside SL invoice numbers', () => {
    expect(extractInvoiceNumber('SL / 1 / 202606 / 000240')).toBe('SL/1/202606/000240');
  });

  it('ignores totals', () => {
    expect(extractInvoiceNumber('الإجمالي')).toBeNull();
    expect(extractInvoiceNumber('Total')).toBeNull();
  });
});

describe('reconcileSupplierStatement', () => {
  it('matches Labadi buckets: pay what is booked, add supplier-only invoices', () => {
    const result = reconcileSupplierStatement(
      [
        {
          invoiceNumber: 'SL/1/202604/000120',
          date: '2026-04-26',
          supplierName: 'شركة دروب النهر الازرق',
          unpaidAmount: 2472.5,
          invoiceAmount: 2472.5,
          prepaymentAvailable: 0,
        },
        {
          invoiceNumber: 'SL/1/202606/000231',
          date: '2026-06-15',
          supplierName: 'شركة دروب النهر الازرق',
          unpaidAmount: 805,
          invoiceAmount: 805,
          prepaymentAvailable: 0,
        },
      ],
      [
        {
          invoiceNumber: 'SL/1/202604/000120',
          date: '2026-04-26',
          amount: 2472.5,
          description: 'قسيمة مبيعات',
          notes: null,
        },
        {
          invoiceNumber: 'SL/1/202606/000231',
          date: '2026-06-15',
          amount: 805,
          description: 'قسيمة مبيعات',
          notes: null,
        },
        {
          invoiceNumber: 'SL/1/202604/000045',
          date: '2026-04-08',
          amount: 575,
          description: 'قسيمة مبيعات',
          notes: null,
        },
      ],
      { asOfDate: '2026-09-08' },
    );

    expect(result.booksBalance).toBe(3277.5);
    expect(result.supplierBalance).toBe(3852.5);
    expect(result.paymentRequest.map((row) => row.invoiceNumber)).toEqual([
      'SL/1/202604/000120',
      'SL/1/202606/000231',
    ]);
    expect(result.notBookedInAljeel.map((row) => row.invoiceNumber)).toEqual([
      'SL/1/202604/000045',
    ]);
    expect(result.addNotBookedTotal).toBe(575);
    expect(result.adjustedBalance).toBe(3852.5);
    expect(result.beginningDifference).toBe(0);
    expect(result.prepaymentBlocked).toBe(false);
  });

  it('highlights amount mismatches and deducts Aljeel-only invoices', () => {
    const result = reconcileSupplierStatement(
      [
        {
          invoiceNumber: 'INV-A',
          date: '2026-01-01',
          supplierName: 'Acme',
          unpaidAmount: 100,
          invoiceAmount: 100,
          prepaymentAvailable: 10,
        },
        {
          invoiceNumber: 'INV-B',
          date: '2026-01-02',
          supplierName: 'Acme',
          unpaidAmount: 50,
          invoiceAmount: 50,
          prepaymentAvailable: 0,
        },
        {
          invoiceNumber: 'INV-C',
          date: '2026-01-03',
          supplierName: 'Acme',
          unpaidAmount: 25,
          invoiceAmount: 25,
          prepaymentAvailable: 0,
        },
      ],
      [
        { invoiceNumber: 'INV-A', date: '2026-01-01', amount: 100, description: null, notes: null },
        { invoiceNumber: 'INV-B', date: '2026-01-02', amount: 60, description: null, notes: null },
        { invoiceNumber: 'INV-D', date: '2026-01-04', amount: 80, description: null, notes: null },
      ],
    );

    expect(result.paymentRequest.map((row) => row.invoiceNumber)).toEqual(['INV-A']);
    expect(result.amountMismatches.map((row) => row.invoiceNumber)).toEqual(['INV-B']);
    expect(result.notInSupplierBooks.map((row) => row.invoiceNumber)).toEqual(['INV-C']);
    expect(result.notBookedInAljeel.map((row) => row.invoiceNumber)).toEqual(['INV-D']);
    expect(result.prepaymentBlocked).toBe(true);
    expect(result.prepaymentAvailable).toBe(10);
    expect(result.deductNotInSupplierTotal).toBe(25);
    expect(result.addNotBookedTotal).toBe(80);
    expect(result.adjustedBalance).toBe(230);
    expect(result.beginningDifference).toBe(10);
  });

  it('aggregates duplicate invoice numbers on both ledgers before matching', () => {
    const result = reconcileSupplierStatement(
      [
        {
          invoiceNumber: ' inv-duplicate ',
          date: '2026-01-01',
          supplierName: 'Acme',
          unpaidAmount: 40,
          invoiceAmount: 40,
          prepaymentAvailable: 2,
        },
        {
          invoiceNumber: 'INV-DUPLICATE',
          date: '2026-01-02',
          supplierName: 'Different name',
          unpaidAmount: 60,
          invoiceAmount: 60,
          prepaymentAvailable: 3,
        },
      ],
      [
        {
          invoiceNumber: 'INV-DUPLICATE',
          date: '2026-01-03',
          amount: 25,
          description: 'First description',
          notes: 'First note',
        },
        {
          invoiceNumber: 'inv-duplicate',
          date: '2026-01-04',
          amount: 75,
          description: 'Second description',
          notes: 'Second note',
        },
      ],
    );

    expect(result.booksBalance).toBe(100);
    expect(result.supplierBalance).toBe(100);
    expect(result.prepaymentAvailable).toBe(5);
    expect(result.matches).toEqual([
      expect.objectContaining({
        invoiceNumber: 'INV-DUPLICATE',
        date: '2026-01-03',
        supplierAmount: 100,
        aljeelAmount: 100,
        unpaidAmount: 100,
        status: 'FOUND',
        notes: 'First note',
      }),
    ]);
  });

  it('treats near-equal amounts as a match', () => {
    expect(amountsEqual(2472.5, 2472.5000001)).toBe(true);
    expect(amountsEqual(2472.5, 2472.51)).toBe(false);
  });

  it('names the download after the Aljeel books balance', () => {
    expect(paymentDetailsFileName(36380.25)).toBe('36,380 Payment details.xlsx');
  });

  it('treats unpaid of zero as already paid', () => {
    expect(isAljeelPaid(0)).toBe(true);
    expect(isAljeelPaid(0.004)).toBe(true);
    expect(isAljeelPaid(0.01)).toBe(false);
  });

  it('drops Aljeel-paid invoices from remaining balance and payment request', () => {
    const result = reconcileSupplierStatement(
      [
        aljeelLine('OPEN-1', 90, { invoiceAmount: 90, date: '2026-06-01' }),
        aljeelLine('OPEN-2', 110, { invoiceAmount: 110, date: '2026-06-02' }),
        aljeelLine('PAID-1', 0, { invoiceAmount: 80, date: '2026-01-01' }),
        aljeelLine('PAID-2', 0, { invoiceAmount: 120, date: '2026-01-02' }),
      ],
      [
        supplierLine('OPEN-1', 90, { date: '2026-06-01' }),
        supplierLine('OPEN-2', 110, { date: '2026-06-02' }),
        supplierLine('PAID-1', 80, { date: '2026-01-01' }),
        supplierLine('PAID-2', 120, { date: '2026-01-02' }),
      ],
    );

    expect(result.booksBalance).toBe(200);
    expect(result.supplierBalance).toBe(400);
    expect(result.paymentRequest.map((row) => row.invoiceNumber)).toEqual(['OPEN-1', 'OPEN-2']);
    expect(result.alreadyPaid.map((row) => row.invoiceNumber)).toEqual(['PAID-1', 'PAID-2']);
    expect(result.alreadyPaidTotal).toBe(200);
    expect(result.notBookedInAljeel).toEqual([]);
    expect(result.adjustedBalance).toBe(200);
    expect(result.beginningDifference).toBe(0);
  });

  it('matches open invoices by number, not a subset that also sums to the remaining total', () => {
    const result = reconcileSupplierStatement(
      [
        aljeelLine('NEW-1', 100, { invoiceAmount: 100 }),
        aljeelLine('NEW-2', 100, { invoiceAmount: 100 }),
        aljeelLine('OLD-1', 0, { invoiceAmount: 100 }),
        aljeelLine('OLD-2', 0, { invoiceAmount: 100 }),
      ],
      [
        supplierLine('NEW-1', 100),
        supplierLine('NEW-2', 100),
        supplierLine('OLD-1', 100),
        supplierLine('OLD-2', 100),
      ],
    );

    expect(result.paymentRequest.map((row) => row.invoiceNumber)).toEqual(['NEW-1', 'NEW-2']);
    expect(result.alreadyPaid.map((row) => row.invoiceNumber)).toEqual(['OLD-1', 'OLD-2']);
    expect(result.matches.filter((row) => row.status === 'FOUND').map((row) => row.invoiceNumber)).toEqual([
      'NEW-1',
      'NEW-2',
    ]);
    expect(result.beginningDifference).toBe(0);
  });

  it('keeps unpaid supplier-only invoices as not booked, not as already paid', () => {
    const result = reconcileSupplierStatement(
      [aljeelLine('OPEN-1', 50, { invoiceAmount: 50 })],
      [supplierLine('OPEN-1', 50), supplierLine('MISSING-1', 75)],
    );

    expect(result.notBookedInAljeel.map((row) => row.invoiceNumber)).toEqual(['MISSING-1']);
    expect(result.alreadyPaid).toEqual([]);
    expect(result.addNotBookedTotal).toBe(75);
    expect(result.adjustedBalance).toBe(125);
    expect(result.beginningDifference).toBe(0);
  });

  it('omits paid Aljeel invoices that the supplier no longer lists from remaining buckets', () => {
    const result = reconcileSupplierStatement(
      [
        aljeelLine('OPEN-1', 40, { invoiceAmount: 40 }),
        aljeelLine('PAID-GONE', 0, { invoiceAmount: 200 }),
      ],
      [supplierLine('OPEN-1', 40)],
    );

    expect(result.matches.find((row) => row.invoiceNumber === 'PAID-GONE')?.status).toBe('ALREADY_PAID');
    expect(result.alreadyPaid).toEqual([]);
    expect(result.notInSupplierBooks.map((row) => row.invoiceNumber)).toEqual([]);
    expect(result.paymentRequest.map((row) => row.invoiceNumber)).toEqual(['OPEN-1']);
    expect(result.booksBalance).toBe(40);
    expect(result.beginningDifference).toBe(0);
  });
});
