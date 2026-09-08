import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
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
  isValidJawalBatchId,
  isPlaceholderInvoiceNumber,
  validateInvoiceMath,
  InvalidInvoiceTransitionError,
  validateInvoiceSubmitDocuments,
  type CreateInvoiceDraft,
  type InvoiceListQuery,
  type JawalEvidenceIssue,
  type UpdateAsateelRegion,
  type UpsertInvoiceDraft,
  type SupplierErpIntegration,
} from '@aljeel/shared-types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { invoiceNotFound, requireSupplierId } from '../common/tenant.util';
import { InvoiceSubmitNotificationService } from '../notifications/invoice-submit-notification.service';
import { AsateelInvoiceManifestService } from './asateel-invoice-manifest.service';
import { JawalEvidenceCheckService } from './jawal-evidence-check.service';

const JAWAL_INVALID_BATCH_ID_MESSAGE =
  'Batch ID must follow the sequence format J26-#### (for example J26-1080). A label like "01-07jul" can be the display title but the batch ID must match the sequence.';

// Above this size, Jawal's content validation can require hundreds of serial
// object-storage reads. Keep that work outside the request/response lifetime.
const ASYNC_SUBMIT_DOCUMENT_THRESHOLD = 100;

function isApClerk(user: AuthUser): boolean {
  return user.role === 'AP_CLERK';
}

export function serializeInvoice(invoice: Prisma.InvoiceGetPayload<{ include: { lines: true } }>) {
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
    rejectionFindings: Array.isArray(invoice.rejectionFindings) ? invoice.rejectionFindings : null,
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
    const { supplierId, erpIntegration } = await this.resolveSupplierContext(
      user,
      dto.erpIntegration,
    );

    if (dto.invoiceNumber) {
      const supplier = await this.prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { erpIntegration: true },
      });
      if (supplier?.erpIntegration === 'JAWAL' && !isValidJawalBatchId(dto.invoiceNumber)) {
        throw new BadRequestException({
          code: 'JAWAL_INVALID_BATCH_ID',
          message: JAWAL_INVALID_BATCH_ID_MESSAGE,
          details: { invoiceNumber: dto.invoiceNumber },
        });
      }
    }

    if (dto.invoiceNumber) {
      const existingDraft = await this.prisma.invoice.findFirst({
        where: {
          supplierId,
          invoiceNumber: dto.invoiceNumber,
          archivedAt: null,
          status: { in: ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'] },
        },
        include: { lines: true },
      });
      if (existingDraft) {
        if (dto.asateelRegion && dto.asateelRegion !== existingDraft.asateelRegion) {
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
          archivedAt: null,
          status: { notIn: ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'] },
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

    let invoice: Prisma.InvoiceGetPayload<{ include: { lines: true } }>;
    try {
      invoice = await this.prisma.invoice.create({
        data: {
          supplierId,
          invoiceNumber:
            dto.invoiceNumber ?? `${PLACEHOLDER_INVOICE_NUMBER_PREFIX}${randomUUID().slice(0, 8)}`,
          invoiceDate: new Date(),
          currency: 'SAR',
          asateelRegion: dto.asateelRegion ?? null,
          status: 'DRAFT',
        },
        include: { lines: true },
      });
    } catch (error) {
      // Keep the read-before-create behavior friendly while also mapping a
      // concurrent active-folder creation that loses the unique-index race.
      if (
        dto.invoiceNumber &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'INVOICE_NUMBER_TAKEN',
          message: `An invoice folder named "${dto.invoiceNumber}" was already submitted.`,
          details: { invoiceNumber: dto.invoiceNumber },
        });
      }
      throw error;
    }

    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: invoice.id,
      action: 'CREATE',
      after: {
        status: 'DRAFT',
        invoiceNumber: invoice.invoiceNumber,
        ...(isApClerk(user) && erpIntegration ? { erpIntegration } : {}),
      },
    });

    return serializeInvoice(invoice);
  }

  async updateAsateelRegion(user: AuthUser, id: string, body: unknown) {
    const dto: UpdateAsateelRegion = UpdateAsateelRegionSchema.parse(body);
    const existing = await this.findInvoiceForUser(user, id);

    if (!['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'].includes(existing.status)) {
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

    if (!['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'].includes(existing.status)) {
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
          rejectionFindings: Prisma.DbNull,
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
    const invoice = await this.findInvoiceForUser(user, id);
    const events = await this.audit.listForEntity('Invoice', id);
    return {
      ...serializeInvoice(invoice),
      timeline: events.map(serializeTimelineEvent),
    };
  }

  async list(user: AuthUser, query: Record<string, string | undefined>) {
    const params: InvoiceListQuery = InvoiceListQuerySchema.parse(query);
    const supplierId = isApClerk(user)
      ? (await this.resolveSupplierContext(user, params.erpIntegration)).supplierId
      : requireSupplierId(user);

    const where: Prisma.InvoiceWhereInput = {
      supplierId,
      ...(params.archived ? { archivedAt: { not: null } } : { archivedAt: null }),
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [{ invoiceNumber: { contains: params.q, mode: 'insensitive' } }],
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

    if (!['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'].includes(invoice.status)) {
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
    try {
      return await this.processSubmission(user, id, false);
    } catch (error) {
      await this.persistCorrectableSubmissionFailure(user, id, error, [
        'DRAFT',
        'CHANGES_REQUESTED',
      ]);
      throw error;
    }
  }

  private async processSubmission(user: AuthUser, id: string, resumeAsyncSubmission: boolean) {
    const invoice = await this.findInvoiceForUser(user, id);
    const supplierId = invoice.supplierId;

    // A repeated click (or a retry after the client lost the response) is safe.
    // SUBMITTED is the durable in-progress state for a large submission.
    if (!resumeAsyncSubmission && invoice.status === 'SUBMITTED') {
      return { id: invoice.id, status: invoice.status };
    }
    if (!resumeAsyncSubmission && invoice.status === 'UNDER_REVIEW') {
      return {
        id: invoice.id,
        status: invoice.status,
        matchResult: { type: 'MANUAL_REVIEW' as const, withinTolerance: false as const },
      };
    }

    try {
      if (resumeAsyncSubmission && invoice.status === 'SUBMITTED') {
        assertInvoiceTransition('SUBMITTED', 'UNDER_REVIEW');
      } else {
        assertInvoiceTransition(
          invoice.status as Parameters<typeof assertInvoiceTransition>[0],
          'SUBMITTED',
        );
      }
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

    if (
      supplier?.erpIntegration === 'JAWAL' &&
      !isPlaceholderInvoiceNumber(invoice.invoiceNumber) &&
      !isValidJawalBatchId(invoice.invoiceNumber)
    ) {
      throw new BadRequestException({
        code: 'JAWAL_INVALID_BATCH_ID',
        message: JAWAL_INVALID_BATCH_ID_MESSAGE,
        details: { invoiceNumber: invoice.invoiceNumber },
      });
    }

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

    if (supplier?.erpIntegration === 'ASATEEL') {
      if (!invoice.asateelRegion) {
        throw new UnprocessableEntityException({
          code: 'ASATEEL_REGION_REQUIRED',
          message: 'Select an Asateel region before submitting this invoice.',
        });
      }
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

    if (!resumeAsyncSubmission && documents.length > ASYNC_SUBMIT_DOCUMENT_THRESHOLD) {
      const claimed = await this.prisma.invoice.updateMany({
        where: { id, status: invoice.status },
        data: { status: 'SUBMITTED', rejectionReason: null, rejectionFindings: Prisma.DbNull },
      });
      if (claimed.count === 0) {
        const current = await this.prisma.invoice.findUnique({
          where: { id },
          select: { status: true },
        });
        if (current?.status === 'SUBMITTED' || current?.status === 'UNDER_REVIEW') {
          return { id, status: current.status };
        }
        throw new ConflictException({
          code: 'SUBMIT_CONFLICT',
          message: 'Invoice status changed while it was being submitted.',
        });
      }

      await this.audit.record({
        actorId: user.sub,
        entity: 'Invoice',
        entityId: id,
        action: 'SUBMIT',
        before: { status: invoice.status },
        after: { status: 'SUBMITTED', async: true },
      });

      setImmediate(() => {
        void this.processSubmission(user, id, true).catch((error: unknown) =>
          this.failAsyncSubmission(user, id, error),
        );
      });

      return { id, status: 'SUBMITTED' as const };
    }

    let jawalWarning: JawalEvidenceIssue | null = null;
    if (supplier?.erpIntegration === 'ASATEEL') {
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

    if (supplier?.erpIntegration === 'ASATEEL') {
      const documentChecksums = [
        ...new Set(
          documents
            .filter(
              (document) =>
                document.virusScanStatus !== 'FAILED' && document.checksumSha256?.trim(),
            )
            .map((document) => document.checksumSha256!),
        ),
      ];
      if (documentChecksums.length > 0) {
        const duplicateDocuments = await this.prisma.document.findMany({
          where: {
            checksumSha256: { in: documentChecksums },
            virusScanStatus: { not: 'FAILED' },
            invoiceId: { not: id },
            invoice: {
              supplierId,
              archivedAt: null,
              status: { notIn: ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'] },
            },
          },
          orderBy: [{ invoice: { createdAt: 'asc' } }, { createdAt: 'asc' }],
          select: {
            checksumSha256: true,
            invoice: {
              select: { id: true, invoiceNumber: true, createdAt: true },
            },
          },
        });
        const currentFileNameByChecksum = new Map(
          documents
            .filter(
              (document) =>
                document.virusScanStatus !== 'FAILED' && document.checksumSha256?.trim(),
            )
            .map((document) => [document.checksumSha256!, document.fileName]),
        );
        const duplicateByChecksum = new Map<
          string,
          {
            fileName: string;
            priorInvoiceNumber: string;
            priorInvoiceId: string;
            priorSubmittedAt: string;
          }
        >();
        for (const duplicateDocument of duplicateDocuments) {
          const checksum = duplicateDocument.checksumSha256;
          if (!checksum || duplicateByChecksum.has(checksum)) continue;
          const fileName = currentFileNameByChecksum.get(checksum);
          if (!fileName) continue;
          duplicateByChecksum.set(checksum, {
            fileName,
            priorInvoiceNumber: duplicateDocument.invoice.invoiceNumber,
            priorInvoiceId: duplicateDocument.invoice.id,
            priorSubmittedAt: duplicateDocument.invoice.createdAt.toISOString(),
          });
        }
        const duplicates = [...duplicateByChecksum.values()];
        if (duplicates.length > 0) {
          const firstDuplicate = duplicates[0]!;
          throw new ConflictException({
            code: 'DUPLICATE_FILE_SUBMISSION',
            message: `${duplicates.length} file(s) in this upload were already submitted on other invoices. Remove them and try again.`,
            details: {
              duplicateCount: duplicates.length,
              duplicates: duplicates.map(({ fileName, priorInvoiceNumber, priorSubmittedAt }) => ({
                fileName,
                priorInvoiceNumber,
                priorSubmittedAt,
              })),
              fileName: firstDuplicate.fileName,
              priorInvoiceNumber: firstDuplicate.priorInvoiceNumber,
              priorInvoiceId: firstDuplicate.priorInvoiceId,
              priorSubmittedAt: firstDuplicate.priorSubmittedAt,
            },
          });
        }
      }
    }

    if (!isPlaceholderInvoiceNumber(invoice.invoiceNumber)) {
      const duplicate = await this.prisma.invoice.findFirst({
        where: {
          supplierId,
          invoiceNumber: invoice.invoiceNumber,
          id: { not: id },
          archivedAt: null,
          status: { notIn: ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'] },
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

    if (!resumeAsyncSubmission) {
      await this.prisma.invoice.update({
        where: { id },
        data: { status: 'SUBMITTED', rejectionReason: null, rejectionFindings: Prisma.DbNull },
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
    }

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

  private async failAsyncSubmission(user: AuthUser, id: string, error: unknown): Promise<void> {
    const persisted = await this.persistCorrectableSubmissionFailure(user, id, error, [
      'SUBMITTED',
    ]);
    if (persisted) {
      this.logger.error({ invoiceId: id, err: error }, 'Async invoice submission failed');
    }
  }

  private async persistCorrectableSubmissionFailure(
    user: AuthUser,
    id: string,
    error: unknown,
    fromStatuses: Array<'DRAFT' | 'CHANGES_REQUESTED' | 'SUBMITTED'>,
  ): Promise<boolean> {
    if (!(
      error instanceof UnprocessableEntityException ||
      error instanceof BadRequestException ||
      error instanceof ConflictException
    )) {
      return false;
    }
    const response =
      error instanceof UnprocessableEntityException ||
      error instanceof BadRequestException ||
      error instanceof ConflictException
        ? error.getResponse()
        : null;
    const reason =
      typeof response === 'object' && response && 'message' in response
        ? String(response.message)
        : 'Invoice submission processing failed. Please submit again.';
    const responseDetails =
      typeof response === 'object' && response && 'details' in response ? response.details : null;
    const responseCode =
      typeof response === 'object' && response && 'code' in response ? String(response.code) : null;
    if (responseCode === 'INVALID_TRANSITION') return false;
    const rejectionFindings =
      typeof responseDetails === 'object' &&
      responseDetails &&
      'findings' in responseDetails &&
      Array.isArray(responseDetails.findings)
        ? responseDetails.findings
        : null;

    const failed = await this.prisma.invoice.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: {
        status: 'CHANGES_REQUESTED',
        rejectionReason: reason,
        rejectionFindings: rejectionFindings
          ? (rejectionFindings as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });
    if (failed.count === 0) return false;

    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: id,
      action: 'STATUS_CHANGE',
      before: { status: fromStatuses.length === 1 ? fromStatuses[0] : 'SUPPLIER_EDITABLE' },
      after: {
        status: 'CHANGES_REQUESTED',
        submissionError: reason,
        ...(rejectionFindings ? { rejectionFindings } : {}),
      },
    });
    return true;
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
      changesRequested: 0,
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
      CHANGES_REQUESTED: 'changesRequested',
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

  private async resolveSupplierContext(
    user: AuthUser,
    erpIntegration?: SupplierErpIntegration,
  ): Promise<{ supplierId: string; erpIntegration: SupplierErpIntegration | null }> {
    if (isApClerk(user)) {
      if (!erpIntegration) {
        throw new BadRequestException({
          code: 'ERP_INTEGRATION_REQUIRED',
          message: 'Select whether this invoice is for Jawal, Asateel, or Solventum.',
        });
      }
      const supplier = await this.prisma.supplier.findFirst({
        where: { erpIntegration, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, erpIntegration: true },
      });
      if (!supplier) {
        throw new NotFoundException({
          code: 'SUPPLIER_NOT_CONFIGURED',
          message: `No active supplier is configured for ${erpIntegration}.`,
        });
      }
      return { supplierId: supplier.id, erpIntegration: supplier.erpIntegration };
    }

    const supplierId = requireSupplierId(user);
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { erpIntegration: true },
    });
    return { supplierId, erpIntegration: supplier?.erpIntegration ?? null };
  }

  private async findInvoiceForUser(user: AuthUser, id: string) {
    if (isApClerk(user)) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id },
        include: { lines: true },
      });
      if (!invoice) {
        throw invoiceNotFound();
      }
      return invoice;
    }

    const supplierId = requireSupplierId(user);
    return this.findOwnedInvoice(supplierId, id);
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
