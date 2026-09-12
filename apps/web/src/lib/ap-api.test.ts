import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateSolventumChargeback,
  generateSupplierReconciliation,
  validateSolventumFiles,
} from './ap-api';

function file(name: string, type = '') {
  return new File(['test'], name, { type });
}

describe('generateSolventumChargeback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('surfaces an empty non-success response and does not poll', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetch);

    await expect(generateSolventumChargeback([file('sales.xlsx'), file('pod.pdf')])).rejects.toThrow(
      'Could not start chargeback generation. (HTTP 400)',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces the server JSON error message', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'SOLVENTUM_FILES_INVALID',
          message: 'Upload exactly one Excel workbook and at least one POD PDF.',
        },
        { status: 400 },
      ),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      generateSolventumChargeback([file('sales.xlsx'), file('pod.pdf')]),
    ).rejects.toThrow('Upload exactly one Excel workbook and at least one POD PDF.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not poll when a successful response has no job ID', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 202, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(generateSolventumChargeback([file('sales.xlsx'), file('pod.pdf')])).rejects.toThrow(
      'The server did not return a chargeback job ID.',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('names extra workbooks and unsupported files before upload', () => {
    expect(
      validateSolventumFiles([file('sales.xlsx'), file('JULY Sales _prepared.xlsx'), file('pod.pdf')]),
    ).toBe('Remove extra workbook: JULY Sales _prepared.xlsx');
    expect(validateSolventumFiles([file('sales.xlsx'), file('pod.pdf'), file('notes.txt')])).toBe(
      'Unsupported files: notes.txt',
    );
  });

  it('does not fetch an invalid selection', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(generateSolventumChargeback([file('sales.xlsx')])).rejects.toThrow(
      'Add at least one POD PDF.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('generateSupplierReconciliation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('surfaces supplier reconciliation API errors', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Could not find an Aljeel Oracle export' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(generateSupplierReconciliation([])).rejects.toThrow(
      'Could not find an Aljeel Oracle export',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
