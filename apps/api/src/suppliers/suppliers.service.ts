import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../auth/auth.types';
import { requireSupplierId, supplierNotFound } from '../common/tenant.util';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMySupplier(user: AuthUser) {
    const supplierId = requireSupplierId(user);
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId } });
    if (!supplier) {
      throw supplierNotFound();
    }
    return {
      id: supplier.id,
      legalName: supplier.legalName,
      crNumber: supplier.crNumber,
      vatNumber: supplier.vatNumber,
      status: supplier.status,
      paymentTerms: supplier.paymentTerms,
      defaultCurrency: supplier.defaultCurrency,
      erpVendorId: supplier.erpVendorId,
      erpIntegration: supplier.erpIntegration,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    };
  }
}
