import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApHoldRequestSchema,
  ApRejectRequestSchema,
  InvoiceListQuerySchema,
  assertInvoiceTransition,
  InvalidInvoiceTransitionError,
  type InvoiceListQuery,
} from '@aljeel/shared-types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { invoiceNotFound } from '../common/tenant.util';
import { serializeInvoice, serializeTimelineEvent } from '../invoices/invoices.service';
import { AsateelIntegrationService } from './asateel-integration.service';

const EXCEPTION_STATUSES = ['UNDER_REVIEW', 'ON_HOLD'] as const;

@Injectable()
export class ApService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly asateel: AsateelIntegrationService,
  ) {}

  async listExceptions(query: Record<string, string | undefined>) {
    const params: InvoiceListQuery = InvoiceListQuerySchema.parse(query);

    const where: Prisma.InvoiceWhereInput = {
      status: { in: [...EXCEPTION_STATUSES] },
      ...(params.q
        ? {
            OR: [
              { invoiceNumber: { contains: params.q, mode: 'insensitive' } },
              { supplier: { legalName: { contains: params.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orderBy = { createdAt: 'desc' as const };

    const [total, rows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { lines: true, supplier: true },
      }),
    ]);

    const rowIds = rows.map((row) => row.id);
    const documentStats =
      rowIds.length === 0
        ? []
        : await this.prisma.document.groupBy({
            by: ['invoiceId'],
            where: { invoiceId: { in: rowIds } },
            _count: { id: true },
            _sum: { sizeBytes: true },
          });
    const statsByInvoiceId = new Map(
      documentStats.map((stat) => [
        stat.invoiceId,
        {
          documentCount: stat._count.id,
          totalSizeBytes: stat._sum.sizeBytes ?? 0,
        },
      ]),
    );

    return {
      data: rows.map((row) => {
        const { lines: _lines, ...item } = serializeInvoice(row);
        const stats = statsByInvoiceId.get(row.id) ?? {
          documentCount: 0,
          totalSizeBytes: 0,
        };
        return { ...item, ...stats, supplierName: row.supplier.legalName };
      }),
      page: params.page,
      pageSize: params.pageSize,
      total,
    };
  }

  async getInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { lines: true, supplier: true },
    });
    if (!invoice) {
      throw invoiceNotFound();
    }
    const events = await this.audit.listForEntity('Invoice', id);
    return {
      ...serializeInvoice(invoice),
      supplierName: invoice.supplier.legalName,
      reconciliation: await this.asateel.getStatus(id),
      timeline: events.map(serializeTimelineEvent),
    };
  }

  async approve(user: AuthUser, id: string) {
    return this.transition(user, id, 'APPROVED');
  }

  async reject(user: AuthUser, id: string, body: unknown) {
    const { reason } = ApRejectRequestSchema.parse(body);
    return this.transition(user, id, 'REJECTED', { rejectionReason: reason, comment: reason });
  }

  async hold(user: AuthUser, id: string, body: unknown) {
    const { comment } = ApHoldRequestSchema.parse(body);
    return this.transition(user, id, 'ON_HOLD', { comment });
  }

  async resume(user: AuthUser, id: string) {
    return this.transition(user, id, 'UNDER_REVIEW');
  }

  getReconciliationStatus(id: string) {
    return this.asateel.getStatus(id);
  }

  rerunReconciliation(user: AuthUser, id: string) {
    return this.asateel.rerun(id, user.sub);
  }

  private async transition(
    user: AuthUser,
    id: string,
    toStatus: 'APPROVED' | 'REJECTED' | 'ON_HOLD' | 'UNDER_REVIEW',
    extra?: { rejectionReason?: string; comment?: string },
  ) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw invoiceNotFound();
    }

    try {
      assertInvoiceTransition(invoice.status, toStatus);
    } catch (error) {
      if (error instanceof InvalidInvoiceTransitionError) {
        throw new UnprocessableEntityException({
          code: 'INVALID_TRANSITION',
          message: error.message,
        });
      }
      throw error;
    }

    const sequence =
      (await this.prisma.approvalStep.count({ where: { invoiceId: id } })) + 1;

    const approvalAction =
      toStatus === 'APPROVED'
        ? 'APPROVED'
        : toStatus === 'REJECTED'
          ? 'REJECTED'
          : toStatus === 'ON_HOLD'
            ? 'HOLD'
            : 'PENDING';

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: toStatus,
          ...(extra?.rejectionReason !== undefined
            ? { rejectionReason: extra.rejectionReason }
            : {}),
        },
      });
      if (approvalAction !== 'PENDING') {
        await tx.approvalStep.create({
          data: {
            invoiceId: id,
            approverId: user.sub,
            sequence,
            action: approvalAction,
            comment: extra?.comment ?? null,
            actedAt: new Date(),
          },
        });
      }
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: id,
      action: toStatus === 'UNDER_REVIEW' ? 'RESUME' : approvalAction,
      before: { status: invoice.status },
      after: { status: toStatus, ...(extra?.comment ? { comment: extra.comment } : {}) },
    });

    if (toStatus === 'APPROVED') {
      void this.asateel.dispatchAfterApproval(id, user.sub).catch((error) =>
        this.audit.record({
          actorId: user.sub,
          entity: 'Invoice',
          entityId: id,
          action: 'ASATEEL_DISPATCH_ERROR',
          after: {
            error: error instanceof Error ? error.message : 'Asateel dispatch failed.',
          },
        }),
      );
    }

    return { id, status: toStatus };
  }
}
