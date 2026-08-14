import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  SOLVENTUM_OUTPUT_COLUMNS,
  SolventumIntegrationService,
} from './solventum-integration.service';

const FIXTURES = '/home/clawdbot/.openclaw/workspace/aljeel/batches/solventum';

describe('SolventumIntegrationService', () => {
  it('generates the 52 wave-1 lines with exact columns and stripped manufacturers', async () => {
    const source = await readFile(resolve(FIXTURES, 'JUNE_SALES_2026.xlsx'));
    const sample = XLSX.read(await readFile(resolve(FIXTURES, 'chargeback_1st_wave_SAMPLE.xlsx')), {
      type: 'buffer',
    });
    const sampleRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      sample.Sheets[sample.SheetNames[0]!]!,
    );
    const podNames = [...new Set(sampleRows.map((row) => String(row['TRX #'])))].map(
      (trx) => `${trx} POD.pdf`,
    );

    const generated = XLSX.read(
      new SolventumIntegrationService().generateChargeback(source, podNames),
      { type: 'buffer' },
    );
    const sheet = generated.Sheets.Sheet1!;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    expect(matrix[0]).toEqual(Array.from(SOLVENTUM_OUTPUT_COLUMNS));
    expect(rows).toHaveLength(52);
    expect(rows[0]?.Manufacturer).toBe('DLR-6');
    expect(rows.every((row) => !/^3MO[CR]-/.test(String(row.Manufacturer)))).toBe(true);
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
