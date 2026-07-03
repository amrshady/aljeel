import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const storageRoot = '/home/clawdbot/pglocal/storage';
const targetSupplierIds = ['supplier_a', 'supplier_b'];

async function removeStoredFiles(storageKeys: string[]) {
  const invoiceDirs = new Set<string>();
  const root = path.resolve(storageRoot);

  for (const storageKey of storageKeys) {
    if (!storageKey.startsWith('local:')) {
      continue;
    }

    const relativeKey = storageKey.slice('local:'.length);
    const filePath = path.resolve(root, relativeKey);

    if (!filePath.startsWith(root + path.sep)) {
      throw new Error(`Refusing to delete file outside storage root: ${storageKey}`);
    }

    invoiceDirs.add(path.dirname(filePath));

    try {
      await fs.unlink(filePath);
      console.log(`Deleted file: ${filePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  for (const invoiceDir of invoiceDirs) {
    try {
      await fs.rmdir(invoiceDir);
      console.log(`Deleted empty invoice dir: ${invoiceDir}`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTEMPTY') {
        throw error;
      }
    }
  }
}

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: { supplierId: { in: targetSupplierIds } },
    include: {
      documents: { select: { storageKey: true } },
      supplier: { select: { legalName: true } },
    },
    orderBy: [{ supplierId: 'asc' }, { invoiceNumber: 'asc' }],
  });

  const invoiceIds = invoices.map((invoice) => invoice.id);
  const storageKeys = invoices.flatMap((invoice) => invoice.documents.map((document) => document.storageKey));

  if (invoiceIds.length === 0) {
    console.log('No supplier_a or supplier_b invoices found.');
  } else {
    console.log('Deleting invoices:');
    for (const invoice of invoices) {
      console.log(`- ${invoice.invoiceNumber} (${invoice.supplier.legalName}, ${invoice.id})`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.paymentAllocation.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.document.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.approvalStep.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.message.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    });

    await removeStoredFiles(storageKeys);
  }

  const queueInvoices = await prisma.invoice.findMany({
    where: { status: { in: ['UNDER_REVIEW', 'ON_HOLD'] } },
    include: { supplier: { select: { legalName: true } } },
    orderBy: [{ supplier: { legalName: 'asc' } }, { invoiceNumber: 'asc' }],
  });

  console.log('UNDER_REVIEW/ON_HOLD invoices:');
  for (const invoice of queueInvoices) {
    console.log(`${invoice.invoiceNumber} | ${invoice.supplier.legalName}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
