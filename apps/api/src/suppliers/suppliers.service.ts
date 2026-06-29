import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  InviteSupplierUserSchema,
  UpdateSupplierProfileSchema,
  type InviteSupplierUser,
  type UpdateSupplierProfile,
} from '@aljeel/shared-types';
import { PrismaService } from '../prisma/prisma.module';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { requireSupplierId, supplierNotFound } from '../common/tenant.util';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMySupplier(user: AuthUser) {
    const supplierId = requireSupplierId(user);
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId } });
    if (!supplier) {
      throw supplierNotFound();
    }
    return supplier;
  }

  async updateMySupplier(user: AuthUser, body: unknown) {
    if (user.role !== 'SUPPLIER_ADMIN') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supplier admins can update the company profile.',
      });
    }

    const dto: UpdateSupplierProfile = UpdateSupplierProfileSchema.parse(body);
    const supplierId = requireSupplierId(user);
    const before = await this.prisma.supplier.findFirst({ where: { id: supplierId } });
    if (!before) {
      throw supplierNotFound();
    }

    const updated = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: dto,
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'Supplier',
      entityId: supplierId,
      action: 'UPDATE',
      before: before as object,
      after: updated as object,
    });

    return updated;
  }

  async listUsers(user: AuthUser) {
    const supplierId = requireSupplierId(user);
    return this.prisma.supplierUser.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async inviteUser(user: AuthUser, body: unknown) {
    if (user.role !== 'SUPPLIER_ADMIN') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only supplier admins can invite users.',
      });
    }

    const dto: InviteSupplierUser = InviteSupplierUserSchema.parse(body);
    const supplierId = requireSupplierId(user);

    const existing = await this.prisma.supplierUser.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException({
        code: 'USER_EXISTS',
        message: 'A user with this email already exists.',
        details: { email: dto.email },
      });
    }

    const created = await this.prisma.supplierUser.create({
      data: {
        supplierId,
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
      },
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'SupplierUser',
      entityId: created.id,
      action: 'CREATE',
      after: created as object,
    });

    return created;
  }
}
