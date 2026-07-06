import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();

const supplierId = 'supplier_jawal';
const storageRoot = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? './storage');

const invoices = [
  {
    invoiceNumber: 'J26-788',
    invoiceDate: new Date('2026-05-07T00:00:00.000Z'),
    currency: 'SAR',
    subtotal: '141163.03',
    vat: '11709.46',
    total: '152872.49',
    status: 'UNDER_REVIEW' as const,
    source: 'UPLOAD' as const,
    document: {
      type: 'INVOICE' as const,
      sourcePath:
        '/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-788/INV-01-07 MAY 26 AL JEEL.pdf',
      mimeType: 'application/pdf',
    },
  },
  {
    invoiceNumber: '26-172',
    invoiceDate: new Date('2026-05-07T00:00:00.000Z'),
    currency: 'SAR',
    subtotal: '12543.50',
    vat: '0',
    total: '12543.50',
    status: 'UNDER_REVIEW' as const,
    source: 'UPLOAD' as const,
    document: {
      type: 'OTHER' as const,
      sourcePath: '/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-788/MAY -AL JEEL.pdf',
      mimeType: 'application/pdf',
    },
  },
];

function sanitizeFileName(filePath: string): string {
  return path.basename(filePath).replace(/[^\w.\-]+/g, '_').slice(0, 200);
}

function pathFromStorageKey(storageKey: string): string {
  if (!storageKey.startsWith('local:')) {
    throw new Error(`Unexpected non-local storageKey: ${storageKey}`);
  }

  return path.join(storageRoot, storageKey.slice('local:'.length));
}

async function removeExistingDocuments(invoiceId: string) {
  const documents = await prisma.document.findMany({
    where: { invoiceId },
    select: { storageKey: true },
  });

  for (const document of documents) {
    if (document.storageKey.startsWith('local:')) {
      await rm(pathFromStorageKey(document.storageKey), { force: true });
    }
  }

  await prisma.document.deleteMany({ where: { invoiceId } });
}

async function main() {
  await prisma.supplier.upsert({
    where: { id: supplierId },
    create: {
      id: supplierId,
      legalName: 'Jawwal Travel & Tourism',
      crNumber: 'CR-1010122966',
      vatNumber: '310073322610003',
      status: 'ACTIVE',
      paymentTerms: 'Net 30',
      defaultCurrency: 'SAR',
      erpVendorId: 'VEND-JAWAL',
      erpIntegration: 'JAWAL',
    },
    update: {
      legalName: 'Jawwal Travel & Tourism',
      crNumber: 'CR-1010122966',
      vatNumber: '310073322610003',
      status: 'ACTIVE',
      paymentTerms: 'Net 30',
      defaultCurrency: 'SAR',
      erpVendorId: 'VEND-JAWAL',
      erpIntegration: 'JAWAL',
    },
  });

  await prisma.supplierUser.upsert({
    where: { id: 'user_supplier_jawal' },
    create: {
      id: 'user_supplier_jawal',
      supplierId,
      email: 'admin@jawal.com',
      fullName: 'Jawal Admin',
      role: 'SUPPLIER_ADMIN',
      mfaEnabled: true,
      isActive: true,
    },
    update: {
      supplierId,
      email: 'admin@jawal.com',
      fullName: 'Jawal Admin',
      role: 'SUPPLIER_ADMIN',
      mfaEnabled: true,
      isActive: true,
    },
  });

  for (const seedInvoice of invoices) {
    const invoice = await prisma.invoice.upsert({
      where: {
        supplierId_invoiceNumber: {
          supplierId,
          invoiceNumber: seedInvoice.invoiceNumber,
        },
      },
      create: {
        supplierId,
        invoiceNumber: seedInvoice.invoiceNumber,
        invoiceDate: seedInvoice.invoiceDate,
        currency: seedInvoice.currency,
        subtotal: seedInvoice.subtotal,
        vat: seedInvoice.vat,
        total: seedInvoice.total,
        status: seedInvoice.status,
        source: seedInvoice.source,
      },
      update: {
        invoiceDate: seedInvoice.invoiceDate,
        currency: seedInvoice.currency,
        subtotal: seedInvoice.subtotal,
        vat: seedInvoice.vat,
        total: seedInvoice.total,
        status: seedInvoice.status,
        source: seedInvoice.source,
      },
    });

    await removeExistingDocuments(invoice.id);

    const fileName = sanitizeFileName(seedInvoice.document.sourcePath);
    const storageFileName = `${randomUUID()}-${fileName}`;
    const storageKey = `local:${supplierId}/${invoice.id}/${storageFileName}`;
    const targetPath = pathFromStorageKey(storageKey);
    const sourceStats = await stat(seedInvoice.document.sourcePath);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(seedInvoice.document.sourcePath, targetPath);

    await prisma.document.create({
      data: {
        invoiceId: invoice.id,
        type: seedInvoice.document.type,
        fileName,
        storageKey,
        mimeType: seedInvoice.document.mimeType,
        sizeBytes: sourceStats.size,
        virusScanStatus: 'CLEAN',
      },
    });
  }

  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { id: supplierId },
    select: {
      id: true,
      legalName: true,
      crNumber: true,
      vatNumber: true,
      status: true,
      paymentTerms: true,
      defaultCurrency: true,
      erpVendorId: true,
    },
  });

  const seededInvoices = await prisma.invoice.findMany({
    where: { supplierId },
    orderBy: { invoiceNumber: 'asc' },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      status: true,
      currency: true,
      subtotal: true,
      vat: true,
      total: true,
      documents: {
        orderBy: { fileName: 'asc' },
        select: {
          type: true,
          fileName: true,
          storageKey: true,
          mimeType: true,
          sizeBytes: true,
          virusScanStatus: true,
        },
      },
    },
  });

  const verification = await Promise.all(
    seededInvoices.map(async (invoice) => ({
      ...invoice,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      subtotal: invoice.subtotal.toString(),
      vat: invoice.vat.toString(),
      total: invoice.total.toString(),
      documentCount: invoice.documents.length,
      documents: await Promise.all(
        invoice.documents.map(async (document) => ({
          ...document,
          existsOnDisk: await stat(pathFromStorageKey(document.storageKey))
            .then((fileStats) => fileStats.isFile())
            .catch(() => false),
        })),
      ),
    })),
  );

  console.log(
    JSON.stringify(
      {
        supplier,
        invoices: verification,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
