import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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

  const lookupPath = resolve(
    process.cwd(),
    '../../../aljeel/pipelines/lookups/asateel_projects_labadi_v1.json',
  );
  const lookup = JSON.parse(await readFile(lookupPath, 'utf8')) as {
    agency_rules: Array<{
      agency_code: string;
      agency_name: string;
      employee_strategy: 'agency_manager' | 'bmx_junior_to_head';
      manager?: { employee_name: string; employee_no: string };
      heads?: Array<{
        employee_name: string;
        employee_no: string;
        juniors: Array<{ employee_name: string; employee_no: string }>;
      }>;
    }>;
  };
  for (const rule of lookup.agency_rules) {
    const agency = await prisma.ptAgencyMapping.upsert({
      where: { agencyCode: rule.agency_code },
      create: {
        agencyName: rule.agency_name,
        agencyCode: rule.agency_code,
        managerName: rule.manager?.employee_name,
        managerEmpNo: rule.manager?.employee_no,
        resolutionMode: rule.employee_strategy === 'agency_manager' ? 'AGENCY' : 'SALESMAN',
        createdBy: 'seed',
        updatedBy: 'seed',
      },
      update: {
        agencyName: rule.agency_name,
        managerName: rule.manager?.employee_name ?? null,
        managerEmpNo: rule.manager?.employee_no ?? null,
        resolutionMode: rule.employee_strategy === 'agency_manager' ? 'AGENCY' : 'SALESMAN',
        updatedBy: 'seed',
      },
    });
    for (const head of rule.heads ?? []) {
      for (const junior of head.juniors) {
        await prisma.ptSalesmanMapping.upsert({
          where: { salesmanEmpNo: junior.employee_no },
          create: {
            agencyMappingId: agency.id,
            lineHeadName: head.employee_name,
            lineHeadEmpNo: head.employee_no,
            salesmanName: junior.employee_name,
            salesmanEmpNo: junior.employee_no,
            createdBy: 'seed',
            updatedBy: 'seed',
          },
          update: {
            agencyMappingId: agency.id,
            lineHeadName: head.employee_name,
            lineHeadEmpNo: head.employee_no,
            salesmanName: junior.employee_name,
            updatedBy: 'seed',
          },
        });
      }
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
