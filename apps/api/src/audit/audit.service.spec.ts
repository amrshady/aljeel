import { describe, expect, it } from 'vitest';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('records an audit event', async () => {
    const created: unknown[] = [];
    const prisma = {
      auditEvent: {
        create: async ({ data }: { data: unknown }) => {
          created.push(data);
          return data;
        },
      },
    };

    const service = new AuditService(prisma as never);
    await service.record({
      entity: 'Invoice',
      entityId: 'inv_1',
      action: 'CREATE',
      after: { status: 'DRAFT' },
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      entity: 'Invoice',
      entityId: 'inv_1',
      action: 'CREATE',
    });
  });
});
