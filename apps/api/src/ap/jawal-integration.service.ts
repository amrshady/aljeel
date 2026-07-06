import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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
const DEFAULT_JAWAL_API_BASE = 'http://127.0.0.1:5000';
const DEFAULT_BATCHES_ROOT = '/home/clawdbot/.openclaw/workspace/aljeel/batches';
const SYSTEM_ACTOR = 'system:jawal';

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
  batch_id?: string;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
}

/**
 * Mirrors {@link AsateelIntegrationService} for the Jawal Travel reconciliation
 * engine. Differences vs Asateel: no region and no email step; the engine writes
 * a "resolved" spreadsheet (Spreadsheet-<batch>-FILLED-v30.xlsx) instead of an
 * Oracle upload, which is ingested as the downloadable ORACLE_UPLOAD document.
 *
 * NOTE: portal documents are stored with flat, sanitized filenames (folder
 * hierarchy is not captured at upload time), so docs are staged flat into
 * `<batch>/src/` with a `<docId>-` prefix. The Jawal engine's `/jawal/run`
 * discovery must tolerate this prefix and derive ticket/folder grouping from the
 * flat set (build-plan step 2).
 */
@Injectable()
export class JawalIntegrationService implements OnModuleInit, OnModuleDestroy {
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
    if (!invoice || invoice.supplier.erpIntegration !== 'JAWAL') {
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
    if (invoice.supplier.erpIntegration !== 'JAWAL') {
      throw new UnprocessableEntityException({
        code: 'JAWAL_NOT_ENABLED',
        message: 'This supplier is not configured for Jawal reconciliation.',
      });
    }
    if (invoice.status !== 'APPROVED') {
      throw new UnprocessableEntityException({
        code: 'INVOICE_NOT_APPROVED',
        message: 'Only approved invoices can run Jawal reconciliation.',
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
    if (!force && invoice.jawalStatus && ACTIVE_STATUSES.has(invoice.jawalStatus)) {
      return;
    }
    if (!force && invoice.jawalRunId) {
      return;
    }
    if (invoice.invoiceNumber.includes('/') || invoice.invoiceNumber.includes('\\')) {
      await this.markFailed(invoice.id, 'Invoice number cannot contain path separators.');
      return;
    }

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        jawalStatus: 'QUEUED',
        jawalRunId: null,
        jawalQueuePosition: null,
        jawalError: null,
        jawalFolderName: null,
        jawalTriggeredAt: new Date(),
        jawalStartedAt: null,
        jawalFinishedAt: null,
        jawalLastPolledAt: null,
        jawalOutputDocumentId: null,
      },
    });

    try {
      const folderName = await this.stageInvoiceDocuments(invoice);
      const payload = {
        archive_date: this.archiveDate(invoice),
        folder_name: folderName,
        batch_id: invoice.invoiceNumber,
      };
      const trigger = await this.enqueueRun(payload);

      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          jawalRunId: trigger.run_id,
          jawalStatus: 'QUEUED',
          jawalQueuePosition: trigger.queue_position,
          jawalFolderName: folderName,
          jawalError: null,
        },
      });
      await this.audit.record({
        actorId,
        entity: 'Invoice',
        entityId: invoice.id,
        action: force ? 'JAWAL_RERUN_QUEUED' : 'JAWAL_RUN_QUEUED',
        after: { runId: trigger.run_id, queuePosition: trigger.queue_position, ...payload },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Jawal trigger failed.';
      await this.markFailed(invoice.id, message);
      await this.audit.record({
        actorId,
        entity: 'Invoice',
        entityId: invoice.id,
        action: 'JAWAL_RUN_FAILED',
        after: { error: message },
      });
    }
  }

  private async stageInvoiceDocuments(invoice: InvoiceWithIntegration): Promise<string> {
    const batchesRoot = resolve(process.env.JAWAL_BATCHES_ROOT ?? DEFAULT_BATCHES_ROOT);
    const batchDir = resolve(batchesRoot, `jawal-${invoice.invoiceNumber}`);
    if (batchDir !== batchesRoot && !batchDir.startsWith(batchesRoot + '/')) {
      throw new Error('Invalid Jawal batch path.');
    }
    const srcDir = join(batchDir, 'src');
    await mkdir(srcDir, { recursive: true });

    const documents = invoice.documents.filter((doc) => doc.type !== 'ORACLE_UPLOAD');
    if (documents.length === 0) {
      throw new Error('Invoice has no source documents to stage for Jawal.');
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
    batch_id: string;
  }): Promise<TriggerResponse> {
    const key = process.env.JAWAL_TRIGGER_KEY;
    if (!key) {
      throw new Error('JAWAL_TRIGGER_KEY is not configured.');
    }
    const response = await fetch(`${this.apiBase()}/jawal/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Jawal-Trigger-Key': key,
      },
      body: JSON.stringify(payload),
    });
    if (response.status !== 202) {
      throw new Error(await this.responseError(response, 'Jawal trigger rejected the run.'));
    }
    return (await response.json()) as TriggerResponse;
  }

  private async pollActiveRuns(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const invoices = await this.prisma.invoice.findMany({
        where: { jawalStatus: { in: ['QUEUED', 'RUNNING'] }, jawalRunId: { not: null } },
        include: { documents: true },
        take: 25,
      });
      for (const invoice of invoices) {
        await this.pollOne(invoice).catch(async (error) => {
          const message = error instanceof Error ? error.message : 'Jawal polling failed.';
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
    if (!invoice.jawalRunId) return;
    const key = process.env.JAWAL_TRIGGER_KEY;
    if (!key) {
      await this.markFailed(invoice.id, 'JAWAL_TRIGGER_KEY is not configured.');
      return;
    }

    const response = await fetch(`${this.apiBase()}/jawal/run/${invoice.jawalRunId}`, {
      headers: { 'X-Jawal-Trigger-Key': key },
    });
    if (response.status === 404) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          jawalStatus: 'STATUS_LOST',
          jawalError: 'Jawal run status lost; check ops or re-run.',
          jawalLastPolledAt: new Date(),
        },
      });
      await this.audit.record({
        actorId: SYSTEM_ACTOR,
        entity: 'Invoice',
        entityId: invoice.id,
        action: 'JAWAL_STATUS_LOST',
        after: { runId: invoice.jawalRunId },
      });
      return;
    }
    if (!response.ok) {
      throw new Error(await this.responseError(response, 'Jawal status polling failed.'));
    }

    const status = (await response.json()) as RunStatusResponse;
    const mappedStatus = this.mapRunStatus(status.status);
    const terminal = mappedStatus === 'DONE' || mappedStatus === 'FAILED';
    const outputDocumentId =
      mappedStatus === 'DONE'
        ? await this.ingestResolvedOutput(invoice)
        : invoice.jawalOutputDocumentId;
    const error =
      mappedStatus === 'FAILED' ? status.error ?? 'Jawal reconciliation failed.' : null;

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        jawalStatus: mappedStatus,
        jawalError: error,
        jawalStartedAt: this.parseApiDate(status.started_at),
        jawalFinishedAt: this.parseApiDate(status.finished_at),
        jawalLastPolledAt: new Date(),
        jawalOutputDocumentId: outputDocumentId,
      },
    });

    if (terminal) {
      await this.audit.record({
        actorId: SYSTEM_ACTOR,
        entity: 'Invoice',
        entityId: invoice.id,
        action: mappedStatus === 'DONE' ? 'JAWAL_RUN_DONE' : 'JAWAL_RUN_FAILED',
        after: { runId: invoice.jawalRunId, outputDocumentId, error },
      });
    }
  }

  private async ingestResolvedOutput(
    invoice: Prisma.InvoiceGetPayload<{ include: { documents: true } }>,
  ): Promise<string | null> {
    if (invoice.jawalOutputDocumentId) {
      return invoice.jawalOutputDocumentId;
    }
    const outputPath = await this.findResolvedOutput(invoice);
    const data = await readFile(outputPath);
    const fileName = basename(outputPath);
    const storageKey = `local:integrations/jawal/${invoice.id}/${Date.now()}-${fileName}`;
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
      action: 'JAWAL_RESOLVED_OUTPUT_INGESTED',
      after: { invoiceId: invoice.id, fileName, outputPath },
    });
    return document.id;
  }

  private async findResolvedOutput(
    invoice: Prisma.InvoiceGetPayload<{ include: { documents: true } }>,
  ): Promise<string> {
    const outputDir = resolve(
      process.env.JAWAL_BATCHES_ROOT ?? DEFAULT_BATCHES_ROOT,
      `jawal-${invoice.invoiceNumber}`,
      'output',
    );
    const expected = join(outputDir, `Spreadsheet-${invoice.invoiceNumber}-FILLED-v30.xlsx`);
    if (await this.exists(expected)) {
      return expected;
    }
    const files = await readdir(outputDir).catch(() => [] as string[]);
    const xlsx = files.filter((file) => file.toLowerCase().endsWith('.xlsx'));
    const found = xlsx.find((file) => /filled/i.test(file)) ?? xlsx[0];
    if (!found) {
      throw new Error('Jawal resolved output file was not found on disk.');
    }
    return join(outputDir, found);
  }

  private async markFailed(invoiceId: string, message: string): Promise<void> {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        jawalStatus: 'FAILED',
        jawalError: message,
        jawalFinishedAt: new Date(),
        jawalLastPolledAt: new Date(),
      },
    });
  }

  private serializeStatus(
    invoice: Prisma.InvoiceGetPayload<{ include: { documents: true } }>,
  ) {
    const outputDoc = invoice.documents.find(
      (doc) => doc.id === invoice.jawalOutputDocumentId,
    );
    if (!invoice.jawalStatus && !invoice.jawalRunId) {
      return {
        vendor: 'JAWAL' as const,
        status: null,
        runId: null,
        queuePosition: null,
        emailSent: null,
        error: null,
        region: null,
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
      vendor: 'JAWAL' as const,
      status: invoice.jawalStatus,
      runId: invoice.jawalRunId,
      queuePosition: invoice.jawalQueuePosition,
      emailSent: null,
      error: invoice.jawalError,
      region: null,
      folderName: invoice.jawalFolderName,
      triggeredAt: invoice.jawalTriggeredAt?.toISOString() ?? null,
      startedAt: invoice.jawalStartedAt?.toISOString() ?? null,
      finishedAt: invoice.jawalFinishedAt?.toISOString() ?? null,
      lastPolledAt: invoice.jawalLastPolledAt?.toISOString() ?? null,
      outputDocumentId: invoice.jawalOutputDocumentId,
      outputFileName: outputDoc?.fileName ?? null,
    };
  }

  private mapRunStatus(status: RunStatusResponse['status']) {
    return status.toUpperCase() as 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
  }

  private parseApiDate(value: string | null | undefined): Date | null | undefined {
    return value ? new Date(value) : value === null ? null : undefined;
  }

  private apiBase(): string {
    return (process.env.JAWAL_API_BASE ?? DEFAULT_JAWAL_API_BASE).replace(/\/+$/, '');
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
