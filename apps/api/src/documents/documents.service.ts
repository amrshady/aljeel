import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MAX_DOCUMENT_SIZE_BYTES,
  UploadDocumentMetaSchema,
  isAllowedDocumentMimeType,
  resolveDocumentMimeType,
  type DocumentType,
} from '@aljeel/shared-types';
import type { Document as DocumentRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import type { AuthUser } from '../auth/auth.types';
import { getSupplierScope } from '../auth/guards/tenant.guard';
import { invoiceNotFound, requireSupplierId } from '../common/tenant.util';

const AP_ROLES = new Set(['AP_CLERK', 'AP_APPROVER']);

function canAccessAnyInvoice(user: AuthUser): boolean {
  return AP_ROLES.has(user.role);
}

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Statuses in which a supplier may still attach documents.
const UPLOAD_ALLOWED_STATUSES = new Set([
  'DRAFT',
  'REJECTED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ON_HOLD',
]);

function serializeDocument(doc: DocumentRow) {
  return {
    id: doc.id,
    invoiceId: doc.invoiceId,
    type: doc.type,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    virusScanStatus: doc.virusScanStatus,
    createdAt: doc.createdAt.toISOString(),
  };
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^\w.\-]+/g, '_').slice(0, 200) || 'file';
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async upload(user: AuthUser, invoiceId: string, file: UploadedFile | undefined, meta: unknown) {
    if (!file) {
      throw new UnprocessableEntityException({
        code: 'FILE_REQUIRED',
        message: 'A file is required.',
      });
    }
    const resolvedMime = resolveDocumentMimeType(file.originalname, file.mimetype);
    if (!isAllowedDocumentMimeType(resolvedMime)) {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Only PDF, image, and XML files are accepted.',
        details: { mimeType: file.mimetype, resolvedMime },
      });
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the maximum allowed size.',
        details: { maxBytes: MAX_DOCUMENT_SIZE_BYTES },
      });
    }

    const { type } = UploadDocumentMetaSchema.parse(meta ?? {});
    const supplierId = requireSupplierId(user);
    const invoice = await this.findOwnedInvoice(supplierId, invoiceId);

    if (!UPLOAD_ALLOWED_STATUSES.has(invoice.status)) {
      throw new UnprocessableEntityException({
        code: 'UPLOAD_NOT_ALLOWED',
        message: 'Documents cannot be added once an invoice is approved or paid.',
        details: { status: invoice.status },
      });
    }

    const fileName = sanitizeFileName(file.originalname);
    const storageKey = `${supplierId}/${invoiceId}/${randomUUID()}-${fileName}`;
    await this.storage.save(storageKey, file.buffer);

    const document = await this.prisma.document.create({
      data: {
        invoiceId,
        type: type as DocumentType,
        fileName,
        storageKey,
        mimeType: resolvedMime,
        sizeBytes: file.size,
        // Real malware scanning is wired in Phase 2 (P2-E1-T3); dev marks clean.
        virusScanStatus: 'CLEAN',
      },
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'Document',
      entityId: document.id,
      action: 'UPLOAD',
      after: { invoiceId, fileName, type, sizeBytes: file.size },
    });

    return serializeDocument(document);
  }

  async list(user: AuthUser, invoiceId: string) {
    await this.assertInvoiceAccess(user, invoiceId);
    const docs = await this.prisma.document.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'asc' },
    });
    return docs.map(serializeDocument);
  }

  async getForDownload(user: AuthUser, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { invoice: true },
    });
    if (!document) {
      throw this.documentNotFound();
    }
    await this.assertInvoiceAccess(user, document.invoiceId, document.invoice.supplierId);
    const stream = this.storage.createReadStream(document.storageKey);
    return { document, stream };
  }

  async remove(user: AuthUser, documentId: string) {
    const supplierId = requireSupplierId(user);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, invoice: { supplierId } },
      include: { invoice: true },
    });
    if (!document) {
      throw this.documentNotFound();
    }
    if (!UPLOAD_ALLOWED_STATUSES.has(document.invoice.status)) {
      throw new UnprocessableEntityException({
        code: 'DELETE_NOT_ALLOWED',
        message: 'Documents cannot be removed once an invoice is approved or paid.',
        details: { status: document.invoice.status },
      });
    }

    await this.prisma.document.delete({ where: { id: documentId } });
    await this.storage.delete(document.storageKey);

    await this.audit.record({
      actorId: user.sub,
      entity: 'Document',
      entityId: documentId,
      action: 'DELETE',
      before: { invoiceId: document.invoiceId, fileName: document.fileName },
    });

    return { id: documentId, deleted: true };
  }

  private async assertInvoiceAccess(
    user: AuthUser,
    invoiceId: string,
    supplierId?: string,
  ) {
    if (canAccessAnyInvoice(user)) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        throw invoiceNotFound();
      }
      return invoice;
    }
    const scope = getSupplierScope(user) ?? requireSupplierId(user);
    if (supplierId && supplierId !== scope) {
      throw invoiceNotFound();
    }
    return this.findOwnedInvoice(scope, invoiceId);
  }

  private async findOwnedInvoice(supplierId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, supplierId },
    });
    if (!invoice) {
      throw invoiceNotFound();
    }
    return invoice;
  }

  private documentNotFound() {
    return new NotFoundException({
      code: 'DOCUMENT_NOT_FOUND',
      message: 'Document not found.',
    });
  }
}
