import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assertInvoiceTransition,
  fileMatchesInvoiceNo,
  SignatureRejectRequestSchema,
} from '@aljeel/shared-types';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { SignatureNotificationService } from '../notifications/signature-notification.service';
import { PrismaService } from '../prisma/prisma.module';

const batchInclude = {
  supplier: { select: { legalName: true } },
  approvals: { orderBy: { sequence: 'asc' as const } },
  asateelSignatures: { orderBy: { invoiceNo: 'asc' as const } },
  documents: { select: { id: true, fileName: true, mimeType: true } },
};

@Injectable()
export class SignaturesService {
  private readonly logger = new Logger(SignaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly signatureNotification?: SignatureNotificationService,
  ) {}

  async list(user: AuthUser) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: 'AWAITING_SIGNATURE',
        archivedAt: null,
        approvals: { some: { approverId: user.sub, action: 'PENDING' } },
      },
      include: batchInclude,
      orderBy: { updatedAt: 'asc' },
    });

    return invoices
      .filter((invoice) => this.currentStep(invoice)?.approverId === user.sub)
      .map((invoice) => this.serializeListItem(invoice));
  }

  async get(user: AuthUser, invoiceId: string) {
    const invoice = await this.loadBatch(invoiceId);
    if (!invoice.approvals.some((step) => step.approverId === user.sub)) {
      throw new ForbiddenException({
        code: 'SIGNATURE_NOT_YOUR_TURN',
        message: 'This batch is not waiting for your signature.',
      });
    }
    return this.serializeDetail(user, invoice);
  }

  async approveLine(user: AuthUser, invoiceId: string, invoiceNo: string) {
    const invoice = await this.loadBatch(invoiceId);
    const step = this.assertCurrentSigner(user, invoice);
    if (step.sequence !== 1) {
      throw new UnprocessableEntityException({
        code: 'SIGNATURE_STAGE1_ONLY',
        message: 'Only the first signer approves invoices one at a time.',
      });
    }

    const row = invoice.asateelSignatures.find((signature) => signature.invoiceNo === invoiceNo);
    if (!row) {
      throw new NotFoundException({
        code: 'SIGNATURE_ROW_NOT_FOUND',
        message: 'That invoice is not in this batch.',
      });
    }

    const signedAt = await this.prisma.$transaction(async (tx) => {
      await this.lockPendingStep(tx, step.id);
      const current = await tx.asateelInvoiceSignature.findUnique({ where: { id: row.id } });
      if (current?.signedAt) return current.signedAt;
      const now = new Date();
      await tx.asateelInvoiceSignature.update({
        where: { id: row.id },
        data: { signedById: user.sub, signedAt: now },
      });
      await this.audit.record(
        {
          actorId: user.sub,
          entity: 'Invoice',
          entityId: invoice.id,
          action: 'ASATEEL_LINE_SIGNED',
          after: { invoiceNo, approvalStepId: step.id },
        },
        tx,
      );
      return now;
    });

    return {
      invoiceId: invoice.id,
      invoiceNo,
      signedAt: signedAt.toISOString(),
      stage1Complete: false,
    };
  }

  async unapproveLine(user: AuthUser, invoiceId: string, invoiceNo: string) {
    const invoice = await this.loadBatch(invoiceId);
    const step = this.assertCurrentSigner(user, invoice);
    if (step.sequence !== 1) {
      throw new UnprocessableEntityException({
        code: 'SIGNATURE_STAGE1_ONLY',
        message: 'Only the first signer approves invoices one at a time.',
      });
    }

    const row = invoice.asateelSignatures.find((signature) => signature.invoiceNo === invoiceNo);
    if (!row) {
      throw new NotFoundException({
        code: 'SIGNATURE_ROW_NOT_FOUND',
        message: 'That invoice is not in this batch.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockPendingStep(tx, step.id);
      const current = await tx.asateelInvoiceSignature.findUnique({ where: { id: row.id } });
      if (!current?.signedAt) return;
      await tx.asateelInvoiceSignature.update({
        where: { id: row.id },
        data: { signedById: null, signedAt: null },
      });
      await this.audit.record(
        {
          actorId: user.sub,
          entity: 'Invoice',
          entityId: invoice.id,
          action: 'ASATEEL_LINE_UNSIGNED',
          after: { invoiceNo, approvalStepId: step.id },
        },
        tx,
      );
    });

    return {
      invoiceId: invoice.id,
      invoiceNo,
      signedAt: null,
      stage1Complete: false,
    };
  }

  async complete(user: AuthUser, invoiceId: string) {
    const invoice = await this.loadBatch(invoiceId);
    const step = this.assertCurrentSigner(user, invoice);
    if (step.sequence !== 1) {
      throw new UnprocessableEntityException({
        code: 'SIGNATURE_STAGE1_ONLY',
        message: 'Only the first signer can send this batch on.',
      });
    }

    const completed = await this.prisma.$transaction(async (tx) => {
      if (!(await this.lockStep(tx, step.id))) return false;
      const unsigned = await tx.asateelInvoiceSignature.count({
        where: { invoiceId: invoice.id, signedAt: null },
      });
      if (unsigned > 0) {
        throw new UnprocessableEntityException({
          code: 'SIGNATURE_ROWS_REMAINING',
          message: 'Approve every invoice before sending the batch on.',
        });
      }
      await tx.approvalStep.update({
        where: { id: step.id },
        data: { action: 'APPROVED', actedAt: new Date() },
      });
      await this.audit.record(
        {
          actorId: user.sub,
          entity: 'Invoice',
          entityId: invoice.id,
          action: 'ASATEEL_STAGE1_COMPLETE',
          after: { approvalStepId: step.id },
        },
        tx,
      );
      return true;
    });
    if (!completed) {
      return { invoiceId: invoice.id, stage1Complete: true };
    }

    await this.notifyNextSigner(invoice);

    return { invoiceId: invoice.id, stage1Complete: true };
  }

  async approveBatch(user: AuthUser, invoiceId: string) {
    const invoice = await this.loadBatch(invoiceId);
    const step = this.assertCurrentSigner(user, invoice);
    if (step.sequence !== 2) {
      throw new UnprocessableEntityException({
        code: 'SIGNATURE_STAGE2_ONLY',
        message: 'Only the second signer approves the whole batch.',
      });
    }

    const stage1 = invoice.approvals.find((item) => item.sequence === 1);
    if (!stage1 || stage1.action !== 'APPROVED') {
      throw new UnprocessableEntityException({
        code: 'SIGNATURE_STAGE1_INCOMPLETE',
        message: 'The first signer has not finished this batch.',
      });
    }

    assertInvoiceTransition('AWAITING_SIGNATURE', 'UNDER_REVIEW');
    const actedAt = new Date();
    await this.assertStillPending(() =>
      this.prisma.$transaction([
        this.prisma.approvalStep.update({
          where: { id: step.id, action: 'PENDING' },
          data: { action: 'APPROVED', actedAt },
        }),
        this.prisma.invoice.update({
          where: { id: invoice.id, status: 'AWAITING_SIGNATURE' },
          data: { status: 'UNDER_REVIEW' },
        }),
      ]),
    );
    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: invoice.id,
      action: 'ASATEEL_BATCH_APPROVED',
      before: { status: 'AWAITING_SIGNATURE' },
      after: { status: 'UNDER_REVIEW', approvalStepId: step.id },
    });

    await this.notifyReadyForReview(user, invoice);

    return { invoiceId: invoice.id, status: 'UNDER_REVIEW' as const };
  }

  async rejectBatch(user: AuthUser, invoiceId: string, body: unknown) {
    const reason = this.rejectReason(body);
    const invoice = await this.loadBatch(invoiceId);
    const step = this.assertCurrentSigner(user, invoice);

    assertInvoiceTransition('AWAITING_SIGNATURE', 'CHANGES_REQUESTED');
    const actedAt = new Date();
    await this.assertStillPending(() =>
      this.prisma.$transaction([
        this.prisma.approvalStep.update({
          where: { id: step.id, action: 'PENDING' },
          data: { action: 'REJECTED', comment: reason, actedAt },
        }),
        this.prisma.invoice.update({
          where: { id: invoice.id, status: 'AWAITING_SIGNATURE' },
          data: {
            status: 'CHANGES_REQUESTED',
            rejectionReason: reason,
            rejectionFindings: Prisma.DbNull,
          },
        }),
      ]),
    );
    await this.audit.record({
      actorId: user.sub,
      entity: 'Invoice',
      entityId: invoice.id,
      action: 'ASATEEL_BATCH_REJECTED',
      before: { status: 'AWAITING_SIGNATURE' },
      after: { status: 'CHANGES_REQUESTED', approvalStepId: step.id, reason },
    });

    await this.notifySupplierRejected(invoice, reason);

    return { invoiceId: invoice.id, status: 'CHANGES_REQUESTED' as const };
  }

  /** Row-locks the step so line signing, revoking, and Done cannot interleave. */
  private async lockStep(tx: Prisma.TransactionClient, stepId: string): Promise<boolean> {
    const [locked] = await tx.$queryRaw<Array<{ action: string }>>`
      SELECT "action" FROM "ApprovalStep" WHERE "id" = ${stepId} FOR UPDATE
    `;
    return locked?.action === 'PENDING';
  }

  private async lockPendingStep(tx: Prisma.TransactionClient, stepId: string): Promise<void> {
    if (!(await this.lockStep(tx, stepId))) {
      throw new ConflictException({
        code: 'SIGNATURE_ALREADY_ACTED',
        message: 'This batch was already signed or sent back.',
      });
    }
  }

  private async ifStillPending<T>(write: () => Promise<T>): Promise<T | null> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  private async assertStillPending<T>(write: () => Promise<T>): Promise<T> {
    const result = await this.ifStillPending(write);
    if (result === null) {
      throw new ConflictException({
        code: 'SIGNATURE_ALREADY_ACTED',
        message: 'This batch was already signed or sent back.',
      });
    }
    return result;
  }

  private rejectReason(body: unknown) {
    const parsed = SignatureRejectRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'A reason is required.',
      });
    }
    return parsed.data.reason;
  }

  private async notifyNextSigner(invoice: {
    id: string;
    invoiceNumber: string;
    supplier: { legalName: string };
    approvals: Array<{ sequence: number; approverId: string | null }>;
  }) {
    if (!this.signatureNotification) return;
    const stage2 = invoice.approvals.find((step) => step.sequence === 2);
    if (!stage2?.approverId) return;
    try {
      const signer = await this.prisma.appUser.findUnique({ where: { id: stage2.approverId } });
      if (!signer) return;
      await this.signatureNotification.notifyAwaitingSigner({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierName: invoice.supplier.legalName,
        signerEmail: signer.email,
        signerName: signer.fullName,
      });
    } catch (error) {
      this.logger.error(
        { invoiceId: invoice.id, err: error },
        'Failed to send signature notification',
      );
    }
  }

  private async notifyReadyForReview(
    user: AuthUser,
    invoice: { id: string; invoiceNumber: string; supplier: { legalName: string } },
  ) {
    if (!this.signatureNotification) return;
    try {
      const submitter = await this.findSubmitter(invoice.id);
      await this.signatureNotification.notifyReadyForReview({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierName: invoice.supplier.legalName,
        submittedByEmail: submitter?.email ?? user.email,
        submittedByName: submitter?.fullName ?? user.fullName,
      });
    } catch (error) {
      this.logger.error(
        { invoiceId: invoice.id, err: error },
        'Failed to send review notification',
      );
    }
  }

  private async notifySupplierRejected(
    invoice: { id: string; invoiceNumber: string; supplierId: string },
    reason: string,
  ) {
    if (!this.signatureNotification) return;
    try {
      const submitter = await this.findSubmitter(invoice.id);
      const supplierEmails = submitter
        ? [submitter.email]
        : (
            await this.prisma.supplierUser.findMany({
              where: { supplierId: invoice.supplierId, isActive: true },
              select: { email: true },
            })
          ).map((supplierUser) => supplierUser.email);
      await this.signatureNotification.notifyRejected({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        reason,
        supplierEmails,
      });
    } catch (error) {
      this.logger.error(
        { invoiceId: invoice.id, err: error },
        'Failed to send supplier rejection email',
      );
    }
  }

  private async findSubmitter(invoiceId: string) {
    const event = await this.prisma.auditEvent.findFirst({
      where: { entity: 'Invoice', entityId: invoiceId, action: 'SUBMIT' },
      orderBy: { createdAt: 'desc' },
    });
    if (!event?.actorId) return null;
    const supplierUser = await this.prisma.supplierUser.findUnique({
      where: { id: event.actorId },
    });
    if (supplierUser) return supplierUser;
    return this.prisma.appUser.findUnique({ where: { id: event.actorId } });
  }

  private async loadBatch(invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, status: 'AWAITING_SIGNATURE', archivedAt: null },
      include: batchInclude,
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'SIGNATURE_BATCH_NOT_FOUND',
        message: 'That batch is not waiting for a signature.',
      });
    }
    return invoice;
  }

  private currentStep(invoice: {
    approvals: Array<{ action: string; sequence: number; approverId: string | null; id: string }>;
  }) {
    return invoice.approvals.find((step) => step.action === 'PENDING') ?? null;
  }

  private assertCurrentSigner(
    user: AuthUser,
    invoice: {
      approvals: Array<{ action: string; sequence: number; approverId: string | null; id: string }>;
    },
  ) {
    const step = this.currentStep(invoice);
    if (!step || step.approverId !== user.sub) {
      throw new ForbiddenException({
        code: 'SIGNATURE_NOT_YOUR_TURN',
        message: 'This batch is not waiting for your signature.',
      });
    }
    return step;
  }

  private serializeListItem(invoice: {
    id: string;
    invoiceNumber: string;
    asateelRegion: string | null;
    updatedAt: Date;
    supplier: { legalName: string };
    approvals: Array<{ action: string; sequence: number; approverId: string | null; id: string }>;
    asateelSignatures: Array<{ signedAt: Date | null }>;
  }) {
    const step = this.currentStep(invoice);
    const signedCount = invoice.asateelSignatures.filter((signature) => signature.signedAt).length;
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      supplierName: invoice.supplier.legalName,
      asateelRegion: invoice.asateelRegion,
      stage: step?.sequence ?? 1,
      invoiceCount: invoice.asateelSignatures.length,
      signedCount,
      updatedAt: invoice.updatedAt.toISOString(),
    };
  }

  private serializeDetail(
    user: AuthUser,
    invoice: {
      id: string;
      invoiceNumber: string;
      invoiceDate: Date;
      asateelRegion: string | null;
      updatedAt: Date;
      supplier: { legalName: string };
      approvals: Array<{ action: string; sequence: number; approverId: string | null; id: string }>;
      documents: Array<{ id: string; fileName: string; mimeType: string }>;
      asateelSignatures: Array<{ invoiceNo: string; signedAt: Date | null }>;
    },
  ) {
    const step = this.currentStep(invoice);
    return {
      ...this.serializeListItem(invoice),
      invoiceDate: invoice.invoiceDate.toISOString(),
      canApproveLines: step?.sequence === 1 && step.approverId === user.sub,
      canApproveBatch: step?.sequence === 2 && step.approverId === user.sub,
      rows: invoice.asateelSignatures.map((signature) => ({
        invoiceNo: signature.invoiceNo,
        signedAt: signature.signedAt?.toISOString() ?? null,
        files: invoice.documents
          .filter((document) => fileMatchesInvoiceNo(document.fileName, signature.invoiceNo))
          .map((document) => ({
            id: document.id,
            fileName: document.fileName,
            mimeType: document.mimeType,
          })),
      })),
    };
  }
}
