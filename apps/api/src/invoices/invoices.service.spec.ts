import { describe, expect, it, vi } from 'vitest';
import { InvoicesService } from './invoices.service';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('InvoicesService tenant isolation', () => {
  it('denies access when invoice belongs to another supplier', async () => {
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const audit = { record: vi.fn() };
    const asateelManifest = { validateUploadedFolder: vi.fn() };
    const jawalEvidence = { validateUploadedFolder: vi.fn() };
    const invoiceSubmitNotification = { notifyInvoiceSubmitted: vi.fn() };
    const service = new InvoicesService(
      prisma as never,
      audit as never,
      asateelManifest as never,
      jawalEvidence as never,
      invoiceSubmitNotification as never,
    );

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
    const asateelManifest = { validateUploadedFolder: vi.fn() };
    const jawalEvidence = { validateUploadedFolder: vi.fn() };
    const invoiceSubmitNotification = { notifyInvoiceSubmitted: vi.fn() };
    const service = new InvoicesService(
      prisma as never,
      audit as never,
      asateelManifest as never,
      jawalEvidence as never,
      invoiceSubmitNotification as never,
    );

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

describe('InvoicesService submit duplicate file guard', () => {
  const user = {
    sub: 'u1',
    id: 'u1',
    email: 'supplier@test.com',
    fullName: 'Supplier User',
    role: 'SUPPLIER_ADMIN' as const,
    supplierId: 'supplier_a',
  };
  const currentInvoice = {
    id: 'inv_current',
    supplierId: 'supplier_a',
    invoiceNumber: 'INV-CURRENT',
    status: 'DRAFT',
    asateelRegion: null,
    lines: [],
  };
  const currentDocuments = [
    {
      id: 'doc_pdf',
      fileName: 'invoice.pdf',
      storageKey: 'invoices/inv_current/invoice.pdf',
      sizeBytes: 100,
      checksumSha256: 'hash-current',
      virusScanStatus: 'CLEAN',
    },
    {
      id: 'doc_xlsx',
      fileName: 'invoice.xlsx',
      storageKey: 'invoices/inv_current/invoice.xlsx',
      sizeBytes: 200,
      checksumSha256: 'hash-xlsx',
      virusScanStatus: 'CLEAN',
    },
    {
      id: 'doc_xlsx_2',
      fileName: 'invoice-lines.xlsx',
      storageKey: 'invoices/inv_current/invoice-lines.xlsx',
      sizeBytes: 300,
      checksumSha256: 'hash-xlsx-lines',
      virusScanStatus: 'CLEAN',
    },
  ];

  function createService(priorDocument?: {
    checksumSha256: string;
    supplierId: string;
    status: string;
    invoiceId?: string;
  }) {
    const priorCreatedAt = new Date('2026-07-01T12:00:00.000Z');
    const documentFindFirst = vi.fn().mockImplementation(({ where }) => {
      if (
        priorDocument &&
        where.checksumSha256.in.includes(priorDocument.checksumSha256) &&
        priorDocument.invoiceId !== 'inv_current' &&
        priorDocument.supplierId === where.invoice.supplierId &&
        !where.invoice.status.notIn.includes(priorDocument.status)
      ) {
        return {
          fileName: 'previous-invoice.pdf',
          invoice: {
            id: priorDocument.invoiceId ?? 'inv_prior',
            invoiceNumber: 'INV-PRIOR',
            createdAt: priorCreatedAt,
          },
        };
      }
      return null;
    });
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValueOnce(currentInvoice).mockResolvedValueOnce(null),
        update: vi
          .fn()
          .mockResolvedValueOnce({ ...currentInvoice, status: 'SUBMITTED' })
          .mockResolvedValueOnce({
            ...currentInvoice,
            status: 'UNDER_REVIEW',
          }),
      },
      document: {
        findMany: vi.fn().mockResolvedValue(currentDocuments),
        findFirst: documentFindFirst,
      },
      supplier: {
        findUnique: vi.fn().mockResolvedValue({
          erpIntegration: null,
          legalName: 'Supplier A',
        }),
      },
    };
    const audit = { record: vi.fn() };
    const service = new InvoicesService(
      prisma as never,
      audit as never,
      { validateUploadedFolder: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { notifyInvoiceSubmitted: vi.fn().mockResolvedValue(undefined) } as never,
    );
    return { service, documentFindFirst };
  }

  it('blocks a matching live document on another invoice for the same supplier', async () => {
    const { service } = createService({
      checksumSha256: 'hash-current',
      supplierId: 'supplier_a',
      status: 'SUBMITTED',
    });

    try {
      await service.submit(user, 'inv_current');
      throw new Error('Expected submission to be blocked.');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'DUPLICATE_FILE_SUBMISSION',
        details: {
          fileName: 'previous-invoice.pdf',
          priorInvoiceNumber: 'INV-PRIOR',
          priorInvoiceId: 'inv_prior',
          priorSubmittedAt: '2026-07-01T12:00:00.000Z',
        },
      });
    }
  });

  it.each(['DRAFT', 'REJECTED'])('does not block a match on a %s invoice', async (status) => {
    const { service } = createService({
      checksumSha256: 'hash-current',
      supplierId: 'supplier_a',
      status,
    });

    await expect(service.submit(user, 'inv_current')).resolves.toMatchObject({
      status: 'UNDER_REVIEW',
    });
  });

  it('does not block a matching document owned by a different supplier', async () => {
    const { service } = createService({
      checksumSha256: 'hash-current',
      supplierId: 'supplier_b',
      status: 'SUBMITTED',
    });

    await expect(service.submit(user, 'inv_current')).resolves.toMatchObject({
      status: 'UNDER_REVIEW',
    });
  });

  it('does not block when document hashes differ', async () => {
    const { service, documentFindFirst } = createService({
      checksumSha256: 'different-hash',
      supplierId: 'supplier_a',
      status: 'SUBMITTED',
    });

    await expect(service.submit(user, 'inv_current')).resolves.toMatchObject({
      status: 'UNDER_REVIEW',
    });
    expect(documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoice: {
            supplierId: 'supplier_a',
            status: { notIn: ['DRAFT', 'REJECTED'] },
          },
        }),
      }),
    );
  });
});
