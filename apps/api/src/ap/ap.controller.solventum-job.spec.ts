/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApController } from './ap.controller';

describe('ApController Solventum job result', () => {
  it('propagates 409 while a result is not ready', async () => {
    const jobs = {
      result: vi.fn().mockRejectedValue(new ConflictException({ code: 'SOLVENTUM_JOB_NOT_READY' })),
    };
    const controller = new ApController({} as any, {} as any, jobs as any, {} as any);
    await expect(controller.getSolventumChargebackResult('job', {} as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('streams completed workbook bytes with download headers', async () => {
    const jobs = { result: vi.fn().mockResolvedValue(Buffer.from('xlsx')) };
    const response = { set: vi.fn(), send: vi.fn() };
    const controller = new ApController({} as any, {} as any, jobs as any, {} as any);
    await controller.getSolventumChargebackResult('job', response as any);
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Length': '4',
      }),
    );
    expect(response.send).toHaveBeenCalledWith(Buffer.from('xlsx'));
  });
});
