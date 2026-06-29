import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../auth.types';

export const SUPPLIER_SCOPED_KEY = 'supplierScoped';
export const SupplierScoped = () => SetMetadata(SUPPLIER_SCOPED_KEY, true);

const INTERNAL_ROLES = new Set([
  'AP_CLERK',
  'AP_APPROVER',
  'PROCUREMENT',
  'TREASURY',
  'VENDOR_MASTER',
  'SYSTEM_ADMIN',
  'AUDITOR',
]);

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const supplierScoped = this.reflector.getAllAndOverride<boolean>(SUPPLIER_SCOPED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!supplierScoped) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params: Record<string, string>;
      query: Record<string, string>;
    }>();

    const user = request.user;
    if (!user) {
      return false;
    }

    if (INTERNAL_ROLES.has(user.role)) {
      return true;
    }

    if (!user.supplierId) {
      throw new ForbiddenException({ code: 'NO_TENANT', message: 'Supplier scope required.' });
    }

  const requestedSupplierId =
      request.params.supplierId ?? request.query.supplierId;
    if (requestedSupplierId && requestedSupplierId !== user.supplierId) {
      throw new ForbiddenException({ code: 'TENANT_MISMATCH', message: 'Cross-tenant access denied.' });
    }

    return true;
  }
}

export function getSupplierScope(user: AuthUser): string | null {
  if (INTERNAL_ROLES.has(user.role)) {
    return null;
  }
  return user.supplierId;
}
