import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';

export interface AuditEventInput {
  actorId?: string;
  entity: string;
  entityId: string;
  action: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEventInput): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        actorId: event.actorId,
        entity: event.entity,
        entityId: event.entityId,
        action: event.action,
        before: event.before,
        after: event.after,
        ip: event.ip,
      },
    });
  }

  async listForEntity(entity: string, entityId: string) {
    return this.prisma.auditEvent.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
