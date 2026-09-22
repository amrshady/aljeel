import { describe, expect, it } from 'vitest';
import { extractPdfRows, ocrWordsToTextItems, pdfTextItemsToRows, rowsLookLikeLedger } from './supplier-reconciliation-pdf';

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
