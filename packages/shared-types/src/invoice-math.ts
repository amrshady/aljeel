import type { InvoiceLineInput } from './invoice';

export interface ComputedTotals {
  subtotal: string;
  vat: string;
  total: string;
  lines: Array<InvoiceLineInput & { amount: string; lineVat: string }>;
}

function round4(n: number): string {
  return n.toFixed(4);
}

export function computeInvoiceTotals(lines: InvoiceLineInput[]): ComputedTotals {
  let subtotal = 0;
  let vat = 0;
  const computedLines = lines.map((line) => {
    const qty = Number(line.qty);
    const unitPrice = Number(line.unitPrice);
    const vatRate = Number(line.vatRate);
    const amount = qty * unitPrice;
    const lineVat = amount * (vatRate / 100);
    subtotal += amount;
    vat += lineVat;
    return { ...line, amount: round4(amount), lineVat: round4(lineVat) };
  });

  return {
    subtotal: round4(subtotal),
    vat: round4(vat),
    total: round4(subtotal + vat),
    lines: computedLines,
  };
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export function validateInvoiceMath(lines: InvoiceLineInput[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  lines.forEach((line, index) => {
    const qty = Number(line.qty);
    const unitPrice = Number(line.unitPrice);
    const vatRate = Number(line.vatRate);
    if (qty <= 0) {
      issues.push({
        field: `lines[${index}].qty`,
        code: 'INVALID_QTY',
        message: 'Quantity must be greater than zero.',
      });
    }
    if (unitPrice < 0) {
      issues.push({
        field: `lines[${index}].unitPrice`,
        code: 'INVALID_PRICE',
        message: 'Unit price cannot be negative.',
      });
    }
    if (vatRate < 0 || vatRate > 100) {
      issues.push({
        field: `lines[${index}].vatRate`,
        code: 'INVALID_VAT_RATE',
        message: 'VAT rate must be between 0 and 100.',
      });
    }
  });
  return issues;
}
