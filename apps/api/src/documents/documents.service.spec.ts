import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.service';

const supplierUser = {
  sub: 'u1',
  id: 'u1',
  email: 'supplier@test.com',
  fullName: 'Supplier User',
  role: 'SUPPLIER_USER' as const,
  supplierId: 'supplier_a',
};

function streamFromBuffer(buffer: Buffer): Readable {
  return Readable.from([buffer]);
}

function documentRow(storageKey: string) {
  return {
    id: 'doc-1',
    invoiceId: 'inv-1',
    type: 'OTHER',
    fileName: 'ousama_fehri/invoice.xlsx',
    mimeType: 'application/octet-stream',
    sizeBytes: 12,
    storageKey,
    invoice: { supplierId: 'supplier_a' },
  };
}

describe('DocumentsService.getForDownload', () => {
  it('streams KB objects instead of redirecting to a signed URL', async () => {
    const body = streamFromBuffer(Buffer.from('xlsx-bytes'));
    const kb = {
      createReadStream: vi.fn().mockResolvedValue(body),
      createDownloadUrl: vi.fn(),
    };
    const storage = { createReadStream: vi.fn() };
    const prisma = {
      document: {
        findUnique: vi.fn().mockResolvedValue(documentRow('invoices/inv-1/invoice.xlsx')),
      },
      invoice: {
        findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', supplierId: 'supplier_a' }),
      },
    };
    const service = new DocumentsService(
      prisma as never,
      { record: vi.fn() } as never,
      storage as never,
      kb as never,
      {} as never,
    );

    const result = await service.getForDownload(supplierUser, 'doc-1');

    expect(result.stream).toBe(body);
    expect(kb.createReadStream).toHaveBeenCalledWith('invoices/inv-1/invoice.xlsx');
    expect(kb.createDownloadUrl).not.toHaveBeenCalled();
    expect(storage.createReadStream).not.toHaveBeenCalled();
  });

  it('streams local disk objects for local: storage keys', async () => {
    const body = streamFromBuffer(Buffer.from('local-xlsx'));
    const kb = {
      createReadStream: vi.fn(),
      createDownloadUrl: vi.fn(),
    };
    const storage = { createReadStream: vi.fn().mockReturnValue(body) };
    const prisma = {
      document: {
        findUnique: vi.fn().mockResolvedValue(documentRow('local:invoice.xlsx')),
      },
      invoice: {
        findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', supplierId: 'supplier_a' }),
      },
    };
    const service = new DocumentsService(
      prisma as never,
      { record: vi.fn() } as never,
      storage as never,
      kb as never,
      {} as never,
    );

    const result = await service.getForDownload(supplierUser, 'doc-1');

    expect(result.stream).toBe(body);
    expect(storage.createReadStream).toHaveBeenCalledWith('invoice.xlsx');
    expect(kb.createReadStream).not.toHaveBeenCalled();
  });
});

describe('DocumentsService signer access', () => {
  const signer = {
    sub: 'app_w',
    id: 'app_w',
    email: 'wkobessy@aljeel.com',
    fullName: 'Waleed Kobessy',
    role: 'ASATEEL_SIGNER' as const,
    supplierId: null,
  };

  it('lists documents when the signer has a step on the invoice', async () => {
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue({ id: 'inv-1' }) },
      document: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new DocumentsService(
      prisma as never,
      { record: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.list(signer, 'inv-1')).resolves.toEqual([]);
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: 'inv-1', approvals: { some: { approverId: 'app_w' } } },
    });
  });
});
