import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  InvoiceListQuerySchema,
  UpsertInvoiceDraftSchema,
  assertInvoiceTransition,
  computeInvoiceTotals,
  validateInvoiceMath,
  InvalidInvoiceTransitionError,
  type InvoiceListQuery,
  type UpsertInvoiceDraft,
} from '@aljeel/shared-types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { invoiceNotFound, requireSupplierId } from '../common/tenant.util';

export function serializeInvoice(
  invoice: Prisma.InvoiceGetPayload<{ include: { lines: true } }>,
) {
  return {
    id: invoice.id,
    supplierId: invoice.supplierId,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate.toISOString(),
    poId: invoice.poId,
    currency: invoice.currency,
    subtotal: invoice.subtotal.toString(),
    vat: invoice.vat.toString(),
    total: invoice.total.toString(),
    status: invoice.status,
    source: invoice.source,
    rejectionReason: invoice.rejectionReason,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      description: line.description,
      qty: line.qty.toString(),
      unitPrice: line.unitPrice.toString(),
      vatRate: line.vatRate.toString(),
      amount: line.amount.toString(),
      glCode: line.glCode ?? undefined,
      costCenter: line.costCenter ?? undefined,
    })),
  };
}

export function serializeTimelineEvent(event: {
  id: string;
  action: string;
  actorId: string | null;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
  createdAt: Date;
}) {
  return {
    id: event.id,
    action: event.action,
    actorId: event.actorId,
    before: event.before as Record<string, unknown> | null,
    after: event.after as Record<string, unknown> | null,
    createdAt: event.createdAt.toISOString(),
  };
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createDraft(user: AuthUser, body: unknown) {
    const dto: UpsertInvoiceDraft = UpsertInvoiceDraftSchema.parse(body);
    const supplierId = requireSupplierId(user);
    this.validateDraft(dto);

    const totals = computeInvoiceTotals(dto.lines);

    const invoice = await this.prisma.invoice.create({
      data: {
        supplierId,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: new Date(dto.invoiceDate),
        poId: dto.poId ?? null,
        currency: dto.currency,
        subtotal: totals.subtotal,
        vat: totals.vat,
        total: totals.total,
        status: 'DRAFT',
        lines: {
          create: totals.lines.map((line) => ({
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
            vatRate: line.vatRate,
            amount: line.amount,
            glCode: line.glCode,
            costCenter: line.costCenter,
          })),
        },
      },
      include: { lines: true },
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: invoice.id,
      action: 'CREATE',
      after: { status: 'DRAFT', invoiceNumber: invoice.invoiceNumber },
    });

    return serializeInvoice(invoice);
  }

  async updateDraft(user: AuthUser, id: string, body: unknown) {
    const dto: UpsertInvoiceDraft = UpsertInvoiceDraftSchema.parse(body);
    const supplierId = requireSupplierId(user);
    const existing = await this.findOwnedInvoice(supplierId, id);

    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      throw new UnprocessableEntityException({
        code: 'INVOICE_NOT_EDITABLE',
        message: 'Only draft or rejected invoices can be edited.',
      });
    }

    this.validateDraft(dto);

    const totals = computeInvoiceTotals(dto.lines);

    const invoice = await this.prisma.$transaction(async (tx) => {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      return tx.invoice.update({
        where: { id },
        data: {
          invoiceNumber: dto.invoiceNumber,
          invoiceDate: new Date(dto.invoiceDate),
          poId: dto.poId ?? null,
          currency: dto.currency,
          subtotal: totals.subtotal,
          vat: totals.vat,
          total: totals.total,
          status: 'DRAFT',
          rejectionReason: null,
          lines: {
            create: totals.lines.map((line) => ({
              description: line.description,
              qty: line.qty,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
              amount: line.amount,
              glCode: line.glCode,
              costCenter: line.costCenter,
            })),
          },
        },
        include: { lines: true },
      });
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: id,
      action: 'UPDATE',
      before: { status: existing.status },
      after: { status: 'DRAFT' },
    });

    return serializeInvoice(invoice);
  }

  async getById(user: AuthUser, id: string) {
    const supplierId = requireSupplierId(user);
    const invoice = await this.findOwnedInvoice(supplierId, id);
    const events = await this.audit.listForEntity('Invoice', id);
    return {
      ...serializeInvoice(invoice),
      timeline: events.map(serializeTimelineEvent),
    };
  }

  async list(user: AuthUser, query: Record<string, string | undefined>) {
    const params: InvoiceListQuery = InvoiceListQuerySchema.parse(query);
    const supplierId = requireSupplierId(user);

    const where: Prisma.InvoiceWhereInput = {
      supplierId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              { invoiceNumber: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy =
      params.sort === 'createdAt'
        ? { createdAt: 'asc' as const }
        : params.sort === '-invoiceDate'
          ? { invoiceDate: 'desc' as const }
          : params.sort === 'invoiceDate'
            ? { invoiceDate: 'asc' as const }
            : { createdAt: 'desc' as const };

    const [total, rows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { lines: true },
      }),
    ]);

    return {
      data: rows.map((row) => {
        const full = serializeInvoice(row);
        const { lines: _lines, ...item } = full;
        return item;
      }),
      page: params.page,
      pageSize: params.pageSize,
      total,
    };
  }

  async submit(user: AuthUser, id: string) {
    const supplierId = requireSupplierId(user);
    const invoice = await this.findOwnedInvoice(supplierId, id);

    try {
      assertInvoiceTransition(invoice.status, 'SUBMITTED');
    } catch (error) {
      if (error instanceof InvalidInvoiceTransitionError) {
        throw new UnprocessableEntityException({
          code: 'INVALID_TRANSITION',
          message: error.message,
        });
      }
      throw error;
    }

    const mathIssues = validateInvoiceMath(
      invoice.lines.map((line) => ({
        description: line.description,
        qty: line.qty.toString(),
        unitPrice: line.unitPrice.toString(),
        vatRate: line.vatRate.toString(),
      })),
    );
    if (mathIssues.length > 0) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Invoice validation failed.',
        details: { fields: mathIssues },
      });
    }

    const duplicate = await this.prisma.invoice.findFirst({
      where: {
        supplierId,
        invoiceNumber: invoice.invoiceNumber,
        id: { not: id },
        status: { notIn: ['DRAFT', 'REJECTED'] },
      },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'INVOICE_DUPLICATE',
        message: 'An invoice with this number already exists.',
        details: { invoiceNumber: invoice.invoiceNumber },
      });
    }

    await this.prisma.invoice.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: id,
      action: 'SUBMIT',
      before: { status: invoice.status },
      after: { status: 'SUBMITTED' },
    });

    assertInvoiceTransition('SUBMITTED', 'UNDER_REVIEW');

    const reviewed = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'UNDER_REVIEW',
        matchResult: { type: 'MANUAL_REVIEW', withinTolerance: false },
      },
      include: { lines: true },
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: id,
      action: 'STATUS_CHANGE',
      before: { status: 'SUBMITTED' },
      after: { status: 'UNDER_REVIEW' },
    });

    return {
      id: reviewed.id,
      status: reviewed.status,
      matchResult: { type: 'MANUAL_REVIEW' as const, withinTolerance: false as const },
    };
  }

  async getSummary(supplierId: string) {
    const groups = await this.prisma.invoice.groupBy({
      by: ['status'],
      where: { supplierId },
      _count: { status: true },
    });

    const counts = {
      draft: 0,
      submitted: 0,
      underReview: 0,
      approved: 0,
      scheduled: 0,
      paid: 0,
      rejected: 0,
      onHold: 0,
    };

    const map = {
      DRAFT: 'draft',
      SUBMITTED: 'submitted',
      UNDER_REVIEW: 'underReview',
      APPROVED: 'approved',
      SCHEDULED: 'scheduled',
      PAID: 'paid',
      REJECTED: 'rejected',
      ON_HOLD: 'onHold',
    } as const;

    for (const group of groups) {
      counts[map[group.status]] = group._count.status;
    }

    return counts;
  }

  private validateDraft(dto: UpsertInvoiceDraft) {
    const mathIssues = validateInvoiceMath(dto.lines);
    if (mathIssues.length > 0) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Invoice validation failed.',
        details: { fields: mathIssues },
      });
    }
  }

  private async findOwnedInvoice(supplierId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, supplierId },
      include: { lines: true },
    });
    if (!invoice) {
      throw invoiceNotFound();
    }
    return invoice;
  }
}
