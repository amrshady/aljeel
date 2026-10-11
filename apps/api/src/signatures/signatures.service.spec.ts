import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SignaturesService } from './signatures.service';

const signer = {
  sub: 'app_w',
  id: 'app_w',
  email: 'wkobessy@aljeel.com',
  fullName: 'Waleed Kobessy',
  role: 'ASATEEL_SIGNER' as const,
  supplierId: null,
};

function batch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv1',
    invoiceNumber: '10',
    asateelRegion: 'EASTERN_OUTBOUND',
    status: 'AWAITING_SIGNATURE',
    updatedAt: new Date('2026-10-11T00:00:00.000Z'),
    supplier: { legalName: 'Asateel' },
    approvals: [
      { id: 'step1', sequence: 1, action: 'PENDING', approverId: 'app_w' },
      { id: 'step2', sequence: 2, action: 'PENDING', approverId: 'app_a' },
    ],
    asateelSignatures: [
      { id: 'row1', invoiceNo: '03041', signedAt: null, approvalStepId: 'step1' },
      { id: 'row2', invoiceNo: '03042', signedAt: null, approvalStepId: 'step1' },
    ],
    documents: [
      { id: 'doc1', fileName: '03041_pod.pdf', mimeType: 'application/pdf' },
      { id: 'doc2', fileName: '03042_pod.pdf', mimeType: 'application/pdf' },
    ],
    ...overrides,
  };
}

describe('SignaturesService', () => {
  it('lists only the batch whose current step belongs to the caller', async () => {
    const waiting = batch();
    const later = batch({
      id: 'inv2',
      approvals: [
        { id: 'done', sequence: 1, action: 'APPROVED', approverId: 'app_w' },
        { id: 'step2', sequence: 2, action: 'PENDING', approverId: 'app_a' },
      ],
    });
    const prisma = {
      invoice: { findMany: vi.fn().mockResolvedValue([waiting, later]) },
    };
    const service = new SignaturesService(prisma as never, { record: vi.fn() } as never);

    const list = await service.list(signer);

    expect(list.map((item) => item.id)).toEqual(['inv1']);
    expect(list[0]).toMatchObject({ stage: 1, invoiceCount: 2, signedCount: 0 });
  });

  it('approves one row and keeps the batch with the first signer', async () => {
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(batch()) },
      asateelInvoiceSignature: {
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(1),
      },
      approvalStep: { update: vi.fn() },
    };
    const audit = { record: vi.fn() };
    const service = new SignaturesService(prisma as never, audit as never);

    await expect(service.approveLine(signer, 'inv1', '03041')).resolves.toMatchObject({
      invoiceNo: '03041',
      stage1Complete: false,
    });
    expect(prisma.approvalStep.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ASATEEL_LINE_SIGNED' }),
    );
  });

  it('keeps the batch with the first signer after the last row is marked approved', async () => {
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(
          batch({
            asateelSignatures: [
              {
                id: 'row1',
                invoiceNo: '03041',
                signedAt: new Date('2026-10-11T01:00:00.000Z'),
                approvalStepId: 'step1',
              },
              { id: 'row2', invoiceNo: '03042', signedAt: null, approvalStepId: 'step1' },
            ],
          }),
        ),
      },
      asateelInvoiceSignature: {
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn(),
      },
      approvalStep: { update: vi.fn() },
    };
    const audit = { record: vi.fn() };
    const service = new SignaturesService(prisma as never, audit as never);

    await expect(service.approveLine(signer, 'inv1', '03042')).resolves.toMatchObject({
      stage1Complete: false,
    });
    expect(prisma.approvalStep.update).not.toHaveBeenCalled();
  });

  it('clears a row approval while the first signer still has the batch', async () => {
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(
          batch({
            asateelSignatures: [
              {
                id: 'row1',
                invoiceNo: '03041',
                signedAt: new Date('2026-10-11T01:00:00.000Z'),
                approvalStepId: 'step1',
              },
            ],
          }),
        ),
      },
      asateelInvoiceSignature: { update: vi.fn().mockResolvedValue({}) },
    };
    const audit = { record: vi.fn() };
    const service = new SignaturesService(prisma as never, audit as never);

    await expect(service.unapproveLine(signer, 'inv1', '03041')).resolves.toMatchObject({
      signedAt: null,
    });
    expect(prisma.asateelInvoiceSignature.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'row1' },
        data: { signedById: null, signedAt: null },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ASATEEL_LINE_UNSIGNED' }),
    );
  });

  it('sends the batch to the next signer only after every row is approved', async () => {
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(batch()) },
      asateelInvoiceSignature: { count: vi.fn().mockResolvedValue(1) },
      approvalStep: { update: vi.fn() },
    };
    const service = new SignaturesService(prisma as never, { record: vi.fn() } as never);

    await expect(service.complete(signer, 'inv1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(prisma.approvalStep.update).not.toHaveBeenCalled();
  });

  it('marks stage 1 approved when done is called with every row signed', async () => {
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(batch()) },
      asateelInvoiceSignature: { count: vi.fn().mockResolvedValue(0) },
      approvalStep: { update: vi.fn().mockResolvedValue({}) },
    };
    const audit = { record: vi.fn() };
    const service = new SignaturesService(prisma as never, audit as never);

    await expect(service.complete(signer, 'inv1')).resolves.toEqual({
      invoiceId: 'inv1',
      stage1Complete: true,
    });
    expect(prisma.approvalStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step1', action: 'PENDING' },
        data: expect.objectContaining({ action: 'APPROVED' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ASATEEL_STAGE1_COMPLETE' }),
    );
  });

  it('acts once when a signer clicks twice', async () => {
    const alreadyActed = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    const notifyAwaitingSigner = vi.fn();
    const audit = { record: vi.fn() };
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(batch()),
        update: vi.fn().mockRejectedValue(alreadyActed),
      },
      asateelInvoiceSignature: { count: vi.fn().mockResolvedValue(0) },
      approvalStep: { update: vi.fn().mockRejectedValue(alreadyActed) },
      appUser: { findUnique: vi.fn() },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new SignaturesService(
      prisma as never,
      audit as never,
      { notifyAwaitingSigner } as never,
    );

    await expect(service.complete(signer, 'inv1')).resolves.toEqual({
      invoiceId: 'inv1',
      stage1Complete: true,
    });
    await expect(service.rejectBatch(signer, 'inv1', { reason: 'Late' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(notifyAwaitingSigner).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a signer whose step is not current', async () => {
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(
          batch({
            approvals: [
              { id: 'step1', sequence: 1, action: 'PENDING', approverId: 'someone-else' },
            ],
          }),
        ),
      },
    };
    const service = new SignaturesService(prisma as never, { record: vi.fn() } as never);

    await expect(service.approveLine(signer, 'inv1', '03041')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects line approval once the batch has moved to stage 2', async () => {
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(
          batch({
            approvals: [
              { id: 'step1', sequence: 1, action: 'APPROVED', approverId: 'app_w' },
              { id: 'step2', sequence: 2, action: 'PENDING', approverId: 'app_a' },
            ],
          }),
        ),
      },
    };
    const second = { ...signer, sub: 'app_a', id: 'app_a', email: 'agahmed@aljeel.com' };
    const service = new SignaturesService(prisma as never, { record: vi.fn() } as never);

    await expect(service.approveLine(second, 'inv1', '03041')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('refuses a batch approval before stage 1 is approved', async () => {
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(
          batch({
            approvals: [
              { id: 'step1', sequence: 1, action: 'REJECTED', approverId: 'app_w' },
              { id: 'step2', sequence: 2, action: 'PENDING', approverId: 'app_a' },
            ],
          }),
        ),
      },
    };
    const second = { ...signer, sub: 'app_a', id: 'app_a', email: 'agahmed@aljeel.com' };
    const service = new SignaturesService(prisma as never, { record: vi.fn() } as never);

    await expect(service.approveBatch(second, 'inv1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('does not rename the batch or its files', async () => {
    const invoiceUpdate = vi.fn().mockResolvedValue({});
    const documentUpdate = vi.fn();
    const prismaFor = (invoice: ReturnType<typeof batch>) => ({
      invoice: {
        findFirst: vi.fn().mockResolvedValue(invoice),
        update: invoiceUpdate,
      },
      asateelInvoiceSignature: {
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      approvalStep: { update: vi.fn().mockResolvedValue({}) },
      document: { update: documentUpdate, updateMany: documentUpdate },
      supplierUser: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    });
    const audit = { record: vi.fn() };
    const stage1 = new SignaturesService(prismaFor(batch()) as never, audit as never);
    await stage1.approveLine(signer, 'inv1', '03041');
    await stage1.complete(signer, 'inv1');
    await stage1.rejectBatch(signer, 'inv1', { reason: 'Wrong file' });

    const second = {
      ...signer,
      sub: 'app_a',
      id: 'app_a',
      email: 'agahmed@aljeel.com',
      fullName: 'Abdul Ghaffar',
    };
    const stage2 = new SignaturesService(
      prismaFor(
        batch({
          approvals: [
            { id: 'step1', sequence: 1, action: 'APPROVED', approverId: 'app_w' },
            { id: 'step2', sequence: 2, action: 'PENDING', approverId: 'app_a' },
          ],
        }),
      ) as never,
      audit as never,
    );
    await stage2.approveBatch(second, 'inv1');

    for (const [update] of invoiceUpdate.mock.calls) {
      expect(update.data).not.toHaveProperty('invoiceNumber');
    }
    expect(documentUpdate).not.toHaveBeenCalled();
  });

  it('rejects a whole-batch approval from the first signer', async () => {
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(batch()) },
    };
    const service = new SignaturesService(prisma as never, { record: vi.fn() } as never);

    await expect(service.approveBatch(signer, 'inv1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('approves every invoice in one action and sends the batch to review', async () => {
    const approvalUpdate = vi.fn().mockResolvedValue({});
    const invoiceUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(
          batch({
            approvals: [
              { id: 'step1', sequence: 1, action: 'APPROVED', approverId: 'app_w' },
              { id: 'step2', sequence: 2, action: 'PENDING', approverId: 'app_a' },
            ],
          }),
        ),
        update: invoiceUpdate,
      },
      approvalStep: { update: approvalUpdate },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const audit = { record: vi.fn() };
    const second = { ...signer, sub: 'app_a', id: 'app_a', email: 'agahmed@aljeel.com' };
    const service = new SignaturesService(prisma as never, audit as never);

    await expect(service.approveBatch(second, 'inv1')).resolves.toEqual({
      invoiceId: 'inv1',
      status: 'UNDER_REVIEW',
    });
    expect(approvalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step2', action: 'PENDING' },
        data: expect.objectContaining({ action: 'APPROVED' }),
      }),
    );
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv1', status: 'AWAITING_SIGNATURE' },
        data: { status: 'UNDER_REVIEW' },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ASATEEL_BATCH_APPROVED' }),
    );
  });

  it('returns the batch to the supplier with the signer reason', async () => {
    const approvalUpdate = vi.fn().mockResolvedValue({});
    const invoiceUpdate = vi.fn().mockResolvedValue({});
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(batch()),
        update: invoiceUpdate,
      },
      approvalStep: { update: approvalUpdate },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const audit = { record: vi.fn() };
    const service = new SignaturesService(prisma as never, audit as never);

    await expect(
      service.rejectBatch(signer, 'inv1', { reason: '  Missing delivery note  ' }),
    ).resolves.toEqual({
      invoiceId: 'inv1',
      status: 'CHANGES_REQUESTED',
    });
    expect(approvalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'step1', action: 'PENDING' },
        data: expect.objectContaining({ action: 'REJECTED', comment: 'Missing delivery note' }),
      }),
    );
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv1', status: 'AWAITING_SIGNATURE' },
        data: expect.objectContaining({
          status: 'CHANGES_REQUESTED',
          rejectionReason: 'Missing delivery note',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ASATEEL_BATCH_REJECTED' }),
    );
  });

  it('lets the second signer reject the whole batch', async () => {
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(
          batch({
            approvals: [
              { id: 'step1', sequence: 1, action: 'APPROVED', approverId: 'app_w' },
              { id: 'step2', sequence: 2, action: 'PENDING', approverId: 'app_a' },
            ],
          }),
        ),
        update: vi.fn().mockResolvedValue({}),
      },
      approvalStep: { update: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const second = { ...signer, sub: 'app_a', id: 'app_a', email: 'agahmed@aljeel.com' };
    const service = new SignaturesService(prisma as never, { record: vi.fn() } as never);

    await expect(service.rejectBatch(second, 'inv1', { reason: 'Wrong area' })).resolves.toEqual({
      invoiceId: 'inv1',
      status: 'CHANGES_REQUESTED',
    });
    expect(prisma.approvalStep.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'step2', action: 'PENDING' } }),
    );
  });

  it('requires a reason and refuses a signer whose turn it is not', async () => {
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(batch()) },
    };
    const service = new SignaturesService(prisma as never, { record: vi.fn() } as never);
    const other = { ...signer, sub: 'someone-else' };

    await expect(service.rejectBatch(signer, 'inv1', { reason: '   ' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await expect(service.rejectBatch(other, 'inv1', { reason: 'Not mine' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('emails the next signer when stage 1 is finished', async () => {
    const notifyAwaitingSigner = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(batch()) },
      asateelInvoiceSignature: { count: vi.fn().mockResolvedValue(0) },
      approvalStep: { update: vi.fn().mockResolvedValue({}) },
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'app_a',
          email: 'agahmed@aljeel.com',
          fullName: 'Abdul Ghaffar',
        }),
      },
    };
    const service = new SignaturesService(
      prisma as never,
      { record: vi.fn() } as never,
      {
        notifyAwaitingSigner,
      } as never,
    );

    await service.complete(signer, 'inv1');

    expect(notifyAwaitingSigner).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 'inv1',
        signerEmail: 'agahmed@aljeel.com',
        signerName: 'Abdul Ghaffar',
      }),
    );
  });

  it('emails Labadi the review notice when the batch is approved', async () => {
    const notifyReadyForReview = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(
          batch({
            approvals: [
              { id: 'step1', sequence: 1, action: 'APPROVED', approverId: 'app_w' },
              { id: 'step2', sequence: 2, action: 'PENDING', approverId: 'app_a' },
            ],
          }),
        ),
        update: vi.fn().mockResolvedValue({}),
      },
      approvalStep: { update: vi.fn().mockResolvedValue({}) },
      auditEvent: {
        findFirst: vi.fn().mockResolvedValue({ actorId: 'user_supplier' }),
      },
      supplierUser: {
        findUnique: vi.fn().mockResolvedValue({
          email: 'amr+asateel@accordpartners.ai',
          fullName: 'Asateel Admin',
        }),
      },
      appUser: { findUnique: vi.fn() },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const second = { ...signer, sub: 'app_a', id: 'app_a', email: 'agahmed@aljeel.com' };
    const service = new SignaturesService(
      prisma as never,
      { record: vi.fn() } as never,
      {
        notifyReadyForReview,
      } as never,
    );

    await service.approveBatch(second, 'inv1');

    expect(notifyReadyForReview).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 'inv1',
        submittedByEmail: 'amr+asateel@accordpartners.ai',
        submittedByName: 'Asateel Admin',
      }),
    );
  });

  it('emails the supplier when the batch is rejected', async () => {
    const notifyRejected = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue({ ...batch(), supplierId: 'supplier_asateel' }),
        update: vi.fn().mockResolvedValue({}),
      },
      approvalStep: { update: vi.fn().mockResolvedValue({}) },
      supplierUser: {
        findMany: vi.fn().mockResolvedValue([{ email: 'amr+asateel@accordpartners.ai' }]),
      },
      $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new SignaturesService(
      prisma as never,
      { record: vi.fn() } as never,
      {
        notifyRejected,
      } as never,
    );

    await service.rejectBatch(signer, 'inv1', { reason: 'Missing stamp' });

    expect(notifyRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 'inv1',
        reason: 'Missing stamp',
        supplierEmails: ['amr+asateel@accordpartners.ai'],
      }),
    );
  });
});
