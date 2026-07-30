import { describe, expect, it, vi } from 'vitest';
import { InvoicesService } from './invoices.service';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

const supplierUser = {
  sub: 'u1',
  id: 'u1',
  email: 'supplier@test.com',
  fullName: 'Supplier User',
  role: 'SUPPLIER_ADMIN' as const,
  supplierId: 'supplier_a',
};

function draftInvoice(invoiceNumber: string) {
  const timestamp = new Date('2026-07-01T12:00:00.000Z');
  return {
    id: 'inv_current',
    supplierId: 'supplier_a',
    invoiceNumber,
    invoiceDate: timestamp,
    poId: null,
    currency: 'SAR',
    subtotal: 0,
    vat: 0,
    total: 0,
    status: 'DRAFT',
    source: 'UPLOAD',
    rejectionReason: null,
    archivedAt: null,
    asateelRegion: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lines: [],
  };
}

describe('InvoicesService Jawal batch ID validation', () => {
  function createDraftService(erpIntegration: 'JAWAL' | 'ASATEEL', invoiceNumber: string) {
    const invoice = draftInvoice(invoiceNumber);
    const prisma = {
      supplier: {
        findUnique: vi.fn().mockResolvedValue({ erpIntegration }),
      },
      invoice: {
        findFirst: vi.fn().mockResolvedValue(invoice),
      },
    };
    return new InvoicesService(
      prisma as never,
      { record: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { notifyInvoiceSubmitted: vi.fn() } as never,
    );
  }

  it('rejects a bad Jawal batch ID at draft creation with a clean 400', async () => {
    const service = createDraftService('JAWAL', '01-07jul');

    try {
      await service.createDraft(supplierUser, { invoiceNumber: '01-07jul' });
      throw new Error('Expected draft creation to be blocked.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'JAWAL_INVALID_BATCH_ID',
        details: { invoiceNumber: '01-07jul' },
      });
    }
  });

  it('accepts a valid Jawal batch ID at draft creation', async () => {
    const service = createDraftService('JAWAL', 'J26-1080');

    await expect(
      service.createDraft(supplierUser, { invoiceNumber: 'J26-1080' }),
    ).resolves.toMatchObject({ invoiceNumber: 'J26-1080' });
  });

  it('leaves non-Jawal invoice numbers unaffected', async () => {
    const service = createDraftService('ASATEEL', '01-07jul');

    await expect(
      service.createDraft(supplierUser, { invoiceNumber: '01-07jul' }),
    ).resolves.toMatchObject({ invoiceNumber: '01-07jul' });
  });

  it('keeps rejecting a malformed Jawal batch ID at submission', async () => {
    const invoice = draftInvoice('01-07jul');
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(invoice),
      },
      document: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      supplier: {
        findUnique: vi.fn().mockResolvedValue({
          erpIntegration: 'JAWAL',
          legalName: 'Jawal',
        }),
      },
    };
    const service = new InvoicesService(
      prisma as never,
      { record: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { notifyInvoiceSubmitted: vi.fn() } as never,
    );

    await expect(service.submit(supplierUser, invoice.id)).rejects.toMatchObject({
      response: {
        code: 'JAWAL_INVALID_BATCH_ID',
        details: { invoiceNumber: '01-07jul' },
      },
    });
  });

  it('exempts server-generated DRAFT placeholders when submitting Jawal invoices', async () => {
    const invoice = draftInvoice('DRAFT-ab12cd34');
    const reviewed = { ...invoice, status: 'UNDER_REVIEW' };
    const prisma = {
      invoice: {
        findFirst: vi.fn().mockResolvedValue(invoice),
        update: vi
          .fn()
          .mockResolvedValueOnce({ ...invoice, status: 'SUBMITTED' })
          .mockResolvedValueOnce(reviewed),
      },
      document: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'doc_pdf',
            fileName: 'invoice.pdf',
            storageKey: 'invoices/inv_current/invoice.pdf',
            sizeBytes: 100,
            checksumSha256: null,
            virusScanStatus: 'CLEAN',
          },
        ]),
      },
      supplier: {
        findUnique: vi.fn().mockResolvedValue({
          erpIntegration: 'JAWAL',
          legalName: 'Jawal',
        }),
      },
    };
    const service = new InvoicesService(
      prisma as never,
      { record: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      {
        validateUploadedFolder: vi
          .fn()
          .mockResolvedValue({ error: null, warning: null }),
      } as never,
      {
        notifyInvoiceSubmitted: vi.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(service.submit(supplierUser, invoice.id)).resolves.toMatchObject({
      status: 'UNDER_REVIEW',
    });
  });
});

describe('InvoicesService invoice number reuse', () => {
  function createService(prisma: object) {
    return new InvoicesService(
      prisma as never,
      { record: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { notifyInvoiceSubmitted: vi.fn() } as never,
    );
  }

  it('creates a new Jawal draft when the matching invoice is archived', async () => {
    const created = draftInvoice('J26-1080');
    const prisma = {
      supplier: {
        findUnique: vi.fn().mockResolvedValue({ erpIntegration: 'JAWAL' }),
      },
      invoice: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const service = createService(prisma);

    await expect(
      service.createDraft(supplierUser, { invoiceNumber: 'J26-1080' }),
    ).resolves.toMatchObject({
      id: created.id,
      invoiceNumber: 'J26-1080',
      archivedAt: null,
    });

    expect(prisma.invoice.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          supplierId: 'supplier_a',
          invoiceNumber: 'J26-1080',
          archivedAt: null,
        }),
      }),
    );
    expect(prisma.invoice.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          supplierId: 'supplier_a',
          invoiceNumber: 'J26-1080',
          archivedAt: null,
        }),
      }),
    );
    expect(prisma.invoice.create).toHaveBeenCalledOnce();
  });

  it('maps an active submitted invoice collision to INVOICE_NUMBER_TAKEN', async () => {
    const prisma = {
      supplier: {
        findUnique: vi.fn().mockResolvedValue({ erpIntegration: 'JAWAL' }),
      },
      invoice: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'inv_active' }),
        create: vi.fn(),
      },
    };
    const service = createService(prisma);

    await expect(
      service.createDraft(supplierUser, { invoiceNumber: 'J26-1080' }),
    ).rejects.toMatchObject({
      response: {
        code: 'INVOICE_NUMBER_TAKEN',
        details: { invoiceNumber: 'J26-1080' },
      },
    });
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent active-create P2002 to INVOICE_NUMBER_TAKEN', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['supplierId', 'invoiceNumber'] },
      },
    );
    const prisma = {
      supplier: {
        findUnique: vi.fn().mockResolvedValue({ erpIntegration: 'JAWAL' }),
      },
      invoice: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(uniqueError),
      },
    };
    const service = createService(prisma);

    await expect(
      service.createDraft(supplierUser, { invoiceNumber: 'J26-1080' }),
    ).rejects.toMatchObject({
      response: {
        code: 'INVOICE_NUMBER_TAKEN',
        details: { invoiceNumber: 'J26-1080' },
      },
    });
  });
});

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
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERP_INTEGRATION_REQUIRED' }),
    });
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

  type PriorDocument = {
    checksumSha256: string;
    supplierId: string;
    status: string;
    invoiceId?: string;
    invoiceNumber?: string;
    archivedAt?: Date | null;
    invoiceCreatedAt?: Date;
    documentCreatedAt?: Date;
  };

  function createService(priorDocuments: PriorDocument[] = []) {
    const documentFindMany = vi.fn().mockImplementation(({ where }) => {
      if (where.invoiceId === 'inv_current') return currentDocuments;
      return priorDocuments
        .filter(
          (document) =>
            where.checksumSha256.in.includes(document.checksumSha256) &&
            document.invoiceId !== 'inv_current' &&
            document.supplierId === where.invoice.supplierId &&
            document.archivedAt == null &&
            !where.invoice.status.notIn.includes(document.status),
        )
        .sort(
          (left, right) =>
            (left.invoiceCreatedAt?.getTime() ?? 0) - (right.invoiceCreatedAt?.getTime() ?? 0) ||
            (left.documentCreatedAt?.getTime() ?? 0) - (right.documentCreatedAt?.getTime() ?? 0),
        )
        .map((document) => ({
          checksumSha256: document.checksumSha256,
          invoice: {
            id: document.invoiceId ?? 'inv_prior',
            invoiceNumber: document.invoiceNumber ?? 'INV-PRIOR',
            createdAt: document.invoiceCreatedAt ?? new Date('2026-07-01T12:00:00.000Z'),
          },
        }));
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
        findMany: documentFindMany,
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
    return { service, documentFindMany };
  }

  it('lists every matching current file and its earliest prior invoice', async () => {
    const { service } = createService([
      {
        checksumSha256: 'hash-current',
        supplierId: 'supplier_a',
        status: 'SUBMITTED',
        invoiceNumber: 'INV-LATER',
        invoiceCreatedAt: new Date('2026-07-02T12:00:00.000Z'),
      },
      {
        checksumSha256: 'hash-xlsx',
        supplierId: 'supplier_a',
        status: 'APPROVED',
        invoiceId: 'inv_prior_xlsx',
        invoiceNumber: 'INV-XLSX',
        invoiceCreatedAt: new Date('2026-06-30T12:00:00.000Z'),
      },
      {
        checksumSha256: 'hash-current',
        supplierId: 'supplier_a',
        status: 'SUBMITTED',
        invoiceId: 'inv_earliest',
        invoiceNumber: 'INV-EARLIEST',
        invoiceCreatedAt: new Date('2026-07-01T12:00:00.000Z'),
      },
    ]);

    try {
      await service.submit(user, 'inv_current');
      throw new Error('Expected submission to be blocked.');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'DUPLICATE_FILE_SUBMISSION',
        details: {
          duplicateCount: 2,
          duplicates: [
            {
              fileName: 'invoice.xlsx',
              priorInvoiceNumber: 'INV-XLSX',
              priorSubmittedAt: '2026-06-30T12:00:00.000Z',
            },
            {
              fileName: 'invoice.pdf',
              priorInvoiceNumber: 'INV-EARLIEST',
              priorSubmittedAt: '2026-07-01T12:00:00.000Z',
            },
          ],
          fileName: 'invoice.xlsx',
          priorInvoiceNumber: 'INV-XLSX',
          priorInvoiceId: 'inv_prior_xlsx',
          priorSubmittedAt: '2026-06-30T12:00:00.000Z',
        },
      });
    }
  });

  it.each(['DRAFT', 'REJECTED'])('does not block a match on a %s invoice', async (status) => {
    const { service } = createService([
      {
        checksumSha256: 'hash-current',
        supplierId: 'supplier_a',
        status,
      },
    ]);

    await expect(service.submit(user, 'inv_current')).resolves.toMatchObject({
      status: 'UNDER_REVIEW',
    });
  });

  it('does not block a matching document owned by a different supplier', async () => {
    const { service } = createService([
      {
        checksumSha256: 'hash-current',
        supplierId: 'supplier_b',
        status: 'SUBMITTED',
      },
    ]);

    await expect(service.submit(user, 'inv_current')).resolves.toMatchObject({
      status: 'UNDER_REVIEW',
    });
  });

  it('does not block when the only matching prior invoice is archived', async () => {
    const { service, documentFindMany } = createService([
      {
        checksumSha256: 'hash-current',
        supplierId: 'supplier_a',
        status: 'SUBMITTED',
        archivedAt: new Date('2026-07-15T12:00:00.000Z'),
      },
    ]);

    await expect(service.submit(user, 'inv_current')).resolves.toMatchObject({
      status: 'UNDER_REVIEW',
    });
    expect(documentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoice: {
            supplierId: 'supplier_a',
            archivedAt: null,
            status: { notIn: ['DRAFT', 'REJECTED'] },
          },
        }),
      }),
    );
  });

  it('does not block when document hashes differ', async () => {
    const { service, documentFindMany } = createService([
      {
        checksumSha256: 'different-hash',
        supplierId: 'supplier_a',
        status: 'SUBMITTED',
      },
    ]);

    await expect(service.submit(user, 'inv_current')).resolves.toMatchObject({
      status: 'UNDER_REVIEW',
    });
    expect(documentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoice: {
            supplierId: 'supplier_a',
            archivedAt: null,
            status: { notIn: ['DRAFT', 'REJECTED'] },
          },
        }),
      }),
    );
  });
});

describe('InvoicesService AP clerk intake', () => {
  const apClerk = {
    sub: 'clerk',
    id: 'clerk',
    email: 'clerk@aljeel.com',
    fullName: 'AP Clerk',
    role: 'AP_CLERK' as const,
    supplierId: null,
  };

  it('creates a draft for the configured Jawal supplier when integration is selected', async () => {
    const invoice = draftInvoice('J26-1080');
    const prisma = {
      supplier: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'supplier_jawal',
          erpIntegration: 'JAWAL',
        }),
        findUnique: vi.fn().mockResolvedValue({ erpIntegration: 'JAWAL' }),
      },
      invoice: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ ...invoice, supplierId: 'supplier_jawal' }),
      },
    };
    const service = new InvoicesService(
      prisma as never,
      { record: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { notifyInvoiceSubmitted: vi.fn() } as never,
    );

    const result = await service.createDraft(apClerk, {
      invoiceNumber: 'J26-1080',
      erpIntegration: 'JAWAL',
    });

    expect(prisma.supplier.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { erpIntegration: 'JAWAL', status: 'ACTIVE' },
      }),
    );
    expect(prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ supplierId: 'supplier_jawal' }),
      }),
    );
    expect(result).toMatchObject({ invoiceNumber: 'J26-1080' });
  });

  it('requires an integration when an AP clerk creates a draft', async () => {
    const service = new InvoicesService(
      { supplier: { findFirst: vi.fn() }, invoice: { create: vi.fn() } } as never,
      { record: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { validateUploadedFolder: vi.fn() } as never,
      { notifyInvoiceSubmitted: vi.fn() } as never,
    );

    await expect(service.createDraft(apClerk, {})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERP_INTEGRATION_REQUIRED' }),
    });
  });
});
