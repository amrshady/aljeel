import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { SupplierReconciliationService } from './supplier-reconciliation.service';

const fixturePath = join(__dirname, 'fixtures/36380-payment-details.xlsx');

function buildTextPdf(lines: Array<{ text: string; x: number; y: number }>): Buffer {
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

function pdfEncode(text: string): string {
  if (/^[\x20-\x7E]*$/.test(text)) {
    return `(${text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
  }
  let hex = 'FEFF';
  for (const char of text) {
    hex += char.charCodeAt(0).toString(16).padStart(4, '0');
  }
  return `<${hex}>`;
}

function cellPdfText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value ?? '').trim();
}

function sheetRowsToPdf(rows: unknown[][]): Buffer {
  const ops: string[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const y = 770 - rowIndex * 12;
    if (y < 30) break;
    (rows[rowIndex] ?? []).forEach((cell, colIndex) => {
      const text = cellPdfText(cell);
      if (!text) return;
      ops.push(`BT /F1 8 Tf ${16 + colIndex * 150} ${y} Td ${pdfEncode(text)} Tj ET`);
    });
  }
  const stream = `${ops.join('\n')}\n`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 2000 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
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

function sheetRows(buffer: Buffer, name: string): unknown[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name]!, {
    header: 1,
    defval: null,
    raw: true,
  });
}

describe('SupplierReconciliationService', () => {
  const service = new SupplierReconciliationService();

  it('reconciles Labadi’s 36,380 payment-details workbook', async () => {
    const { output, fileName } = await service.reconcileWorkbooks([
      { originalname: '36,380 Payment details.xlsx', buffer: readFileSync(fixturePath) },
    ]);

    expect(fileName).toBe('36,380 Payment details.xlsx');

    const parsed = await service.parseInputs([
      { originalname: 'labadi.xlsx', buffer: readFileSync(fixturePath) },
    ]);
    expect(parsed.aljeel).toHaveLength(28);
    expect(parsed.supplier).toHaveLength(40);

    const match = sheetRows(output, 'Match');
    const payment = sheetRows(output, 'Payment details');
    const recon = sheetRows(output, 'Reconciliation');

    const statuses = match.slice(1).map((row) => row[5]);
    expect(statuses.filter((status) => status === 'Found')).toHaveLength(28);
    expect(statuses.filter((status) => status === 'Not found')).toHaveLength(12);

    const netRow = payment.find((row) => row[1] === 'Net To Pay');
    expect(netRow?.[2]).toBe(36380.25);

    const books = recon.find((row) => row[5] === 'BALANCE PER BOOKS');
    const supplierBooks = recon.find((row) => row[5] === 'BALANCE PER SUPPLIERS BOOKS');
    const adjusted = recon.find((row) => row[1] === 'Books Adjusted Balance');
    const difference = recon.find((row) => row[1] === 'Differences In Begning Balance');
    expect(books?.[6]).toBe(36380.25);
    expect(supplierBooks?.[6]).toBe(61368.6);
    expect(adjusted?.[5]).toBe(61368.6);
    expect(difference?.[5]).toBe(0);
    expect(recon.some((row) => row[4] === 'SL/1/202604/000045')).toBe(true);
    expect(recon.some((row) => row[4] === 'SL/1/202606/000260')).toBe(true);

    const styled = new ExcelJS.Workbook();
    await styled.xlsx.load(output as unknown as ArrayBuffer);
    const paymentSheet = styled.getWorksheet('Payment details');
    const reconSheet = styled.getWorksheet('Reconciliation');
    expect(paymentSheet?.getCell('B4').value).toBe('Payment details sheet');
    expect(paymentSheet?.getCell('B4').fill).toMatchObject({ type: 'pattern', pattern: 'solid' });
    expect(paymentSheet?.getCell('B4').font?.name).toBe('Century Gothic');
    expect(reconSheet?.getCell('B10').value).toBe('Add');
    expect(reconSheet?.getCell('B10').fill).toMatchObject({ type: 'pattern', pattern: 'solid' });
  });

  it('labels Aljeel-paid supplier lines as already paid and deducts them on recon', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Invoice Number', 'Unpaid Amount', 'Invoice Amount', 'Supplier or Party'],
        ['OPEN-1', 90, 90, 'Acme'],
        ['PAID-1', 0, 80, 'Acme'],
      ]),
      'Export to Excel',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['البيان', 'مدين'],
        ['OPEN-1', 90],
        ['PAID-1', 80],
      ]),
      'Sheet1',
    );
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const { output } = await service.reconcileWorkbooks([{ originalname: 'paid.xlsx', buffer }]);

    const match = sheetRows(output, 'Match');
    const statuses = match.slice(1).map((row) => row[5]);
    expect(statuses).toContain('Found');
    expect(statuses).toContain('Already paid');

    const recon = sheetRows(output, 'Reconciliation');
    expect(recon.some((row) => String(row[1] ?? '').includes('Already paid by Aljeel'))).toBe(true);
    expect(recon.some((row) => row[4] === 'PAID-1')).toBe(true);
  });

  it('rejects a workbook that only has the Aljeel export', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Invoice Number', 'Unpaid Amount', 'Invoice Amount', 'Prepayment Available Amount'],
        ['SL/1/202604/000120', 100, 100, 0],
      ]),
      'Export',
    );
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    await expect(
      service.reconcileWorkbooks([{ originalname: 'aljeel.xlsx', buffer }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a workbook with too many rows using a controlled error code', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['Invoice Number', 'Unpaid Amount']]);
    sheet['!ref'] = 'A1:B100001';
    XLSX.utils.book_append_sheet(workbook, sheet, 'Oversized');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    await expect(
      service.parseInputs([{ originalname: 'oversized.xlsx', buffer }]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SUPPLIER_RECON_WORKBOOK_TOO_LARGE' }),
    });
  });

  it('reconciles an Aljeel PDF with an Excel supplier statement', async () => {
    const pdf = buildTextPdf([
      { text: 'Invoice Number', x: 40, y: 720 },
      { text: 'Unpaid Amount', x: 220, y: 720 },
      { text: 'Invoice Amount', x: 360, y: 720 },
      { text: 'OPEN-1', x: 40, y: 700 },
      { text: '90', x: 220, y: 700 },
      { text: '90', x: 360, y: 700 },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['البيان', 'مدين'],
        ['OPEN-1', 90],
        ['MISSING-1', 25],
      ]),
      'Sheet1',
    );
    const supplier = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const parsed = await service.parseInputs([
      { originalname: 'export.pdf', buffer: pdf },
      { originalname: 'statement.xlsx', buffer: supplier },
    ]);
    expect(parsed.aljeel).toEqual([
      expect.objectContaining({ invoiceNumber: 'OPEN-1', unpaidAmount: 90 }),
    ]);
    expect(parsed.supplier.map((row) => row.invoiceNumber)).toEqual(['OPEN-1', 'MISSING-1']);
  });

  it('matches the 36,380 fixture when the Aljeel export is a PDF table', async () => {
    const fixture = readFileSync(fixturePath);
    const workbook = XLSX.read(fixture, { type: 'buffer', cellDates: true });
    let aljeelRows: unknown[][] | null = null;
    let supplierRows: unknown[][] | null = null;
    for (const name of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name]!, {
        header: 1,
        defval: null,
        raw: true,
      });
      const labels = rows
        .slice(0, 8)
        .flat()
        .map((cell) => String(cell ?? '').toLowerCase());
      if (labels.includes('invoice number')) aljeelRows = rows;
      if (rows.slice(0, 15).flat().some((cell) => String(cell ?? '').includes('البيان'))) {
        supplierRows = rows;
      }
    }
    expect(aljeelRows).toBeTruthy();
    expect(supplierRows).toBeTruthy();

    const supplierBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(supplierBook, XLSX.utils.aoa_to_sheet(supplierRows!), 'Sheet1');
    const parsed = await service.parseInputs([
      { originalname: 'export.pdf', buffer: sheetRowsToPdf(aljeelRows!) },
      {
        originalname: 'statement.xlsx',
        buffer: XLSX.write(supplierBook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      },
    ]);
    expect(parsed.aljeel).toHaveLength(28);
    expect(parsed.supplier).toHaveLength(40);
    const unpaid = parsed.aljeel.reduce((sum, line) => sum + line.unpaidAmount, 0);
    expect(Math.round(unpaid * 100) / 100).toBe(36380.25);

    const { output, fileName } = await service.reconcileWorkbooks([
      { originalname: 'export.pdf', buffer: sheetRowsToPdf(aljeelRows!) },
      {
        originalname: 'statement.xlsx',
        buffer: XLSX.write(supplierBook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      },
    ]);
    expect(fileName).toBe('36,380 Payment details.xlsx');
    const match = sheetRows(output, 'Match');
    const payment = sheetRows(output, 'Payment details');
    const recon = sheetRows(output, 'Reconciliation');
    const statuses = match.slice(1).map((row) => row[5]);
    expect(statuses.filter((status) => status === 'Found')).toHaveLength(28);
    expect(statuses.filter((status) => status === 'Not found')).toHaveLength(12);
    expect(payment.find((row) => row[1] === 'Net To Pay')?.[2]).toBe(36380.25);
    expect(recon.find((row) => row[5] === 'BALANCE PER BOOKS')?.[6]).toBe(36380.25);
  });

  it('surfaces a distinct error when a PDF cannot be opened', async () => {
    await expect(
      service.parseInputs([{ originalname: 'broken.pdf', buffer: Buffer.from('not-a-pdf') }]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SUPPLIER_RECON_UNREADABLE_PDF' }),
    });
  });
});
