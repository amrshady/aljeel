import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdentityService } from './identity.service';

const originalStaffDomain = process.env.AUTH_STAFF_DOMAIN;
const originalStaffDefaultRole = process.env.AUTH_STAFF_DEFAULT_ROLE;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalStaffDomain === undefined) delete process.env.AUTH_STAFF_DOMAIN;
  else process.env.AUTH_STAFF_DOMAIN = originalStaffDomain;
  if (originalStaffDefaultRole === undefined) delete process.env.AUTH_STAFF_DEFAULT_ROLE;
  else process.env.AUTH_STAFF_DEFAULT_ROLE = originalStaffDefaultRole;
});

describe('IdentityService AP_STAFF resolution', () => {
  it('resolves the configured staff-domain fallback as AP_STAFF', async () => {
    process.env.AUTH_STAFF_DOMAIN = 'aljeel.com';
    process.env.AUTH_STAFF_DEFAULT_ROLE = 'AP_STAFF';
    const prisma = {
      supplierUser: { findUnique: vi.fn().mockResolvedValue(null) },
      appUser: { findUnique: vi.fn().mockResolvedValue(null) },
    };

    const user = await new IdentityService(prisma as never).resolveByEmail('Staff@AlJeel.com');

    expect(user).toMatchObject({
      email: 'staff@aljeel.com',
      role: 'AP_STAFF',
      supplierId: null,
    });
  });

  it('accepts an explicit AP_STAFF AppUser before applying domain fallback', async () => {
    process.env.AUTH_STAFF_DOMAIN = 'aljeel.com';
    process.env.AUTH_STAFF_DEFAULT_ROLE = 'AP_STAFF';
    const prisma = {
      supplierUser: { findUnique: vi.fn().mockResolvedValue(null) },
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'app_staff',
          email: 'named@aljeel.com',
          fullName: 'Named Staff',
          role: 'AP_STAFF',
          isActive: true,
        }),
      },
    };

    const user = await new IdentityService(prisma as never).resolveByEmail('named@aljeel.com');

    expect(user).toMatchObject({ id: 'app_staff', fullName: 'Named Staff', role: 'AP_STAFF' });
  });

  it('preserves SupplierUser precedence over AppUser and domain fallback', async () => {
    process.env.AUTH_STAFF_DOMAIN = 'aljeel.com';
    process.env.AUTH_STAFF_DEFAULT_ROLE = 'AP_STAFF';
    const appUserLookup = vi.fn();
    const prisma = {
      supplierUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'supplier_user',
          email: 'dual@aljeel.com',
          fullName: 'Supplier User',
          role: 'SUPPLIER_USER',
          supplierId: 'supplier_1',
          isActive: true,
        }),
      },
      appUser: { findUnique: appUserLookup },
    };

    const user = await new IdentityService(prisma as never).resolveByEmail('dual@aljeel.com');

    expect(user).toMatchObject({ role: 'SUPPLIER_USER', supplierId: 'supplier_1' });
    expect(appUserLookup).not.toHaveBeenCalled();
  });
});
