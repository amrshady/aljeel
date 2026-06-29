import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.supplier.upsert({
    where: { id: 'supplier_a' },
    create: {
      id: 'supplier_a',
      legalName: 'Supplier A LLC',
      crNumber: 'CR-100001',
      vatNumber: 'VAT-300001',
      status: 'ACTIVE',
      paymentTerms: 'Net 30',
      defaultCurrency: 'SAR',
      erpVendorId: 'VEND-100001',
    },
    update: { erpVendorId: 'VEND-100001' },
  });

  await prisma.supplier.upsert({
    where: { id: 'supplier_b' },
    create: {
      id: 'supplier_b',
      legalName: 'Supplier B LLC',
      crNumber: 'CR-100002',
      vatNumber: 'VAT-300002',
      status: 'ACTIVE',
      paymentTerms: 'Net 45',
      defaultCurrency: 'SAR',
      erpVendorId: 'VEND-100002',
    },
    update: { erpVendorId: 'VEND-100002' },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
