import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  getAsateelRegionCode,
  getAsateelRegionFilePrefix,
  parseAsateelRegionFromFolderName,
} from '@aljeel/shared-types';
import type { AsateelRegion, Prisma } from '@prisma/client';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { KbStorageService } from '../kb/kb-storage.service';
import { StorageService } from '../storage/storage.service';

const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);
const POLL_INTERVAL_MS = 45_000;
const DEFAULT_ASATEEL_API_BASE = 'http://127.0.0.1:5000';
const DEFAULT_BATCHES_ROOT = '/home/clawdbot/.openclaw/workspace/aljeel/batches';
const SYSTEM_ACTOR = 'system:asateel';

type InvoiceWithIntegration = Prisma.InvoiceGetPayload<{
  include: { supplier: true; documents: true };
}>;

interface TriggerResponse {
  run_id: string;
  status: 'queued';
  queue_position: number;
}

interface RunStatusResponse {
  run_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  region?: string;
  batch_id?: string;
  started_at?: string | null;
  finished_at?: string | null;
  email_sent?: boolean | null;
  error?: string | null;
}

@Injectable()
export class AsateelIntegrationService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly kb: KbStorageService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.pollActiveRuns(), POLL_INTERVAL_MS);
    void this.pollActiveRuns();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async dispatchAfterApproval(invoiceId: string, actorId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { supplier: true, documents: true },
    });
    if (!invoice || invoice.supplier.erpIntegration !== 'ASATEEL') {
      return;
    }

    await this.startRun(invoice, actorId, false);
  }

  async rerun(invoiceId: string, actorId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { supplier: true, documents: true },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found.',
      });
    }
    if (invoice.supplier.erpIntegration !== 'ASATEEL') {
      throw new UnprocessableEntityException({
        code: 'ASATEEL_NOT_ENABLED',
        message: 'This supplier is not configured for Asateel reconciliation.',
      });
    }
    if (invoice.status !== 'APPROVED') {
      throw new UnprocessableEntityException({
        code: 'INVOICE_NOT_APPROVED',
        message: 'Only approved invoices can run Asateel reconciliation.',
      });
    }

    await this.startRun(invoice, actorId, true);
    return this.getStatus(invoiceId);
  }

  async getStatus(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { documents: true },
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'INVOICE_NOT_FOUND',
        message: 'Invoice not found.',
      });
    }
    return this.serializeStatus(invoice);
  }

  private async startRun(
    invoice: InvoiceWithIntegration,
    actorId: string,
    force: boolean,
  ): Promise<void> {
    if (!force && invoice.asateelStatus && ACTIVE_STATUSES.has(invoice.asateelStatus)) {
      return;
    }
    if (!force && invoice.asateelRunId) {
      return;
    }
    if (invoice.invoiceNumber.includes('/') || invoice.invoiceNumber.includes('\\')) {
      await this.markFailed(invoice.id, 'Invoice number cannot contain path separators.');
      return;
    }

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        asateelStatus: 'QUEUED',
        asateelRunId: null,
        asateelQueuePosition: null,
        asateelEmailSent: null,
        asateelError: null,
        asateelFolderName: null,
        asateelTriggeredAt: new Date(),
        asateelStartedAt: null,
        asateelFinishedAt: null,
        asateelLastPolledAt: null,
        asateelOracleDocumentId: null,
      },
    });

    try {
      const folderName = await this.stageInvoiceDocuments(invoice);
      const region = this.resolveRegion(folderName, invoice.asateelRegion);
      const payload = {
        archive_date: this.archiveDate(invoice),
        folder_name: folderName,
        region: region,
        batch_id: invoice.invoiceNumber,
      };
      const trigger = await this.enqueueRun(payload);

      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          asateelRunId: trigger.run_id,
          asateelStatus: 'QUEUED',
          asateelQueuePosition: trigger.queue_position,
          asateelRegion: region,
          asateelFolderName: folderName,
          asateelError: null,
        },
      });
      await this.audit.record({
        actorId,
        entity: 'Invoice',
        entityId: invoice.id,
        action: force ? 'ASATEEL_RERUN_QUEUED' : 'ASATEEL_RUN_QUEUED',
        after: { runId: trigger.run_id, queuePosition: trigger.queue_position, ...payload },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Asateel trigger failed.';
      await this.markFailed(invoice.id, message);
      await this.audit.record({
        actorId,
        entity: 'Invoice',
        entityId: invoice.id,
        action: 'ASATEEL_RUN_FAILED',
        after: { error: message },
      });
    }
  }

  private async stageInvoiceDocuments(invoice: InvoiceWithIntegration): Promise<string> {
    const batchesRoot = resolve(process.env.ASATEEL_BATCHES_ROOT ?? DEFAULT_BATCHES_ROOT);
    const batchDir = resolve(batchesRoot, `asateel-${invoice.invoiceNumber}`);
    if (batchDir !== batchesRoot && !batchDir.startsWith(batchesRoot + '/')) {
      throw new Error('Invalid Asateel batch path.');
    }
    const srcDir = join(batchDir, 'src');
    await mkdir(srcDir, { recursive: true });

    const documents = invoice.documents.filter((doc) => doc.type !== 'ORACLE_UPLOAD');
    if (documents.length === 0) {
      throw new Error('Invoice has no source documents to stage for Asateel.');
    }

    for (const doc of documents) {
      const fileName = `${doc.id}-${this.sanitizeFileName(doc.fileName)}`;
      const target = join(srcDir, fileName);
      if (doc.storageKey.startsWith('invoices/')) {
        await pipeline(await this.kb.createReadStream(doc.storageKey), createWriteStream(target));
      } else {
        await pipeline(
          this.storage.createReadStream(doc.storageKey.replace(/^local:/, '')),
          createWriteStream(target),
        );
      }
    }

    return srcDir;
  }

  private resolveRegion(folderName: string, fallback: AsateelRegion | null): AsateelRegion {
    const parsed = parseAsateelRegionFromFolderName(folderName);
    if (parsed) {
      return parsed;
    }
    if (fallback) {
      return fallback;
    }
    throw new Error('Asateel region is missing or ambiguous.');
  }

  private archiveDate(invoice: InvoiceWithIntegration): string {
    const firstDocumentDate = invoice.documents
      .filter((doc) => doc.type !== 'ORACLE_UPLOAD')
      .map((doc) => doc.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return (firstDocumentDate ?? invoice.createdAt).toISOString().slice(0, 10);
  }

  private async enqueueRun(payload: {
    archive_date: string;
    folder_name: string;
    region: string;
    batch_id: string;
  }): Promise<TriggerResponse> {
    const key = process.env.ASATEEL_TRIGGER_KEY;
    if (!key) {
      throw new Error('ASATEEL_TRIGGER_KEY is not configured.');
    }
    const response = await fetch(`${this.apiBase()}/asateel/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Asateel-Trigger-Key': key,
      },
      body: JSON.stringify(payload),
    });
    if (response.status !== 202) {
      throw new Error(await this.responseError(response, 'Asateel trigger rejected the run.'));
    }
    return (await response.json()) as TriggerResponse;
  }

  private async pollActiveRuns(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const invoices = await this.prisma.invoice.findMany({
        where: { asateelStatus: { in: ['QUEUED', 'RUNNING'] }, asateelRunId: { not: null } },
        include: { documents: true },
        take: 25,
      });
      for (const invoice of invoices) {
        await this.pollOne(invoice).catch(async (error) => {
          const message = error instanceof Error ? error.message : 'Asateel polling failed.';
          await this.markFailed(invoice.id, message);
        });
      }
    } finally {
      this.polling = false;
    }
  }

  private async pollOne(
    invoice: Prisma.InvoiceGetPayload<{ include: { documents: true } }>,
  ): Promise<void> {
    if (!invoice.asateelRunId) return;
    const key = process.env.ASATEEL_TRIGGER_KEY;
    if (!key) {
      await this.markFailed(invoice.id, 'ASATEEL_TRIGGER_KEY is not configured.');
      return;
    }

    const response = await fetch(`${this.apiBase()}/asateel/run/${invoice.asateelRunId}`, {
      headers: { 'X-Asateel-Trigger-Key': key },
    });
    if (response.status === 404) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          asateelStatus: 'STATUS_LOST',
          asateelError: 'Asateel run status lost; check ops or re-run.',
          asateelLastPolledAt: new Date(),
        },
      });
      await this.audit.record({
        actorId: SYSTEM_ACTOR,
        entity: 'Invoice',
        entityId: invoice.id,
        action: 'ASATEEL_STATUS_LOST',
        after: { runId: invoice.asateelRunId },
      });
      return;
    }
    if (!response.ok) {
      throw new Error(await this.responseError(response, 'Asateel status polling failed.'));
    }

    const status = (await response.json()) as RunStatusResponse;
    const mappedStatus = this.mapRunStatus(status.status);
    const terminal = mappedStatus === 'DONE' || mappedStatus === 'FAILED';
    const oracleDocumentId =
      mappedStatus === 'DONE'
        ? await this.ingestOracleUpload(invoice, status.email_sent ?? null)
        : invoice.asateelOracleDocumentId;
    const error =
      mappedStatus === 'FAILED'
        ? status.error ?? 'Asateel reconciliation failed.'
        : mappedStatus === 'DONE' && status.email_sent === false
          ? 'Completed, but email delivery failed.'
          : null;

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        asateelStatus: mappedStatus,
        asateelEmailSent: status.email_sent ?? null,
        asateelError: error,
        asateelStartedAt: this.parseApiDate(status.started_at),
        asateelFinishedAt: this.parseApiDate(status.finished_at),
        asateelLastPolledAt: new Date(),
        asateelOracleDocumentId: oracleDocumentId,
      },
    });

    if (terminal) {
      await this.audit.record({
        actorId: SYSTEM_ACTOR,
        entity: 'Invoice',
        entityId: invoice.id,
        action: mappedStatus === 'DONE' ? 'ASATEEL_RUN_DONE' : 'ASATEEL_RUN_FAILED',
        after: {
          runId: invoice.asateelRunId,
          emailSent: status.email_sent ?? null,
          oracleDocumentId,
          error,
        },
      });
    }
  }

  private async ingestOracleUpload(
    invoice: Prisma.InvoiceGetPayload<{ include: { documents: true } }>,
    emailSent: boolean | null,
  ): Promise<string | null> {
    if (invoice.asateelOracleDocumentId) {
      return invoice.asateelOracleDocumentId;
    }
    const outputPath = await this.findOracleUpload(invoice);
    const data = await readFile(outputPath);
    const fileName = basename(outputPath);
    const storageKey = `local:integrations/asateel/${invoice.id}/${Date.now()}-${fileName}`;
    await this.storage.save(storageKey.replace(/^local:/, ''), data);
    const document = await this.prisma.document.create({
      data: {
        invoiceId: invoice.id,
        type: 'ORACLE_UPLOAD',
        fileName,
        storageKey,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: data.byteLength,
        virusScanStatus: 'CLEAN',
      },
    });
    await this.audit.record({
      actorId: SYSTEM_ACTOR,
      entity: 'Document',
      entityId: document.id,
      action: 'ASATEEL_ORACLE_UPLOAD_INGESTED',
      after: { invoiceId: invoice.id, fileName, outputPath, emailSent },
    });
    return document.id;
  }

  private async findOracleUpload(
    invoice: Prisma.InvoiceGetPayload<{ include: { documents: true } }>,
  ): Promise<string> {
    const region = invoice.asateelRegion;
    if (!region) {
      throw new Error('Cannot locate Oracle upload without Asateel region.');
    }
    const batchDir = resolve(
      process.env.ASATEEL_BATCHES_ROOT ?? DEFAULT_BATCHES_ROOT,
      `asateel-${invoice.invoiceNumber}`,
    );
    const trailingNumber = invoice.invoiceNumber.match(/(\d+)$/)?.[1];
    if (trailingNumber) {
      const expected = join(
        batchDir,
        `${getAsateelRegionFilePrefix(region)}-${trailingNumber}-2026_Oracle-upload.xlsx`,
      );
      if (await this.exists(expected)) {
        return expected;
      }
    }
    const files = await readdir(batchDir);
    const found = files.find((file) => file.endsWith('_Oracle-upload.xlsx'));
    if (!found) {
      throw new Error('Asateel Oracle upload file was not found on disk.');
    }
    return join(batchDir, found);
  }

  private async markFailed(invoiceId: string, message: string): Promise<void> {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        asateelStatus: 'FAILED',
        asateelError: message,
        asateelFinishedAt: new Date(),
        asateelLastPolledAt: new Date(),
      },
    });
  }

  private serializeStatus(
    invoice: Prisma.InvoiceGetPayload<{ include: { documents: true } }>,
  ) {
    const oracleDoc = invoice.documents.find(
      (doc) => doc.id === invoice.asateelOracleDocumentId,
    );
    if (!invoice.asateelStatus && !invoice.asateelRunId) {
      return {
        vendor: 'ASATEEL' as const,
        status: null,
        runId: null,
        queuePosition: null,
        emailSent: null,
        error: null,
        region: invoice.asateelRegion,
        folderName: null,
        triggeredAt: null,
        startedAt: null,
        finishedAt: null,
        lastPolledAt: null,
        outputDocumentId: null,
        outputFileName: null,
      };
    }
    return {
      vendor: 'ASATEEL' as const,
      status: invoice.asateelStatus,
      runId: invoice.asateelRunId,
      queuePosition: invoice.asateelQueuePosition,
      emailSent: invoice.asateelEmailSent,
      error: invoice.asateelError,
      region: invoice.asateelRegion,
      folderName: invoice.asateelFolderName,
      triggeredAt: invoice.asateelTriggeredAt?.toISOString() ?? null,
      startedAt: invoice.asateelStartedAt?.toISOString() ?? null,
      finishedAt: invoice.asateelFinishedAt?.toISOString() ?? null,
      lastPolledAt: invoice.asateelLastPolledAt?.toISOString() ?? null,
      outputDocumentId: invoice.asateelOracleDocumentId,
      outputFileName: oracleDoc?.fileName ?? null,
    };
  }

  private mapRunStatus(status: RunStatusResponse['status']) {
    return status.toUpperCase() as 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  }

  private parseApiDate(value: string | null | undefined): Date | null | undefined {
    return value ? new Date(value) : value === null ? null : undefined;
  }

  private apiBase(): string {
    return (process.env.ASATEEL_API_BASE ?? DEFAULT_ASATEEL_API_BASE).replace(/\/+$/, '');
  }

  private async responseError(response: Response, fallback: string): Promise<string> {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return body?.error ? `${fallback} ${body.error}` : fallback;
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private sanitizeFileName(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? 'file';
    return base.replace(/[^\w.\-]+/g, '_').slice(0, 200) || 'file';
  }
}
