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

  await prisma.supplier.upsert({
    where: { id: 'supplier_asateel' },
    create: {
      id: 'supplier_asateel',
      legalName: 'Asateel Integrated Supplier LLC',
      crNumber: 'CR-ASATEEL-001',
      vatNumber: 'VAT-ASATEEL-001',
      status: 'ACTIVE',
      paymentTerms: 'Net 30',
      defaultCurrency: 'SAR',
      erpVendorId: 'ASATEEL-001',
      erpIntegration: 'ASATEEL',
    },
    update: {
      erpVendorId: 'ASATEEL-001',
      erpIntegration: 'ASATEEL',
    },
  });

  await prisma.supplierUser.upsert({
    where: { id: 'user_supplier_admin' },
    create: {
      id: 'user_supplier_admin',
      supplierId: 'supplier_a',
      email: 'admin@supplier-a.com',
      fullName: 'Supplier A Admin',
      role: 'SUPPLIER_ADMIN',
      mfaEnabled: true,
      isActive: true,
    },
    update: {
      supplierId: 'supplier_a',
      email: 'admin@supplier-a.com',
      fullName: 'Supplier A Admin',
      role: 'SUPPLIER_ADMIN',
      mfaEnabled: true,
      isActive: true,
    },
  });

  await prisma.supplierUser.upsert({
    where: { id: 'user_supplier_b' },
    create: {
      id: 'user_supplier_b',
      supplierId: 'supplier_b',
      email: 'admin@supplier-b.com',
      fullName: 'Supplier B Admin',
      role: 'SUPPLIER_ADMIN',
      mfaEnabled: true,
      isActive: true,
    },
    update: {
      supplierId: 'supplier_b',
      email: 'admin@supplier-b.com',
      fullName: 'Supplier B Admin',
      role: 'SUPPLIER_ADMIN',
      mfaEnabled: true,
      isActive: true,
    },
  });

  await prisma.supplierUser.upsert({
    where: { id: 'user_supplier_asateel' },
    create: {
      id: 'user_supplier_asateel',
      supplierId: 'supplier_asateel',
      email: 'amr+asateel@accordpartners.ai',
      fullName: 'Asateel Admin',
      role: 'SUPPLIER_ADMIN',
      mfaEnabled: true,
      isActive: true,
    },
    update: {
      supplierId: 'supplier_asateel',
      email: 'amr+asateel@accordpartners.ai',
      fullName: 'Asateel Admin',
      role: 'SUPPLIER_ADMIN',
      mfaEnabled: true,
      isActive: true,
    },
  });

  await prisma.appUser.upsert({
    where: { id: 'user_ap_clerk' },
    create: {
      id: 'user_ap_clerk',
      email: 'amr+apadmin@accordpartners.ai',
      fullName: 'Aljeel AP Admin',
      role: 'AP_CLERK',
      isActive: true,
    },
    update: {
      email: 'amr+apadmin@accordpartners.ai',
      fullName: 'Aljeel AP Admin',
      role: 'AP_CLERK',
      isActive: true,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
