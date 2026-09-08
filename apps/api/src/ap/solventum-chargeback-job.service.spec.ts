/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SolventumChargebackJobService } from './solventum-chargeback-job.service';

type Row = Record<string, unknown> & { id: string; status: string };

function harness(
  generate = vi.fn().mockResolvedValue({ output: Buffer.from('xlsx'), failedPodNames: [] }),
) {
  const rows = new Map<string, Row>();
  let next = 0;
  const table = {
    create: vi.fn(async ({ data, select }: any) => {
      const now = new Date();
      const row: Row = {
        id: `job-${++next}`,
        status: 'PENDING',
        failedPodCount: 0,
        failedPodNames: [],
        error: null,
        resultBytes: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      rows.set(row.id, row);
      return select ? { id: row.id, status: row.status } : row;
    }),
    update: vi.fn(async ({ where, data, select }: any) => {
      const row = rows.get(where.id)!;
      Object.assign(row, data, { updatedAt: new Date() });
      if (!select) return row;
      return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
    }),
    findUnique: vi.fn(async ({ where, select }: any) => {
      const row = rows.get(where.id) ?? null;
      if (!row || !select) return row;
      return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
    }),
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const service = new SolventumChargebackJobService(
    { solventumChargebackJob: table } as any,
    { generateChargebackWithMetadata: generate } as any,
  );
  return { service, rows, generate, table };
}

async function eventually(check: () => void | Promise<void>) {
  for (let index = 0; index < 50; index++) {
    try {
      await check();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  }
  await check();
}

describe('SolventumChargebackJobService', () => {
  it('moves a created job through PENDING/PROCESSING to COMPLETED', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const generate = vi.fn(async () => {
      await gate;
      return { output: Buffer.from('xlsx'), failedPodNames: ['bad.pdf'] };
    });
    const { service, rows } = harness(generate);
    const created = await service.create(Buffer.from('book'), [
      { originalname: '1.pdf', buffer: Buffer.from('pdf') },
    ]);
    expect(created).toEqual({ jobId: 'job-1', status: 'PENDING' });
    await eventually(() => expect(rows.get('job-1')?.status).toBe('PROCESSING'));
    release();
    await eventually(() => expect(rows.get('job-1')?.status).toBe('COMPLETED'));
    expect(await service.get('job-1')).toMatchObject({
      status: 'COMPLETED',
      failedPodCount: 1,
      failedPodNames: ['bad.pdf'],
    });
  });

  it('stores generator failures as FAILED', async () => {
    const { service, rows } = harness(vi.fn().mockRejectedValue(new Error('OCR exploded')));
    await service.create(Buffer.from('book'), [
      { originalname: '1.pdf', buffer: Buffer.from('pdf') },
    ]);
    await eventually(() => expect(rows.get('job-1')?.status).toBe('FAILED'));
    expect(await service.get('job-1')).toMatchObject({ status: 'FAILED', error: 'OCR exploded' });
  });

  it('rejects results before ready and returns completed bytes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service } = harness(
      vi.fn(async () => {
        await gate;
        return { output: Buffer.from('xlsx'), failedPodNames: [] };
      }),
    );
    await service.create(Buffer.from('book'), [
      { originalname: '1.pdf', buffer: Buffer.from('pdf') },
    ]);
    await expect(service.result('job-1')).rejects.toBeInstanceOf(ConflictException);
    release();
    await eventually(async () => expect((await service.get('job-1')).status).toBe('COMPLETED'));
    expect((await service.result('job-1')).toString()).toBe('xlsx');
  });

  it('runs only one generator at a time', async () => {
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const generate = vi.fn(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return { output: Buffer.from('xlsx'), failedPodNames: [] };
    });
    const { service } = harness(generate);
    await service.create(Buffer.from('a'), [{ originalname: '1.pdf', buffer: Buffer.from('1') }]);
    await service.create(Buffer.from('b'), [{ originalname: '2.pdf', buffer: Buffer.from('2') }]);
    await eventually(() => expect(generate).toHaveBeenCalledTimes(1));
    releases.shift()!();
    await eventually(() => expect(generate).toHaveBeenCalledTimes(2));
    releases.shift()!();
    await eventually(() => expect(active).toBe(0));
    expect(maximum).toBe(1);
  });
});
