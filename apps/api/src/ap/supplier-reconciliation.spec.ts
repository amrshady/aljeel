import { describe, expect, it } from 'vitest';
import {
  amountsEqual,
  extractInvoiceNumber,
  paymentDetailsFileName,
  reconcileSupplierStatement,
} from './supplier-reconciliation';

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

  it('treats near-equal amounts as a match', () => {
    expect(amountsEqual(2472.5, 2472.5000001)).toBe(true);
    expect(amountsEqual(2472.5, 2472.51)).toBe(false);
  });

  it('names the download after the Aljeel books balance', () => {
    expect(paymentDetailsFileName(36380.25)).toBe('36,380 Payment details.xlsx');
  });
});
