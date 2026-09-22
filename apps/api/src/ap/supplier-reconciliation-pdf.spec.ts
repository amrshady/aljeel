import { describe, expect, it, vi } from 'vitest';

const { createWorkerMock } = vi.hoisted(() => ({ createWorkerMock: vi.fn() }));

vi.mock('tesseract.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tesseract.js')>();
  createWorkerMock.mockImplementation(actual.createWorker);
  return { ...actual, createWorker: createWorkerMock };
});

import {
  collectTextItemsFromStream,
  extractPdfRows,
  extractPdfSheets,
  mergeOcrIntoDigital,
  OCR_OUTPUT_FORMATS,
  ocrImageToWords,
  ocrWordsFromRecognizeData,
  ocrWordsToTextItems,
  pageNeedsOcr,
  PDF_EXTRACT_LIMITS,
  pdfTextItemsToRows,
  PdfExtractError,
  PdfExtractSession,
  renderScaleForPage,
  rowsLookLikeLedger,
  runWithDeadline,
  splitLedgerTables,
  tablesFromTextItems,
  terminateOcrWorker,
  withOcrLock,
} from './supplier-reconciliation-pdf';

export function buildTextPdf(lines: Array<{ text: string; x: number; y: number }>): Buffer {
  const ops = lines
    .map((line) => {
      const escaped = line.text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      return `BT /F1 10 Tf ${line.x} ${line.y} Td (${escaped}) Tj ET`;
    })
    .join('\n');
  const stream = `${ops}\n`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}endstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];
  let offset = '%PDF-1.4\n'.length;
  const starts = [0];
  for (const object of objects) {
    starts.push(offset);
    offset += Buffer.byteLength(object);
  }
  let xref = `xref\n0 ${starts.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < starts.length; index += 1) {
    xref += `${String(starts[index]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer << /Size ${starts.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    ...objects.map((object) => Buffer.from(object)),
    Buffer.from(xref),
    Buffer.from(trailer),
  ]);
}

function buildImagePdf(jpeg: Buffer, width: number, height: number): Buffer {
  const draw = `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q\n`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
      `${width} ${height}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >> endobj\n`,
    `4 0 obj << /Length ${Buffer.byteLength(draw)} >> stream\n${draw}endstream\nendobj\n`,
  ];
  const imageDict = `5 0 obj << /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >> stream\n`;
  const imageEnd = '\nendstream\nendobj\n';
  let offset = '%PDF-1.4\n'.length;
  const starts = [0];
  const parts = [
    ...objects.map((object) => Buffer.from(object)),
    Buffer.concat([Buffer.from(imageDict), jpeg, Buffer.from(imageEnd)]),
  ];
  for (const part of parts) {
    starts.push(offset);
    offset += part.length;
  }
  let xref = `xref\n0 ${starts.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < starts.length; index += 1) {
    xref += `${String(starts[index]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer << /Size ${starts.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  return Buffer.concat([Buffer.from('%PDF-1.4\n'), ...parts, Buffer.from(xref), Buffer.from(trailer)]);
}

describe('pdfTextItemsToRows', () => {
  it('clusters items on the same y into columns left to right', () => {
    const rows = pdfTextItemsToRows([
      { str: 'Unpaid Amount', x: 200, y: 700, width: 80 },
      { str: 'Invoice Number', x: 40, y: 701, width: 80 },
      { str: '90', x: 200, y: 680, width: 20 },
      { str: 'INV-1', x: 40, y: 680, width: 40 },
    ]);
    expect(rows).toEqual([
      ['Invoice Number', 'Unpaid Amount'],
      ['INV-1', 90],
    ]);
  });

  it('treats OCR word boxes like an Excel table (top row first)', () => {
    const items = ocrWordsToTextItems([
      { text: 'Invoice Number', x0: 40, y0: 20, x1: 120, y1: 32 },
      { text: 'Unpaid Amount', x0: 200, y0: 20, x1: 280, y1: 32 },
      { text: 'INV-1', x0: 40, y0: 50, x1: 80, y1: 62 },
      { text: '90', x0: 200, y0: 50, x1: 220, y1: 62 },
    ]);
    expect(pdfTextItemsToRows(items)).toEqual([
      ['Invoice Number', 'Unpaid Amount'],
      ['INV-1', 90],
    ]);
    expect(rowsLookLikeLedger(pdfTextItemsToRows(items))).toBe(true);
  });

  it('keeps a later column separate when an earlier cell string is very wide', () => {
    const rows = pdfTextItemsToRows([
      { str: 'Invoice Number', x: 40, y: 700, width: 80 },
      { str: 'Invoice Date', x: 150, y: 700, width: 80 },
      { str: 'Unpaid Amount', x: 300, y: 700, width: 80 },
      { str: 'INV-1', x: 40, y: 680, width: 40 },
      { str: 'Sat Apr 25 2026 23:59:51 GMT+0300 (Eastern European Summer Time)', x: 150, y: 680, width: 420 },
      { str: '2472.5', x: 300, y: 680, width: 40 },
    ]);
    expect(rows[0]).toEqual(['Invoice Number', 'Invoice Date', 'Unpaid Amount']);
    expect(rows[1]?.[0]).toBe('INV-1');
    expect(rows[1]?.[2]).toBe(2472.5);
  });

  it('keeps unpaid and invoice amounts in their header columns when earlier cells scatter', () => {
    const rows = pdfTextItemsToRows([
      { str: 'Invoice Number', x: 40, y: 700, width: 80 },
      { str: 'Supplier or Party', x: 150, y: 700, width: 80 },
      { str: 'Unpaid Amount', x: 300, y: 700, width: 80 },
      { str: 'Invoice Amount', x: 420, y: 700, width: 80 },
      { str: 'INV-1', x: 40, y: 680, width: 40 },
      { str: 'شركة دروب', x: 150, y: 680, width: 20 },
      { str: 'النهر', x: 190, y: 680, width: 20 },
      { str: 'HO', x: 250, y: 680, width: 16 },
      { str: '2472.5', x: 300, y: 680, width: 40 },
      { str: '2472.5', x: 420, y: 680, width: 40 },
    ]);
    expect(rows[1]?.[2]).toBe(2472.5);
    expect(rows[1]?.[3]).toBe(2472.5);
  });
});

describe('ocrWordsFromRecognizeData', () => {
  it('does not use Tesseract.js text-only data.words', () => {
    expect(
      ocrWordsFromRecognizeData({
        text: 'INV-1',
        words: [{ text: 'INV-1', bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } }],
        blocks: null,
      } as never),
    ).toEqual([]);
  });

  it('walks blocks.paragraphs.lines.words when recognize() requests blocks', () => {
    expect(OCR_OUTPUT_FORMATS).toEqual({ text: true, blocks: true });
    expect(
      ocrWordsFromRecognizeData({
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    words: [{ text: 'INV-1', bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([{ text: 'INV-1', x0: 1, y0: 2, x1: 3, y1: 4 }]);
  });
});

describe('splitLedgerTables', () => {
  it('splits Aljeel and supplier tables when both headers appear', () => {
    const tables = splitLedgerTables([
      ['Invoice Number', 'Unpaid Amount'],
      ['OPEN-1', 90],
      ['البيان', 'مدين'],
      ['OPEN-1', 90],
      ['MISSING-1', 25],
    ]);
    expect(tables).toHaveLength(2);
    expect(tables[0]?.[0]).toEqual(['Invoice Number', 'Unpaid Amount']);
    expect(tables[1]?.[0]).toEqual(['البيان', 'مدين']);
  });

  it('does not split when the same ledger header repeats', () => {
    const tables = splitLedgerTables([
      ['Invoice Number', 'Unpaid Amount'],
      ['OPEN-1', 90],
      ['Invoice Number', 'Unpaid Amount'],
      ['OPEN-2', 10],
    ]);
    expect(tables).toHaveLength(1);
    expect(tables[0]).toHaveLength(4);
  });
});

describe('tablesFromTextItems', () => {
  it('snaps each ledger to its own header columns on one page', () => {
    const { tables } = tablesFromTextItems([
      { str: 'Invoice Number', x: 40, y: 720, width: 80 },
      { str: 'Unpaid Amount', x: 200, y: 720, width: 80 },
      { str: 'OPEN-1', x: 40, y: 700, width: 40 },
      { str: '90', x: 200, y: 700, width: 20 },
      { str: 'البيان', x: 40, y: 640, width: 40 },
      { str: 'مدين', x: 200, y: 640, width: 30 },
      { str: 'OPEN-1', x: 40, y: 620, width: 40 },
      { str: '90', x: 200, y: 620, width: 20 },
    ]);
    expect(tables).toHaveLength(2);
    expect(tables[0]?.some((row) => row.includes('Invoice Number'))).toBe(true);
    expect(tables[1]?.some((row) => row.includes('البيان'))).toBe(true);
  });
});

describe('renderScaleForPage', () => {
  it('caps a huge page so the bitmap stays within the pixel budget', () => {
    const scale = renderScaleForPage(20_000, 20_000);
    expect(scale).toBeLessThan(2.5);
    expect(Math.ceil(20_000 * scale) * Math.ceil(20_000 * scale)).toBeLessThanOrEqual(4_000_000 + 20_000);
  });
});

describe('withOcrLock', () => {
  it('rejects a third OCR job while two are in flight', async () => {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 40));
    const first = withOcrLock(wait);
    const second = withOcrLock(wait);
    expect(() => withOcrLock(wait)).toThrow(PdfExtractError);
    await Promise.all([first, second]);
  });

  it('releases the lock after worker creation times out and terminates the late worker', async () => {
    vi.useFakeTimers();
    await terminateOcrWorker();
    let resolveLate!: (worker: never) => void;
    const lateWorker = {
      setParameters: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn().mockResolvedValue(undefined),
    };
    const nextWorker = {
      setParameters: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn().mockResolvedValue(undefined),
      recognize: vi.fn().mockResolvedValue({ data: { blocks: [] } }),
    };
    createWorkerMock
      .mockImplementationOnce(() => new Promise((resolve) => (resolveLate = resolve)))
      .mockResolvedValueOnce(nextWorker);

    try {
      const stalled = ocrImageToWords(Buffer.from('stalled'));
      const timedOut = expect(stalled).rejects.toMatchObject({ code: 'PDF_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(PDF_EXTRACT_LIMITS.ocrPageTimeoutMs);
      await timedOut;

      await expect(ocrImageToWords(Buffer.from('next'))).resolves.toEqual([]);
      expect(nextWorker.recognize).toHaveBeenCalledOnce();

      resolveLate(lateWorker as never);
      await vi.waitFor(() => expect(lateWorker.terminate).toHaveBeenCalledOnce());
      expect(lateWorker.setParameters).toHaveBeenCalledOnce();
    } finally {
      await terminateOcrWorker();
      vi.useRealTimers();
    }
  });
});

describe('runWithDeadline', () => {
  it('cancels the pdf.js render task and terminates OCR on timeout', async () => {
    let renderCancelled = false;
    let ocrTerminated = false;
    const session = new PdfExtractSession();
    session.onTerminateOcr = async () => {
      ocrTerminated = true;
    };
    await expect(
      runWithDeadline(
        20,
        async (active) => {
          active.attachRender({
            cancel() {
              renderCancelled = true;
            },
          });
          active.markOcr();
          await new Promise((resolve) => setTimeout(resolve, 400));
          return 'still-running';
        },
        session,
      ),
    ).rejects.toMatchObject({ code: 'PDF_TIMEOUT' });
    expect(renderCancelled).toBe(true);
    expect(ocrTerminated).toBe(true);
    expect(session.aborted).toBe(true);
  });

  it('rejects at the deadline when OCR worker creation never resolves', async () => {
    const session = new PdfExtractSession();
    session.onTerminateOcr = () => new Promise(() => undefined);
    const startedAt = Date.now();

    await expect(
      runWithDeadline(
        20,
        async (active) => {
          active.markOcr();
          await new Promise(() => undefined);
        },
        session,
      ),
    ).rejects.toMatchObject({ code: 'PDF_TIMEOUT' });

    expect(Date.now() - startedAt).toBeLessThan(200);
    expect(session.aborted).toBe(true);
  });
});

describe('collectTextItemsFromStream', () => {
  it('stops reading before the full text layer is materialized', async () => {
    let pulls = 0;
    const stream = new ReadableStream<{ items?: unknown[] }>({
      pull(controller) {
        pulls += 1;
        if (pulls > 50) {
          controller.close();
          return;
        }
        controller.enqueue({
          items: Array.from({ length: 20 }, (_, index) => ({
            str: `n${pulls}-${index}`,
            transform: [1, 0, 0, 1, index, pulls],
            width: 8,
          })),
        });
      },
    });
    const items = await collectTextItemsFromStream(stream, new PdfExtractSession(), 25);
    expect(items).toHaveLength(25);
    expect(pulls).toBeLessThan(8);
  });
});

describe('PdfExtractSession OCR ownership', () => {
  it('does not terminate a Tesseract worker owned by a newer session', async () => {
    const terminated: string[] = [];
    const original = new PdfExtractSession();
    const next = new PdfExtractSession();
    original.onTerminateOcr = async () => {
      terminated.push('original');
    };
    next.onTerminateOcr = async () => {
      terminated.push('next');
    };

    original.takeOcr();
    original.releaseOcr();
    next.takeOcr();

    await original.abort();
    expect(terminated).toEqual([]);
    expect(next.ownsOcr()).toBe(true);

    await next.abort();
    expect(terminated).toEqual(['next']);
    expect(next.ownsOcr()).toBe(false);
  });

  it('still terminates OCR when the timeout happens while this session owns the worker', async () => {
    let terminated = false;
    const session = new PdfExtractSession();
    session.onTerminateOcr = async () => {
      terminated = true;
    };
    session.takeOcr();
    await session.abort();
    expect(terminated).toBe(true);
  });
});

describe('pageNeedsOcr', () => {
  it('OCRs a page with no digital ledger even when another page already parsed', () => {
    expect(pageNeedsOcr([[['scanned image']]], 12, 0)).toBe(true);
    expect(
      pageNeedsOcr(
        [Array.from({ length: 40 }, (_, i) => ['Invoice Number', 'Unpaid Amount', `INV-${i}`, 90])],
        400,
        160,
      ),
    ).toBe(false);
  });

  it('OCRs a same-page image ledger when only one digital table is present and small', () => {
    expect(pageNeedsOcr([[['Invoice Number', 'Unpaid Amount'], ['INV-1', 90]]], 20, 12)).toBe(true);
    expect(
      pageNeedsOcr(
        [
          [
            ['Invoice Number', 'Unpaid Amount'],
            ['INV-1', 90],
          ],
          [
            ['البيان', 'مدين'],
            ['INV-1', 90],
          ],
        ],
        20,
        12,
      ),
    ).toBe(false);
  });

  it('extracts a large digital ledger and a same-page image-only ledger once each', () => {
    const digital = [
      Array.from({ length: 40 }, (_, i) => ['Invoice Number', 'Unpaid Amount', `INV-${i}`, 90]),
    ];
    expect(pageNeedsOcr(digital, 400, 160, true)).toBe(true);

    const merged = mergeOcrIntoDigital(digital, [
      [
        ['Invoice Number', 'Unpaid Amount'],
        ['INV-0', 90],
      ],
      [
        ['البيان', 'مدين'],
        ['INV-0', 90],
      ],
    ]);
    expect(merged).toHaveLength(2);
    expect(
      merged.filter((table) => table.some((row) => row.includes('Invoice Number'))),
    ).toHaveLength(1);
    expect(merged.some((table) => table.some((row) => row.includes('البيان')))).toBe(true);
  });
});

describe('mergeOcrIntoDigital', () => {
  it('keeps the digital ledger and adds only the missing OCR ledger', () => {
    const merged = mergeOcrIntoDigital(
      [[['Invoice Number', 'Unpaid Amount'], ['OPEN-1', 90]]],
      [
        [['Invoice Number', 'Unpaid Amount'], ['OPEN-1', 90]],
        [['البيان', 'مدين'], ['OPEN-1', 90]],
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]?.[0]).toEqual(['البيان', 'مدين']);
  });
});

describe('extractPdfSheets', () => {
  it('renders an image-only PDF and OCRs it with Tesseract word boxes', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(420, 80);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 420, 80);
    context.fillStyle = '#000000';
    context.font = '22px sans-serif';
    context.fillText('Invoice Number    Unpaid Amount', 12, 28);
    context.fillText('INV-1             90', 12, 58);
    const jpeg = canvas.toBuffer('image/jpeg');
    const sheets = await extractPdfSheets(buildImagePdf(jpeg, 420, 80));
    const rows = sheets.flat();
    expect(rows.some((row) => row.some((cell) => /Invoice/i.test(String(cell ?? ''))))).toBe(true);
    expect(rows.some((row) => row.some((cell) => /INV/i.test(String(cell ?? ''))))).toBe(true);
  }, 60_000);
});

describe('extractPdfRows', () => {
  it('reads a text PDF into table rows', async () => {
    const buffer = buildTextPdf([
      { text: 'Invoice Number', x: 40, y: 720 },
      { text: 'Unpaid Amount', x: 200, y: 720 },
      { text: 'INV-1', x: 40, y: 700 },
      { text: '90', x: 200, y: 700 },
    ]);
    const rows = await extractPdfRows(buffer);
    expect(rows.some((row) => row.includes('Invoice Number'))).toBe(true);
    expect(rows.some((row) => row.includes('INV-1'))).toBe(true);
  });
});

describe('ocrImageToWords', () => {
  it('requests Tesseract word boxes from a raster image', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(320, 64);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 320, 64);
    context.fillStyle = '#000000';
    context.font = '28px sans-serif';
    context.fillText('INV-1', 24, 44);
    const words = await ocrImageToWords(canvas.toBuffer('image/png'));
    expect(OCR_OUTPUT_FORMATS.blocks).toBe(true);
    expect(words.length).toBeGreaterThan(0);
    expect(words.some((word) => /INV/i.test(word.text))).toBe(true);
  }, 60_000);
});
