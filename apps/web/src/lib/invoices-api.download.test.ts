import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './api-client';
import { downloadInvoiceDocument } from './invoices-api';

vi.mock('./api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api-client')>();
  return {
    ...actual,
    downloadFile: vi.fn(),
    triggerBrowserDownload: vi.fn(),
  };
});

import { downloadFile, triggerBrowserDownload } from './api-client';

describe('downloadInvoiceDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('falls back to the content proxy when credentialed fetch cannot follow a Spaces redirect', async () => {
    vi.mocked(downloadFile).mockRejectedValue(
      new ApiClientError('NETWORK_ERROR', 'Could not reach the server.', 'unknown'),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'content-type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'content-disposition': 'inline; filename="invoice.xlsx"',
          },
        }),
      ),
    );

    await downloadInvoiceDocument('doc-1', 'folder/invoice.xlsx');

    expect(triggerBrowserDownload).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(triggerBrowserDownload).mock.calls[0]!;
    expect(name).toBe('invoice.xlsx');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('does not proxy-fallback on application errors', async () => {
    vi.mocked(downloadFile).mockRejectedValue(
      new ApiClientError('DOWNLOAD_FAILED', 'Download failed with status 404', 'unknown'),
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(downloadInvoiceDocument('doc-1', 'invoice.xlsx')).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
