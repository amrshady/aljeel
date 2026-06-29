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
    return supplier;
  }
}
