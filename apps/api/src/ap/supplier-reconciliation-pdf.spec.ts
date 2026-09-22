import { describe, expect, it } from 'vitest';
import {
  collectTextItemsFromStream,
  extractPdfRows,
  OCR_OUTPUT_FORMATS,
  ocrImageToWords,
  ocrWordsFromRecognizeData,
  ocrWordsToTextItems,
  pageNeedsOcr,
  pdfTextItemsToRows,
  PdfExtractError,
  PdfExtractSession,
  renderScaleForPage,
  rowsLookLikeLedger,
  runWithDeadline,
  splitLedgerTables,
  tablesFromTextItems,
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

describe('pageNeedsOcr', () => {
  it('OCRs a page with no digital ledger even when another page already parsed', () => {
    expect(pageNeedsOcr([[['scanned image']]], 12)).toBe(true);
    expect(pageNeedsOcr([[['Invoice Number', 'Unpaid Amount'], ['INV-1', 90]]], 40)).toBe(false);
  });
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
