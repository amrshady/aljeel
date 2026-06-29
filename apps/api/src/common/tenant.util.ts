import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { getSupplierScope } from '../auth/guards/tenant.guard';

export function requireSupplierId(user: AuthUser): string {
  const supplierId = getSupplierScope(user) ?? user.supplierId;
  if (!supplierId) {
    throw new ForbiddenException({ code: 'NO_TENANT', message: 'Supplier scope required.' });
  }
  return supplierId;
}

export function invoiceNotFound(): NotFoundException {
  return new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice not found.' });
}

export function supplierNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SUPPLIER_NOT_FOUND', message: 'Supplier not found.' });
}
