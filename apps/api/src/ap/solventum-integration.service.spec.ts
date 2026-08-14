import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  SOLVENTUM_OUTPUT_COLUMNS,
  SolventumIntegrationService,
} from './solventum-integration.service';

describe('SolventumIntegrationService', () => {
  it('filters sales lines by POD filename TRX and preserves exact output columns', () => {
    const row = (trx: number, manufacturer: string, itemDescription: string) =>
      Object.fromEntries(
        SOLVENTUM_OUTPUT_COLUMNS.map((column) => [
          column,
          column === 'TRX #'
            ? trx
            : column === 'Manufacturer'
              ? manufacturer
              : column === 'Item Description'
                ? itemDescription
                : '',
        ]),
      );
    const source = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      source,
      XLSX.utils.json_to_sheet([
        row(2600014513, '3MOC-DLR-6', 'first line for shared TRX'),
        row(2600014513, '3MOR-ABC-1', 'second line for shared TRX'),
        row(2600014514, '3MOC-DEF-2', 'first valid TRX in second filename'),
        row(2600014515, 'UNCHANGED', 'second valid TRX in second filename'),
        row(26125380, '3MOC-DROPPED-1', 'short non-matching TRX'),
        row(2600099999, '3MOR-DROPPED-2', 'valid-shaped TRX without a POD'),
      ]),
      'Sheet2',
    );

    const generated = XLSX.read(
      new SolventumIntegrationService().generateChargeback(
        XLSX.write(source, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
        ['2600014513, 26125380 checked.pdf', '2600014514, 2600014515 POD.pdf'],
      ),
      { type: 'buffer' },
    );
    const sheet = generated.Sheets.Sheet1!;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    expect(matrix[0]).toEqual(Array.from(SOLVENTUM_OUTPUT_COLUMNS));
    expect(rows).toHaveLength(4);
    expect(rows.map((outputRow) => outputRow['TRX #'])).toEqual([
      2600014513, 2600014513, 2600014514, 2600014515,
    ]);
    expect(rows.map((outputRow) => outputRow.Manufacturer)).toEqual([
      'DLR-6',
      'ABC-1',
      'DEF-2',
      'UNCHANGED',
    ]);
    expect(rows.map((outputRow) => outputRow['Item Description'])).not.toContain(
      'short non-matching TRX',
    );
    expect(rows.map((outputRow) => outputRow['Item Description'])).not.toContain(
      'valid-shaped TRX without a POD',
    );
  });

  it('also strips the 3MOR manufacturer prefix', () => {
    const source = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      source,
      XLSX.utils.json_to_sheet([
        Object.fromEntries(
          SOLVENTUM_OUTPUT_COLUMNS.map((column) => [
            column,
            column === 'TRX #' ? 2600000001 : column === 'Manufacturer' ? '3MOR-ABC-1' : '',
          ]),
        ),
      ]),
      'Sheet2',
    );
    const output = XLSX.read(
      new SolventumIntegrationService().generateChargeback(
        XLSX.write(source, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
        ['2600000001 POD.pdf'],
      ),
      { type: 'buffer' },
    );
    const [row] = XLSX.utils.sheet_to_json<Record<string, unknown>>(output.Sheets.Sheet1!);
    expect(row?.Manufacturer).toBe('ABC-1');
  });
});
