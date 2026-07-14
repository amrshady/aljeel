import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocumentCompleteUploadSchema,
  DocumentUploadUrlRequestSchema,
} from '@aljeel/kb-upload';
import {
  MAX_DOCUMENT_SIZE_BYTES,
  RenameDocumentSchema,
  UploadDocumentMetaSchema,
  isUnsafeEvidenceFileName,
  normalizeDocumentRelativePath,
  resolveDocumentMimeType,
  sanitizeEvidenceRelativePath,
  type DocumentType,
} from '@aljeel/shared-types';
import { Prisma } from '@prisma/client';
import type { ReadStream } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { KbStorageService } from '../kb/kb-storage.service';
import type { AuthUser } from '../auth/auth.types';
import { getSupplierScope } from '../auth/guards/tenant.guard';
import { invoiceNotFound, requireSupplierId } from '../common/tenant.util';

type DocumentRow = Prisma.DocumentGetPayload<Record<string, never>>;

const AP_ROLES = new Set(['AP_CLERK', 'AP_APPROVER']);

function canAccessAnyInvoice(user: AuthUser): boolean {
  return AP_ROLES.has(user.role);
}

function isApUser(user: AuthUser): boolean {
  return AP_ROLES.has(user.role);
}

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const UPLOAD_ALLOWED_STATUSES = new Set([
  'DRAFT',
  'REJECTED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ON_HOLD',
]);

/** Rename is pre-submit only (Jawal vendors need to fix evidence paths before Gate B). */
const RENAME_ALLOWED_STATUSES = new Set(['DRAFT', 'REJECTED']);

function serializeDocument(doc: DocumentRow) {
  return {
    id: doc.id,
    invoiceId: doc.invoiceId,
    type: doc.type,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    checksumSha256: doc.checksumSha256,
    virusScanStatus: doc.virusScanStatus,
    createdAt: doc.createdAt.toISOString(),
  };
}

function sanitizeFileName(name: string): string {
  // Preserve nested evidence paths (Jawal ticket/ref folders); storage keys still
  // use the basename via kb-upload sanitizeKbFileName.
  return sanitizeEvidenceRelativePath(name);
}

function storageBaseName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^\w.\-]+/g, '_').slice(0, 200) || 'file';
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly kb: KbStorageService,
  ) {}

  usesKbUpload(): boolean {
    return this.kb.isEnabled();
  }

  async createUploadUrl(
    user: AuthUser,
    invoiceId: string,
    body: unknown,
  ) {
    if (!this.kb.isEnabled()) {
      throw new ServiceUnavailableException({
        code: 'KB_UPLOAD_NOT_CONFIGURED',
        message: 'Direct-to-storage upload is not configured on this server.',
      });
    }

    const { fileName, sizeBytes, type } = DocumentUploadUrlRequestSchema.parse(body);
    if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the maximum allowed size.',
        details: { maxBytes: MAX_DOCUMENT_SIZE_BYTES },
      });
    }

    const supplierId = requireSupplierId(user);
    const invoice = await this.findOwnedInvoice(supplierId, invoiceId);
    this.assertUploadAllowed(invoice.status);

    const signed = await this.kb.createUploadUrl(invoiceId, storageBaseName(fileName));
    return { ...signed, type };
  }

  async completeUpload(user: AuthUser, invoiceId: string, body: unknown) {
    if (!this.kb.isEnabled()) {
      throw new ServiceUnavailableException({
        code: 'KB_UPLOAD_NOT_CONFIGURED',
        message: 'Direct-to-storage upload is not configured on this server.',
      });
    }

    const payload = DocumentCompleteUploadSchema.parse(body);
    const { storageKey, fileName, mimeType, sizeBytes, checksumSha256, type } = payload;
    this.assertSupplierUploadType(type);

    if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the maximum allowed size.',
        details: { maxBytes: MAX_DOCUMENT_SIZE_BYTES },
      });
    }
    if (!storageKey.startsWith(`invoices/${invoiceId}/`)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_STORAGE_KEY',
        message: 'Storage key does not match this invoice.',
      });
    }

    const supplierId = requireSupplierId(user);
    const invoice = await this.findOwnedInvoice(supplierId, invoiceId);
    this.assertUploadAllowed(invoice.status);

    const sanitizedFileName = sanitizeFileName(fileName);
    const dedupLockKey = `${invoiceId}:${sanitizedFileName}:${sizeBytes}:${checksumSha256 ?? ''}`;
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dedupLockKey}, 0))`;
        const existing = await tx.document.findFirst({
          where: {
            invoiceId,
            fileName: sanitizedFileName,
            sizeBytes,
            virusScanStatus: { not: 'FAILED' },
            ...(checksumSha256 ? { checksumSha256 } : {}),
          },
          orderBy: { createdAt: 'asc' },
        });
        if (existing) {
          return { document: existing, duplicatedStorageKey: storageKey };
        }

        const document = await tx.document.create({
          data: {
            invoiceId,
            type: type as DocumentType,
            fileName: sanitizedFileName,
            storageKey,
            mimeType,
            sizeBytes,
            checksumSha256,
            virusScanStatus: 'CLEAN',
          },
        });
        return { document, duplicatedStorageKey: null };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (result.duplicatedStorageKey) {
      if (result.document.storageKey !== result.duplicatedStorageKey) {
        await this.kb.deleteObject(result.duplicatedStorageKey);
      }
      return serializeDocument(result.document);
    }

    const { document } = result;

    await this.audit.record({
      actorId: user.sub,
      entity: 'Document',
      entityId: document.id,
      action: 'UPLOAD',
      after: {
        invoiceId,
        fileName: sanitizedFileName,
        type,
        sizeBytes,
        storageKey,
        checksumSha256,
        via: 'kb',
      },
    });

    return serializeDocument(document);
  }

  /** @deprecated Multipart upload — kept for environments without KB/Spaces config. */
  async upload(user: AuthUser, invoiceId: string, file: UploadedFile | undefined, meta: unknown) {
    if (this.kb.isEnabled()) {
      throw new UnprocessableEntityException({
        code: 'USE_KB_UPLOAD',
        message: 'Use the presigned upload flow (upload-url + complete) for this environment.',
      });
    }
    if (!file) {
      throw new UnprocessableEntityException({
        code: 'FILE_REQUIRED',
        message: 'A file is required.',
      });
    }
    const resolvedMime = resolveDocumentMimeType(file.originalname, file.mimetype);
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new PayloadTooLargeException({
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the maximum allowed size.',
        details: { maxBytes: MAX_DOCUMENT_SIZE_BYTES },
      });
    }

    const { type } = UploadDocumentMetaSchema.parse(meta ?? {});
    this.assertSupplierUploadType(type);
    const supplierId = requireSupplierId(user);
    const invoice = await this.findOwnedInvoice(supplierId, invoiceId);
    this.assertUploadAllowed(invoice.status);

    const relativePath =
      meta && typeof meta === 'object' && 'relativePath' in meta
        ? String((meta as { relativePath?: unknown }).relativePath ?? '')
        : '';
    const fileName = sanitizeFileName(relativePath || file.originalname);
    const storageKey = `local:${supplierId}/${invoiceId}/${crypto.randomUUID()}-${storageBaseName(fileName)}`;
    await this.storage.save(storageKey.replace(/^local:/, ''), file.buffer);

    const document = await this.prisma.document.create({
      data: {
        invoiceId,
        type: type as DocumentType,
        fileName,
        storageKey,
        mimeType: resolvedMime,
        sizeBytes: file.size,
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
      where: {
        invoiceId,
        ...(isApUser(user) ? {} : { type: { not: 'ORACLE_UPLOAD' as const } }),
      },
      orderBy: { createdAt: 'asc' },
    });
    return docs.map(serializeDocument);
  }

  async getForDownload(
    user: AuthUser,
    documentId: string,
  ): Promise<
    | { document: DocumentRow; redirectUrl: string }
    | { document: DocumentRow; stream: ReadStream }
  > {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { invoice: true },
    });
    if (!document) {
      throw this.documentNotFound();
    }
    await this.assertInvoiceAccess(user, document.invoiceId, document.invoice.supplierId);
    this.assertDocumentVisible(user, document);

    if (this.isKbStorageKey(document.storageKey)) {
      const url = await this.kb.createDownloadUrl(document.storageKey);
      return { document, redirectUrl: url };
    }

    const localKey = document.storageKey.replace(/^local:/, '');
    const stream = this.storage.createReadStream(localKey);
    return { document, stream };
  }

  async getForView(user: AuthUser, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { invoice: true },
    });
    if (!document) {
      throw this.documentNotFound();
    }
    await this.assertInvoiceAccess(user, document.invoiceId, document.invoice.supplierId);
    this.assertDocumentVisible(user, document);

    if (this.isKbStorageKey(document.storageKey)) {
      const url = await this.kb.createPreviewUrl(document.storageKey, {
        fileName: document.fileName,
        mimeType: resolveDocumentMimeType(document.fileName, document.mimeType),
      });
      return { document, viewUrl: url };
    }

    const localKey = document.storageKey.replace(/^local:/, '');
    const stream = this.storage.createReadStream(localKey);
    return { document, stream };
  }

  async rename(user: AuthUser, documentId: string, body: unknown) {
    const { fileName: requestedName } = RenameDocumentSchema.parse(body);
    if (isUnsafeEvidenceFileName(requestedName)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_FILENAME',
        message: 'That file name is not allowed.',
      });
    }

    const nextFileName = normalizeDocumentRelativePath(requestedName);
    if (!nextFileName || isUnsafeEvidenceFileName(nextFileName)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_FILENAME',
        message: 'That file name is not allowed.',
      });
    }

    const supplierId = requireSupplierId(user);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, invoice: { supplierId } },
      include: {
        invoice: {
          include: { supplier: { select: { erpIntegration: true } } },
        },
      },
    });
    if (!document) {
      throw this.documentNotFound();
    }

    if (document.invoice.supplier.erpIntegration !== 'JAWAL') {
      throw new UnprocessableEntityException({
        code: 'RENAME_NOT_ALLOWED',
        message: 'Only Jawal suppliers can rename documents before submission.',
      });
    }
    if (!RENAME_ALLOWED_STATUSES.has(document.invoice.status)) {
      throw new UnprocessableEntityException({
        code: 'RENAME_NOT_ALLOWED',
        message: 'Documents can only be renamed before the invoice is submitted.',
        details: { status: document.invoice.status },
      });
    }
    if (document.type === 'ORACLE_UPLOAD') {
      throw new UnprocessableEntityException({
        code: 'RENAME_NOT_ALLOWED',
        message: 'This document cannot be renamed.',
      });
    }

    if (document.fileName === nextFileName) {
      return serializeDocument(document);
    }

    const clash = await this.prisma.document.findFirst({
      where: {
        invoiceId: document.invoiceId,
        fileName: nextFileName,
        id: { not: documentId },
      },
      select: { id: true },
    });
    if (clash) {
      throw new UnprocessableEntityException({
        code: 'FILENAME_TAKEN',
        message: 'Another document on this invoice already uses that name.',
        details: { fileName: nextFileName },
      });
    }

    const nextMimeType = resolveDocumentMimeType(nextFileName, document.mimeType);
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        fileName: nextFileName,
        mimeType: nextMimeType,
      },
    });

    await this.audit.record({
      actorId: user.sub,
      entity: 'Document',
      entityId: documentId,
      action: 'RENAME',
      before: { invoiceId: document.invoiceId, fileName: document.fileName },
      after: { invoiceId: document.invoiceId, fileName: nextFileName },
    });

    return serializeDocument(updated);
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

    if (this.isKbStorageKey(document.storageKey)) {
      await this.kb.deleteObject(document.storageKey);
    } else {
      await this.storage.delete(document.storageKey.replace(/^local:/, ''));
    }

    await this.audit.record({
      actorId: user.sub,
      entity: 'Document',
      entityId: documentId,
      action: 'DELETE',
      before: { invoiceId: document.invoiceId, fileName: document.fileName },
    });

    return { id: documentId, deleted: true };
  }

  private isKbStorageKey(storageKey: string): boolean {
    return storageKey.startsWith('invoices/');
  }

  private assertUploadAllowed(status: string) {
    if (!UPLOAD_ALLOWED_STATUSES.has(status)) {
      throw new UnprocessableEntityException({
        code: 'UPLOAD_NOT_ALLOWED',
        message: 'Documents cannot be added once an invoice is approved or paid.',
        details: { status },
      });
    }
  }

  private assertSupplierUploadType(type: string) {
    if (type === 'ORACLE_UPLOAD') {
      throw new UnprocessableEntityException({
        code: 'DOCUMENT_TYPE_NOT_ALLOWED',
        message: 'This document type is reserved for AP integrations.',
      });
    }
  }

  private assertDocumentVisible(user: AuthUser, document: DocumentRow) {
    if (document.type === 'ORACLE_UPLOAD' && !isApUser(user)) {
      throw this.documentNotFound();
    }
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
