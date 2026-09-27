import { Logger } from '@nestjs/common';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JawalIntegrationService } from './jawal-integration.service';

describe('JawalIntegrationService resolved output selection', () => {
  let batchesRoot: string;

  beforeEach(async () => {
    batchesRoot = await mkdtemp(join(tmpdir(), 'jawal-output-'));
    process.env.JAWAL_BATCHES_ROOT = batchesRoot;
  });

  afterEach(async () => {
    delete process.env.JAWAL_BATCHES_ROOT;
    vi.restoreAllMocks();
    await rm(batchesRoot, { recursive: true, force: true });
  });

  const service = () =>
    new JawalIntegrationService({} as never, {} as never, {} as never, {} as never);

  async function outputFile(batch: string, fileName: string) {
    const outputDir = join(batchesRoot, `jawal-${batch}`, 'output');
    await mkdir(outputDir, { recursive: true });
    const path = join(outputDir, fileName);
    await writeFile(path, fileName);
    return path;
  }

  async function findResolvedOutput(instance: JawalIntegrationService, batch: string) {
    return (
      instance as unknown as {
        findResolvedOutput(invoice: { id: string; invoiceNumber: string }): Promise<string>;
      }
    ).findResolvedOutput({ id: 'invoice-1', invoiceNumber: batch });
  }

  it('prefers the human review workbook over plain and split artifacts', async () => {
    const batch = 'J26-1080';
    await outputFile(batch, `Spreadsheet-${batch}-FILLED-v30.xlsx`);
    await outputFile(batch, `Spreadsheet-${batch}-FILLED-v30-SPLIT.xlsx`);
    const review = await outputFile(batch, `Spreadsheet-${batch}-FILLED-v30-REVIEW.xlsx`);

    await expect(findResolvedOutput(service(), batch)).resolves.toBe(review);
  });

  it('retains the existing split-first fallback and logs when review is missing', async () => {
    const batch = 'J26-1081';
    await outputFile(batch, `Spreadsheet-${batch}-FILLED-v30.xlsx`);
    const split = await outputFile(batch, `Spreadsheet-${batch}-FILLED-v30-SPLIT.xlsx`);
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(findResolvedOutput(service(), batch)).resolves.toBe(split);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('falling back'));
  });
});
