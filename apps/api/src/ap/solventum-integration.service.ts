import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

export const SOLVENTUM_OUTPUT_FILE_NAME = 'Chargeback report supported by PODs attached.xlsx';
export const SOLVENTUM_OUTPUT_COLUMNS = [
  'TRX #',
  'TRX Date',
  'Order Type',
  'Account Name',
  'Ship Address',
  'Item Description',
  'Manufacturer',
  'Agency',
  'Lot Number',
  'Quantity',
  'UOM',
] as const;

function normalizeTrx(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return String(value ?? '').trim();
}

export function extractPodTrxNumbers(fileNames: string[]): Set<string> {
  const result = new Set<string>();
  for (const fileName of fileNames) {
    for (const match of fileName.matchAll(/(?<!\d)(2600\d{6})(?!\d)/g)) {
      if (match[1]) result.add(match[1]);
    }
  }
  return result;
}

@Injectable()
export class SolventumIntegrationService {
  generateChargeback(workbookBuffer: Buffer, podFileNames: string[]): Buffer {
    const podTrxNumbers = extractPodTrxNumbers(podFileNames);
    if (podTrxNumbers.size === 0) {
      throw new BadRequestException({
        code: 'SOLVENTUM_POD_TRX_REQUIRED',
        message: 'POD filenames must contain at least one 10-digit 2600 transaction number.',
      });
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(workbookBuffer, { type: 'buffer', cellDates: true });
    } catch {
      throw new BadRequestException({
        code: 'SOLVENTUM_WORKBOOK_INVALID',
        message: 'The uploaded Excel workbook could not be read.',
      });
    }
    const sheet = workbook.Sheets.Sheet2;
    if (!sheet) {
      throw new BadRequestException({
        code: 'SOLVENTUM_SHEET_REQUIRED',
        message: 'The Excel workbook must contain a Sheet2 worksheet.',
      });
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });
    const headers = new Set(
      (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0 })[0] ?? []).map((value) =>
        String(value).trim(),
      ),
    );
    const missing = SOLVENTUM_OUTPUT_COLUMNS.filter((column) => !headers.has(column));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'SOLVENTUM_COLUMNS_REQUIRED',
        message: `Sheet2 is missing required columns: ${missing.join(', ')}`,
      });
    }

    const outputRows = rows
      .filter((row) => podTrxNumbers.has(normalizeTrx(row['TRX #'])))
      .map((row) =>
        SOLVENTUM_OUTPUT_COLUMNS.map((column) => {
          const value = row[column];
          return column === 'Manufacturer' ? String(value ?? '').replace(/^3MO[CR]-/, '') : value;
        }),
      );
    const output = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      output,
      XLSX.utils.aoa_to_sheet([Array.from(SOLVENTUM_OUTPUT_COLUMNS), ...outputRows]),
      'Sheet1',
    );
    return XLSX.write(output, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
