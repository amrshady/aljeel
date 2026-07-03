import { describe, expect, it, vi } from 'vitest';
import { InvoicesService } from './invoices.service';
import { ForbiddenException } from '@nestjs/common';

describe('InvoicesService tenant isolation', () => {
  it('denies access when invoice belongs to another supplier', async () => {
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const audit = { record: vi.fn() };
    const service = new InvoicesService(prisma as never, audit as never);

    await expect(
      service.getById(
        {
          sub: 'u1',
          id: 'u1',
          email: 'a@test.com',
          fullName: 'Supplier User',
          role: 'SUPPLIER_ADMIN',
          supplierId: 'supplier_a',
        },
        'inv_other',
      ),
    ).rejects.toThrow();
  });
});

describe('InvoicesService supplier scope', () => {
  it('requires supplier id for internal users without scope', async () => {
    const prisma = { invoice: { count: vi.fn(), findMany: vi.fn() } };
    const audit = { record: vi.fn() };
    const service = new InvoicesService(prisma as never, audit as never);

    await expect(
      service.list(
        {
          sub: 'clerk',
          id: 'clerk',
          email: 'clerk@aljeel.com',
          fullName: 'AP Clerk',
          role: 'AP_CLERK',
          supplierId: null,
        },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
