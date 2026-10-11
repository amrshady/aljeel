import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ApController } from './ap.controller';

describe('invoice folder rename', () => {
  it('stays a manual action for AP staff', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ApController.prototype.renameInvoiceFolder) as
      string[] | undefined;
    expect(roles).toEqual(['AP_CLERK', 'AP_APPROVER']);
  });
});
