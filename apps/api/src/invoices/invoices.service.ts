import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CreateInvoiceDraftSchema,
  InvoiceListQuerySchema,
  PLACEHOLDER_INVOICE_NUMBER_PREFIX,
  UpdateAsateelRegionSchema,
  UpsertInvoiceDraftSchema,
  assertInvoiceTransition,
  computeInvoiceTotals,
  isPlaceholderInvoiceNumber,
  validateInvoiceMath,
  InvalidInvoiceTransitionError,
  validateInvoiceSubmitDocuments,
  type CreateInvoiceDraft,
  type InvoiceListQuery,
  type JawalEvidenceIssue,
  type UpdateAsateelRegion,
  type UpsertInvoiceDraft,
} from '@aljeel/shared-types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { invoiceNotFound, requireSupplierId } from '../common/tenant.util';
import { InvoiceSubmitNotificationService } from '../notifications/invoice-submit-notification.service';
import { AsateelInvoiceManifestService } from './asateel-invoice-manifest.service';
import { JawalEvidenceCheckService } from './jawal-evidence-check.service';

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
    archivedAt: invoice.archivedAt?.toISOString() ?? null,
    asateelRegion: invoice.asateelRegion ?? null,
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
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly asateelManifest: AsateelInvoiceManifestService,
    private readonly jawalEvidence: JawalEvidenceCheckService,
    private readonly invoiceSubmitNotification: InvoiceSubmitNotificationService,
  ) {}

  async createDraft(user: AuthUser, body: unknown) {
    const dto: CreateInvoiceDraft = CreateInvoiceDraftSchema.parse(body ?? {});
    const supplierId = requireSupplierId(user);

    if (dto.invoiceNumber) {
      const existingDraft = await this.prisma.invoice.findFirst({
        where: {
          supplierId,
          invoiceNumber: dto.invoiceNumber,
          status: { in: ['DRAFT', 'REJECTED'] },
        },
        include: { lines: true },
      });
      if (existingDraft) {
        if (
          dto.asateelRegion &&
          dto.asateelRegion !== existingDraft.asateelRegion
        ) {
          const updated = await this.prisma.invoice.update({
            where: { id: existingDraft.id },
            data: { asateelRegion: dto.asateelRegion },
            include: { lines: true },
          });
          await this.audit.record({
            actorId: user.sub,
            entity: 'Invoice',
            entityId: updated.id,
            action: 'UPDATE',
            before: { asateelRegion: existingDraft.asateelRegion },
            after: { asateelRegion: updated.asateelRegion },
          });
          return serializeInvoice(updated);
        }
        return serializeInvoice(existingDraft);
      }

      const alreadySubmitted = await this.prisma.invoice.findFirst({
        where: {
          supplierId,
          invoiceNumber: dto.invoiceNumber,
          status: { notIn: ['DRAFT', 'REJECTED'] },
        },
        select: { id: true },
      });
      if (alreadySubmitted) {
        throw new ConflictException({
          code: 'INVOICE_NUMBER_TAKEN',
          message: `An invoice folder named "${dto.invoiceNumber}" was already submitted.`,
          details: { invoiceNumber: dto.invoiceNumber },
        });
      }
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        supplierId,
        invoiceNumber:
          dto.invoiceNumber ??
          `${PLACEHOLDER_INVOICE_NUMBER_PREFIX}${randomUUID().slice(0, 8)}`,
        invoiceDate: new Date(),
        currency: 'SAR',
        asateelRegion: dto.asateelRegion ?? null,
        status: 'DRAFT',
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

  async updateAsateelRegion(user: AuthUser, id: string, body: unknown) {
    const dto: UpdateAsateelRegion = UpdateAsateelRegionSchema.parse(body);
    const supplierId = requireSupplierId(user);
    const existing = await this.findOwnedInvoice(supplierId, id);

    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      throw new UnprocessableEntityException({
        code: 'INVOICE_NOT_EDITABLE',
        message: 'Only draft or rejected invoices can be edited.',
      });
    }

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: { asateelRegion: dto.asateelRegion },
      include: { lines: true },
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: invoice.id,
      action: 'UPDATE',
      before: { asateelRegion: existing.asateelRegion },
      after: { asateelRegion: invoice.asateelRegion },
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
          asateelRegion: dto.asateelRegion ?? null,
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
      ...(params.archived
        ? { archivedAt: { not: null } }
        : { archivedAt: null }),
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
        : params.sort === '-createdAt'
          ? { createdAt: 'desc' as const }
          : params.sort === 'updatedAt'
            ? { updatedAt: 'asc' as const }
            : params.sort === '-updatedAt'
              ? { updatedAt: 'desc' as const }
              : params.sort === '-invoiceDate'
                ? { invoiceDate: 'desc' as const }
                : params.sort === 'invoiceDate'
                  ? { invoiceDate: 'asc' as const }
                  : { updatedAt: 'desc' as const };

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
        const full = serializeInvoice(row);
        const { lines: _lines, ...item } = full;
        const stats = statsByInvoiceId.get(row.id) ?? {
          documentCount: 0,
          totalSizeBytes: 0,
        };
        return { ...item, ...stats };
      }),
      page: params.page,
      pageSize: params.pageSize,
      total,
    };
  }

  async archive(user: AuthUser, id: string) {
    const supplierId = requireSupplierId(user);
    const invoice = await this.findOwnedInvoice(supplierId, id);

    if (invoice.archivedAt) {
      return {
        id: invoice.id,
        archivedAt: invoice.archivedAt.toISOString(),
      };
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'REJECTED') {
      throw new UnprocessableEntityException({
        code: 'INVOICE_NOT_ARCHIVABLE',
        message: 'Only draft or rejected invoices can be archived.',
      });
    }

    const archived = await this.prisma.invoice.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: id,
      action: 'ARCHIVE',
      before: { archivedAt: null },
      after: { archivedAt: archived.archivedAt?.toISOString() ?? null },
    });

    return {
      id: archived.id,
      archivedAt: archived.archivedAt!.toISOString(),
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

    const documents = await this.prisma.document.findMany({
      where: { invoiceId: id },
      select: {
        id: true,
        fileName: true,
        storageKey: true,
        sizeBytes: true,
        checksumSha256: true,
        virusScanStatus: true,
      },
    });

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { erpIntegration: true, legalName: true },
    });

    const documentIssue = validateInvoiceSubmitDocuments(
      documents.map((document) => document.fileName),
      { skipXlsxRequirement: supplier?.erpIntegration === 'JAWAL' },
    );
    if (documentIssue) {
      throw new UnprocessableEntityException({
        code: documentIssue.code,
        message: documentIssue.message,
      });
    }

    let jawalWarning: JawalEvidenceIssue | null = null;
    if (supplier?.erpIntegration === 'ASATEEL') {
      if (!invoice.asateelRegion) {
        throw new UnprocessableEntityException({
          code: 'ASATEEL_REGION_REQUIRED',
          message: 'Select an Asateel region before submitting this invoice.',
        });
      }
      const manifest = await this.asateelManifest.validateUploadedFolder(documents);
      if (manifest.error) {
        throw new UnprocessableEntityException({
          code: manifest.error.code,
          message: manifest.error.message,
          details: manifest.error.details,
        });
      }
    }
    if (supplier?.erpIntegration === 'JAWAL') {
      const evidence = await this.jawalEvidence.validateUploadedFolder(documents);
      if (evidence.error) {
        throw new UnprocessableEntityException({
          code: evidence.error.code,
          message: evidence.error.message,
          details: evidence.error.details,
        });
      }
      jawalWarning = evidence.warning;
    }

    if (invoice.lines.length > 0) {
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
    }

    const documentChecksums = [
      ...new Set(
        documents
          .filter(
            (document) =>
              document.virusScanStatus !== 'FAILED' &&
              document.checksumSha256?.trim(),
          )
          .map((document) => document.checksumSha256!),
      ),
    ];
    if (documentChecksums.length > 0) {
      const duplicateDocument = await this.prisma.document.findFirst({
        where: {
          checksumSha256: { in: documentChecksums },
          virusScanStatus: { not: 'FAILED' },
          invoiceId: { not: id },
          invoice: {
            supplierId,
            status: { notIn: ['DRAFT', 'REJECTED'] },
          },
        },
        orderBy: [{ invoice: { createdAt: 'asc' } }, { createdAt: 'asc' }],
        select: {
          fileName: true,
          invoice: {
            select: { id: true, invoiceNumber: true, createdAt: true },
          },
        },
      });
      if (duplicateDocument) {
        const priorSubmittedAt = duplicateDocument.invoice.createdAt.toISOString();
        throw new ConflictException({
          code: 'DUPLICATE_FILE_SUBMISSION',
          message: `This file was already submitted on invoice ${duplicateDocument.invoice.invoiceNumber} (${priorSubmittedAt}).`,
          details: {
            fileName: duplicateDocument.fileName,
            priorInvoiceNumber: duplicateDocument.invoice.invoiceNumber,
            priorInvoiceId: duplicateDocument.invoice.id,
            priorSubmittedAt,
          },
        });
      }
    }

    if (!isPlaceholderInvoiceNumber(invoice.invoiceNumber)) {
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
      after: {
        status: 'SUBMITTED',
        ...(jawalWarning
          ? {
              jawalEvidenceWarning: {
                code: jawalWarning.code,
                message: jawalWarning.message,
                details: jawalWarning.details ?? null,
              },
            }
          : {}),
      } as Prisma.InputJsonValue,
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

    void this.invoiceSubmitNotification
      .notifyInvoiceSubmitted({
        invoiceId: reviewed.id,
        invoiceNumber: reviewed.invoiceNumber,
        supplierName: supplier?.legalName ?? 'Unknown supplier',
        submittedByEmail: user.email,
        submittedByName: user.fullName,
      })
      .catch((error: unknown) => {
        this.logger.error(
          { invoiceId: reviewed.id, err: error },
          'Failed to send invoice submit notification email',
        );
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
      where: { supplierId, archivedAt: null },
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
