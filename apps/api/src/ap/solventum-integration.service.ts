import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  SolventumPodExtractor,
  type SolventumPodFile,
  type SolventumPodLine,
} from './solventum-pod.types';

export const SOLVENTUM_OUTPUT_FILE_NAME = 'Chargeback report supported by PODs attached.xlsx';
export const SOLVENTUM_SOURCE_COLUMNS = [
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
export const SOLVENTUM_OUTPUT_COLUMNS = [
  ...SOLVENTUM_SOURCE_COLUMNS,
  'Reconciliation Status',
] as const;
type Status = 'MATCHED' | 'MISMATCH' | 'POD_ONLY';
type SalesRow = Record<string, unknown>;

const MARKS = /[\u202d\u202c\u200e\u200f]/g;
const clean = (value: unknown) =>
  String(value ?? '')
    .replace(MARKS, '')
    .trim()
    .replace(/\s+/g, ' ');
const normalizeText = (value: unknown) => clean(value).toLocaleLowerCase('en');
const normalizeTrx = (value: unknown) => {
  const normalized = clean(value);
  return /^\d+(?:\.0+)?$/.test(normalized) ? String(Math.trunc(Number(normalized))) : normalized;
};
const normalizeManufacturer = (value: unknown) => clean(value).replace(/^3MO[CR]-/i, '');
const sameQuantity = (left: unknown, right: unknown) => {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
};

@Injectable()
export class SolventumIntegrationService {
  constructor(@Inject(SolventumPodExtractor) private readonly extractor: SolventumPodExtractor) {}

  async generateChargeback(workbookBuffer: Buffer, podFiles: SolventumPodFile[]): Promise<Buffer> {
    const podLines = (
      await Promise.all(podFiles.map((file) => this.extractor.extract(file)))
    ).flat();
    if (podLines.length === 0) {
      throw new BadRequestException({
        code: 'SOLVENTUM_POD_LINES_REQUIRED',
        message: 'The uploaded PODs did not contain any delivered line items.',
      });
    }
    const rows = this.readSalesRows(workbookBuffer);
    const reconciled = this.reconcile(rows, podLines);
    const output = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      output,
      XLSX.utils.json_to_sheet(reconciled, {
        header: Array.from(SOLVENTUM_OUTPUT_COLUMNS),
      }),
      'Sheet1',
    );
    return XLSX.write(output, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private readSalesRows(workbookBuffer: Buffer): SalesRow[] {
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
    if (!sheet)
      throw new BadRequestException({
        code: 'SOLVENTUM_SHEET_REQUIRED',
        message: 'The Excel workbook must contain a Sheet2 worksheet.',
      });
    const headers = new Set(
      (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })[0] ?? []).map(clean),
    );
    const missing = SOLVENTUM_SOURCE_COLUMNS.filter((column) => !headers.has(column));
    if (missing.length)
      throw new BadRequestException({
        code: 'SOLVENTUM_COLUMNS_REQUIRED',
        message: `Sheet2 is missing required columns: ${missing.join(', ')}`,
      });
    return XLSX.utils.sheet_to_json<SalesRow>(sheet, { defval: '', raw: true });
  }

  private reconcile(salesRows: SalesRow[], podLines: SolventumPodLine[]): SalesRow[] {
    const used = new Set<number>();
    return podLines.map((pod) => {
      const candidates = salesRows
        .map((row, index) => ({ row, index }))
        .filter(
          ({ row, index }) =>
            !used.has(index) &&
            normalizeTrx(row['TRX #']) === normalizeTrx(pod.trx) &&
            normalizeText(row['Item Description']) === normalizeText(pod.itemDescription) &&
            normalizeText(row.UOM) === normalizeText(pod.uom),
        );
      const exact = candidates.find(
        ({ row }) => normalizeText(row['Lot Number']) === normalizeText(pod.lot),
      );
      const match = exact ?? candidates[0];
      if (!match) return this.podOnlyRow(pod);
      used.add(match.index);
      const status: Status =
        exact && sameQuantity(match.row.Quantity, pod.quantity) ? 'MATCHED' : 'MISMATCH';
      return this.project(match.row, pod, status);
    });
  }

  private project(sales: SalesRow, pod: SolventumPodLine, status: Status): SalesRow {
    const result = Object.fromEntries(
      SOLVENTUM_SOURCE_COLUMNS.map((column) => [column, sales[column]]),
    );
    result['TRX #'] = normalizeTrx(pod.trx);
    result['Item Description'] = pod.itemDescription;
    result.Manufacturer = normalizeManufacturer(pod.manufacturer || sales.Manufacturer);
    result['Lot Number'] = pod.lot;
    result.Quantity = pod.quantity;
    result.UOM = pod.uom;
    result['Reconciliation Status'] = status;
    return result;
  }

  private podOnlyRow(pod: SolventumPodLine): SalesRow {
    const empty = Object.fromEntries(SOLVENTUM_SOURCE_COLUMNS.map((column) => [column, '']));
    return this.project(empty, pod, 'POD_ONLY');
  }
}
