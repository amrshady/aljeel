import * as XLSX from 'xlsx';
import { describe, expect, it, vi } from 'vitest';
import {
  SOLVENTUM_OUTPUT_COLUMNS,
  SOLVENTUM_SOURCE_COLUMNS,
  SolventumIntegrationService,
} from './solventum-integration.service';
import type { SolventumPodExtractor, SolventumPodLine } from './solventum-pod.types';

const salesRow = (overrides: Record<string, unknown>) =>
  Object.fromEntries(SOLVENTUM_SOURCE_COLUMNS.map((column) => [column, overrides[column] ?? '']));

const workbook = (rows: Record<string, unknown>[]) => {
  const source = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(source, XLSX.utils.json_to_sheet(rows), 'Sheet2');
  return XLSX.write(source, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

const podLine = (overrides: Partial<SolventumPodLine> = {}): SolventumPodLine => ({
  trx: '2600015424',
  itemDescription: '1954 SOF-LEX FINISHING STRIPS',
  manufacturer: '3MOC-1954',
  lot: '11166524',
  quantity: 50,
  uom: 'Box-100',
  sourceDoc: 'receipt page 1',
  confidence: 0.99,
  ...overrides,
});

const run = async (sales: Record<string, unknown>[], pods: SolventumPodLine[]) => {
  const extractor = {
    extract: vi.fn().mockResolvedValue(pods),
  } as unknown as SolventumPodExtractor;
  const buffer = await new SolventumIntegrationService(extractor).generateChargeback(
    workbook(sales),
    [{ originalname: 'pod.pdf', buffer: Buffer.from('pdf') }],
  );
  const output = XLSX.read(buffer, { type: 'buffer' });
  return {
    matrix: XLSX.utils.sheet_to_json<unknown[]>(output.Sheets.Sheet1!, { header: 1 }),
    rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(output.Sheets.Sheet1!, { defval: '' }),
  };
};

describe('SolventumIntegrationService', () => {
  it('projects the existing columns, adds status, and strips manufacturer prefixes', async () => {
    const sales = salesRow({
      'TRX #': 2600015424,
      'TRX Date': '2026-06-01',
      'Item Description': podLine().itemDescription,
      Manufacturer: '3MOC-OLD',
      'Lot Number': '11166524',
      Quantity: 50,
      UOM: 'Box-100',
    });
    const { matrix, rows } = await run([sales], [podLine({ manufacturer: '3MOR-1954' })]);
    expect(matrix[0]).toEqual(Array.from(SOLVENTUM_OUTPUT_COLUMNS));
    expect(rows[0]).toMatchObject({
      Manufacturer: '1954',
      'TRX Date': '2026-06-01',
      'Reconciliation Status': 'MATCHED',
    });
  });

  it('marks an exact line and quantity as MATCHED after normalization', async () => {
    const sales = salesRow({
      'TRX #': 2600015424,
      'Item Description': '\u200e1954  SOF-LEX FINISHING STRIPS',
      'Lot Number': '11166524',
      Quantity: 50,
      UOM: ' box-100 ',
    });
    const { rows } = await run([sales], [podLine()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['Reconciliation Status']).toBe('MATCHED');
  });

  it('uses the POD quantity and marks the anchored 49.5 to 50 case MISMATCH', async () => {
    const sales = salesRow({
      'TRX #': 2600015424,
      'Item Description': podLine().itemDescription,
      'Lot Number': '11166524',
      Quantity: 49.5,
      UOM: 'Box-100',
    });
    const { rows } = await run([sales], [podLine({ quantity: 50 })]);
    expect(rows[0]?.Quantity).toBe(50);
    expect(rows[0]?.['Reconciliation Status']).toBe('MISMATCH');
  });

  it('marks a POD line absent from sales as POD_ONLY and drops sales-only lines', async () => {
    const unrelated = salesRow({
      'TRX #': 2600015424,
      'Item Description': 'sales only',
      'Lot Number': 'x',
      Quantity: 3,
      UOM: 'Each',
    });
    const { rows } = await run(
      [unrelated],
      [podLine({ itemDescription: 'POD only item', lot: 'P1', quantity: 2 })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      'Item Description': 'POD only item',
      'Lot Number': 'P1',
      Quantity: 2,
      'Reconciliation Status': 'POD_ONLY',
    });
  });

  it('uses the POD lot and flags a lot divergence as MISMATCH', async () => {
    const sales = salesRow({
      'TRX #': 2600015424,
      'Item Description': podLine().itemDescription,
      'Lot Number': 'OLD-LOT',
      Quantity: 50,
      UOM: 'Box-100',
    });
    const { rows } = await run([sales], [podLine({ lot: 'POD-LOT' })]);
    expect(rows[0]).toMatchObject({ 'Lot Number': 'POD-LOT', 'Reconciliation Status': 'MISMATCH' });
  });
});
