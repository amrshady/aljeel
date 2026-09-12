import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { SupplierReconciliationService } from './supplier-reconciliation.service';

const fixturePath = join(__dirname, 'fixtures/36380-payment-details.xlsx');

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

    const parsed = service.parseInputs([
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

  it('rejects a workbook with too many rows using a controlled error code', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([['Invoice Number', 'Unpaid Amount']]);
    sheet['!ref'] = 'A1:B100001';
    XLSX.utils.book_append_sheet(workbook, sheet, 'Oversized');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    expect(() =>
      service.parseInputs([{ originalname: 'oversized.xlsx', buffer }]),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'SUPPLIER_RECON_WORKBOOK_TOO_LARGE' }),
      }),
    );
  });
});
