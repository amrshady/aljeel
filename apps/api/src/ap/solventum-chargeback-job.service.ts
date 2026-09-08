import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SolventumIntegrationService } from './solventum-integration.service';
import type { SolventumPodFile } from './solventum-pod.types';

const publicSelect = {
  id: true,
  status: true,
  podCount: true,
  failedPodCount: true,
  failedPodNames: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;

function ttlHours() {
  const parsed = Number.parseInt(process.env.SOLVENTUM_JOB_TTL_HOURS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'getResponse' in error) {
    const response = (error as { getResponse(): unknown }).getResponse();
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
  }
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class SolventumChargebackJobService implements OnModuleInit {
  private readonly logger = new Logger(SolventumChargebackJobService.name);
  private queue = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly solventum: SolventumIntegrationService,
  ) {}

  async onModuleInit() {
    await this.cleanup();
    const interrupted = await this.prisma.solventumChargebackJob.findMany({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const job of interrupted) {
      await this.prisma.solventumChargebackJob.update({
        where: { id: job.id },
        data: { status: 'PENDING' },
      });
      this.enqueue(job.id);
    }
  }

  async create(workbookBytes: Buffer, pods: SolventumPodFile[]) {
    await this.cleanup();
    const job = await this.prisma.solventumChargebackJob.create({
      data: {
        podCount: pods.length,
        failedPodNames: [],
        workbookBytes: Uint8Array.from(workbookBytes),
        podNames: pods.map((pod) => pod.originalname),
        podBytes: pods.map((pod) => Uint8Array.from(pod.buffer)),
      },
      select: { id: true, status: true },
    });
    this.enqueue(job.id);
    return { jobId: job.id, status: job.status };
  }

  async get(jobId: string) {
    await this.cleanup();
    const job = await this.prisma.solventumChargebackJob.findUnique({
      where: { id: jobId },
      select: publicSelect,
    });
    if (!job)
      throw new NotFoundException({
        code: 'SOLVENTUM_JOB_NOT_FOUND',
        message: 'Solventum chargeback job not found.',
      });
    return {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      podCount: job.podCount,
      ...(job.failedPodCount
        ? { failedPodCount: job.failedPodCount, failedPodNames: job.failedPodNames }
        : {}),
      ...(job.error ? { error: job.error } : {}),
    };
  }

  async result(jobId: string): Promise<Buffer> {
    await this.cleanup();
    const job = await this.prisma.solventumChargebackJob.findUnique({ where: { id: jobId } });
    if (!job)
      throw new NotFoundException({
        code: 'SOLVENTUM_JOB_NOT_FOUND',
        message: 'Solventum chargeback job not found.',
      });
    if (job.status === 'FAILED')
      throw new UnprocessableEntityException({
        code: 'SOLVENTUM_JOB_FAILED',
        message: job.error ?? 'Solventum chargeback generation failed.',
      });
    if (job.status !== 'COMPLETED' || !job.resultBytes)
      throw new ConflictException({
        code: 'SOLVENTUM_JOB_NOT_READY',
        message: 'Solventum chargeback job is not complete yet.',
      });
    return Buffer.from(job.resultBytes);
  }

  private enqueue(jobId: string) {
    this.queue = this.queue
      .then(() => this.process(jobId))
      .catch((error) => this.logger.error(`Solventum job queue error: ${String(error)}`));
  }

  private async process(jobId: string) {
    const job = await this.prisma.solventumChargebackJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING', error: null },
      select: { workbookBytes: true, podNames: true, podBytes: true },
    });
    try {
      const generated = await this.solventum.generateChargebackWithMetadata(
        Buffer.from(job.workbookBytes),
        job.podNames.map((originalname, index) => ({
          originalname,
          buffer: Buffer.from(job.podBytes[index]!),
        })),
      );
      await this.prisma.solventumChargebackJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          resultBytes: Uint8Array.from(generated.output),
          failedPodCount: generated.failedPodNames.length,
          failedPodNames: generated.failedPodNames,
        },
      });
    } catch (error) {
      const message = errorMessage(error);
      await this.prisma.solventumChargebackJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: message },
      });
      this.logger.error(`Solventum chargeback job ${jobId} failed: ${message}`);
    }
  }

  private async cleanup() {
    const cutoff = new Date(Date.now() - ttlHours() * 60 * 60 * 1000);
    await this.prisma.solventumChargebackJob.deleteMany({ where: { createdAt: { lt: cutoff } } });
  }
}
