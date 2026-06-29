import { describe, expect, it, vi } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { ApService } from './ap.service';

describe('ApService', () => {
  const audit = { record: vi.fn(), listForEntity: vi.fn().mockResolvedValue([]) };

  it('rejects approve when invoice is not under review', async () => {
    const prisma = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({ id: 'inv1', status: 'DRAFT' }),
      },
      approvalStep: { count: vi.fn() },
      $transaction: vi.fn(),
    };
    const service = new ApService(prisma as never, audit as never);

    await expect(
      service.approve(
        {
          sub: 'clerk',
          email: 'clerk@aljeel.test',
          role: 'AP_CLERK',
          supplierId: null,
          mfaVerified: true,
        },
        'inv1',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('approves an invoice under review and records approval step', async () => {
    const prisma = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({ id: 'inv1', status: 'UNDER_REVIEW' }),
        update: vi.fn(),
      },
      approvalStep: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (fn) => fn(prisma)),
    };
    const service = new ApService(prisma as never, audit as never);

    const result = await service.approve(
      {
        sub: 'clerk',
        email: 'clerk@aljeel.test',
        role: 'AP_CLERK',
        supplierId: null,
        mfaVerified: true,
      },
      'inv1',
    );

    expect(result).toEqual({ id: 'inv1', status: 'APPROVED' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPROVED', entityId: 'inv1' }),
    );
  });
});
