import { describe, expect, it } from 'vitest';
import { assertInvoiceTransition, InvalidInvoiceTransitionError } from './invoice-fsm';
import { computeInvoiceTotals, validateInvoiceMath } from './invoice-math';

describe('invoice FSM', () => {
  it('allows draft to submitted', () => {
    expect(() => assertInvoiceTransition('DRAFT', 'SUBMITTED')).not.toThrow();
  });

  it('blocks paid to draft', () => {
    expect(() => assertInvoiceTransition('PAID', 'DRAFT')).toThrow(InvalidInvoiceTransitionError);
  });
});

describe('invoice math', () => {
  it('computes totals with VAT', () => {
    const result = computeInvoiceTotals([
      { description: 'Item', qty: '2', unitPrice: '100', vatRate: '15' },
    ]);
    expect(result.subtotal).toBe('200.0000');
    expect(result.vat).toBe('30.0000');
    expect(result.total).toBe('230.0000');
  });

  it('flags invalid quantity', () => {
    const issues = validateInvoiceMath([
      { description: 'Item', qty: '0', unitPrice: '10', vatRate: '15' },
    ]);
    expect(issues[0]?.code).toBe('INVALID_QTY');
  });
});
