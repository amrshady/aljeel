import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthMeResponse, UserRole } from '@aljeel/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth.types';

interface CachedIdentity {
  user: AuthUser;
  expiresAt: number;
}

const IDENTITY_CACHE_MS = 60 * 1000;
const AP_STAFF_ROLES = new Set<UserRole>([
  'AP_CLERK',
  'AP_APPROVER',
]);

@Injectable()
export class IdentityService {
  private readonly cache = new Map<string, CachedIdentity>();

  constructor(private readonly prisma: PrismaService) {}

  async resolveByEmail(email: string): Promise<AuthUser> {
    const normalizedEmail = email.toLowerCase();
    const cached = this.cache.get(normalizedEmail);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    const supplierUser = await this.prisma.supplierUser.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        supplierId: true,
        isActive: true,
      },
    });
    if (supplierUser) {
      if (!supplierUser.isActive) {
        throw new ForbiddenException({ code: 'USER_INACTIVE', message: 'User is inactive.' });
      }
      return this.remember(normalizedEmail, {
        sub: supplierUser.id,
        id: supplierUser.id,
        email: supplierUser.email,
        fullName: supplierUser.fullName,
        role: supplierUser.role,
        supplierId: supplierUser.supplierId,
      });
    }

    const appUser = await this.prisma.appUser.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });
    if (appUser) {
      if (!appUser.isActive) {
        throw new ForbiddenException({ code: 'USER_INACTIVE', message: 'User is inactive.' });
      }
      if (!AP_STAFF_ROLES.has(appUser.role)) {
        throw new ForbiddenException({ code: 'APP_USER_ROLE_INVALID', message: 'Staff user role is not allowed.' });
      }
      return this.remember(normalizedEmail, {
        sub: appUser.id,
        id: appUser.id,
        email: appUser.email,
        fullName: appUser.fullName,
        role: appUser.role,
        supplierId: null,
      });
    }

    const domainIdentity = this.resolveStaffDomainIdentity(normalizedEmail);
    if (domainIdentity) {
      return this.remember(normalizedEmail, domainIdentity);
    }

    throw new ForbiddenException({
      code: 'APP_IDENTITY_NOT_FOUND',
      message: 'Authenticated email is not authorized for this application.',
    });
  }

  toAuthMe(user: AuthUser): AuthMeResponse {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      supplierId: user.supplierId,
    };
  }

  private resolveStaffDomainIdentity(email: string): AuthUser | null {
    const staffDomain = process.env.AUTH_STAFF_DOMAIN?.toLowerCase();
    const defaultRole = process.env.AUTH_STAFF_DEFAULT_ROLE as UserRole | undefined;
    if (!staffDomain || !defaultRole || !AP_STAFF_ROLES.has(defaultRole)) {
      return null;
    }
    if (!email.endsWith(`@${staffDomain}`)) {
      return null;
    }

    return {
      sub: `staff-domain:${email}`,
      id: `staff-domain:${email}`,
      email,
      fullName: email.split('@')[0] ?? email,
      role: defaultRole,
      supplierId: null,
    };
  }

  private remember(email: string, user: AuthUser): AuthUser {
    this.cache.set(email, { user, expiresAt: Date.now() + IDENTITY_CACHE_MS });
    return user;
  }
}
