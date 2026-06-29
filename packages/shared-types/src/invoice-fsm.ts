import type { InvoiceStatus } from './index';

const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'ON_HOLD'],
  ON_HOLD: ['UNDER_REVIEW'],
  REJECTED: ['DRAFT'],
  APPROVED: ['SCHEDULED'],
  SCHEDULED: ['PAID'],
  PAID: [],
};

export class InvalidInvoiceTransitionError extends Error {
  constructor(
    public readonly from: InvoiceStatus,
    public readonly to: InvoiceStatus,
  ) {
    super(`Cannot transition invoice from ${from} to ${to}`);
    this.name = 'InvalidInvoiceTransitionError';
  }
}

export function assertInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  const allowed = TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new InvalidInvoiceTransitionError(from, to);
  }
}

export function getAllowedTransitions(from: InvoiceStatus): InvoiceStatus[] {
  return [...TRANSITIONS[from]];
}
