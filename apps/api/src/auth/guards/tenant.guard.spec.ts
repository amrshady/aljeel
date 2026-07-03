import { describe, expect, it } from 'vitest';
import { TenantGuard, getSupplierScope } from './tenant.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { SUPPLIER_SCOPED_KEY } from './tenant.guard';

describe('TenantGuard', () => {
  const reflector = new Reflector();
  const guard = new TenantGuard(reflector);

  it('denies cross-tenant supplierId in params', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(SUPPLIER_SCOPED_KEY, true, handler);

    const context = {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            sub: 'user_a',
            id: 'user_a',
            email: 'a@test.com',
            fullName: 'Supplier User',
            role: 'SUPPLIER_ADMIN',
            supplierId: 'supplier_a',
          },
          params: { supplierId: 'supplier_b' },
          query: {},
        }),
      }),
    };

    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });

  it('allows access to own supplier scope', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(SUPPLIER_SCOPED_KEY, true, handler);

    const context = {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            sub: 'user_a',
            id: 'user_a',
            email: 'a@test.com',
            fullName: 'Supplier User',
            role: 'SUPPLIER_ADMIN',
            supplierId: 'supplier_a',
          },
          params: {},
          query: {},
        }),
      }),
    };

    expect(guard.canActivate(context as never)).toBe(true);
  });
});

describe('getSupplierScope', () => {
  it('returns supplierId for supplier users', () => {
    expect(
      getSupplierScope({
        sub: 'u1',
        id: 'u1',
        email: 'a@test.com',
        fullName: 'Supplier User',
        role: 'SUPPLIER_USER',
        supplierId: 'supplier_a',
      }),
    ).toBe('supplier_a');
  });

  it('returns null for internal users', () => {
    expect(
      getSupplierScope({
        sub: 'u2',
        id: 'u2',
        email: 'clerk@aljeel.com',
        fullName: 'AP Clerk',
        role: 'AP_CLERK',
        supplierId: null,
      }),
    ).toBeNull();
  });
});
