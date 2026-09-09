import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSolventumChargeback } from './ap-api';

describe('generateSolventumChargeback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('surfaces an empty non-success response and does not poll', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetch);

    await expect(generateSolventumChargeback([])).rejects.toThrow(
      'Could not start chargeback generation. (HTTP 400)',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not poll when a successful response has no job ID', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('{}', { status: 202, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(generateSolventumChargeback([])).rejects.toThrow(
      'The server did not return a chargeback job ID.',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
