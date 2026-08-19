import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  SOLVENTUM_OUTPUT_COLUMNS,
  SolventumIntegrationService,
} from './solventum-integration.service';
import {
  SolventumPodExtractor,
  type SolventumPodFile,
  type SolventumPodLine,
} from './solventum-pod.types';

const salesRow = (overrides: Record<string, unknown>) => ({
  'TRX #': '',
  'TRX Date': '2026-06-01',
  'Order Type': 'Market Place',
  'Account Name': 'Account',
  'Ship Address': 'Riyadh',
  'Item Description': 'Item',
  Manufacturer: '3MOC-1954',
  Agency: 'Solventum',
  'Lot Number': 'LOT-1',
  Quantity: 1,
  UOM: 'Each',
  ...overrides,
});

const workbook = (rows: Record<string, unknown>[]) => {
  const source = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(source, XLSX.utils.json_to_sheet(rows), 'Sheet2');
  return XLSX.write(source, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

class StubExtractor extends SolventumPodExtractor {
  constructor(private readonly linesByName: Record<string, SolventumPodLine[]> = {}) {
    super();
  }

  async extract(file: SolventumPodFile): Promise<SolventumPodLine[]> {
    return this.linesByName[file.originalname] ?? [];
  }
}

const run = async (
  sales: Record<string, unknown>[],
  podNames: string[],
  linesByName: Record<string, SolventumPodLine[]> = {},
) => {
  const service = new SolventumIntegrationService(new StubExtractor(linesByName));
  const buffer = await service.generateChargeback(
    workbook(sales),
    podNames.map((originalname) => ({ originalname, buffer: Buffer.from('pdf') })),
  );
  const output = XLSX.read(buffer, { type: 'buffer' });
  return {
    matrix: XLSX.utils.sheet_to_json<unknown[]>(output.Sheets.Sheet1!, { header: 1 }),
    rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(output.Sheets.Sheet1!, { defval: '' }),
  };
};

describe('SolventumIntegrationService', () => {
  it('omits Item Description from output columns', async () => {
    const { matrix } = await run(
      [salesRow({ 'TRX #': 2600014236 })],
      ['2600014236 POD checked.pdf'],
    );
    expect(matrix[0]).toEqual(Array.from(SOLVENTUM_OUTPUT_COLUMNS));
    expect(matrix[0]).not.toContain('Item Description');
  });

  it('LOCKED RULE: for each POD filename TRX, includes every matching sales row', async () => {
    const sales = [
      salesRow({ 'TRX #': 2600014236, Manufacturer: '3MOC-1954', Quantity: 10 }),
      salesRow({ 'TRX #': 2600014236, Manufacturer: '3MOC-1470A2', Quantity: 5 }),
      salesRow({ 'TRX #': 2600019999, Manufacturer: '3MOC-9999', Quantity: 99 }),
    ];
    const { rows } = await run(sales, ['2600014236 POD checked.pdf']);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => String(row['TRX #']) === '2600014236')).toBe(true);
    expect(rows.map((row) => Number(row.Quantity)).sort((a, b) => a - b)).toEqual([5, 10]);
  });

  it('overrides Quantity from POD scan when catalog matches', async () => {
    const podName = '2600014236 POD checked.pdf';
    const { rows } = await run(
      [
        salesRow({ 'TRX #': 2600014236, Manufacturer: '3MOC-1954', Quantity: 10, UOM: 'Each' }),
        salesRow({ 'TRX #': 2600014236, Manufacturer: '3MOC-1470A2', Quantity: 5 }),
      ],
      [podName],
      {
        [podName]: [
          {
            trx: '2600014236',
            manufacturer: '1954',
            itemDescription: 'SOF-LEX',
            lot: 'LOT-1',
            quantity: 9, // near sales 10 — allowed on multi-line TRX
            uom: 'Box-1',
            sourceDoc: podName,
            confidence: 0.9,
          },
        ],
      },
    );
    const overridden = rows.find((row) => String(row.Manufacturer) === '1954');
    const untouched = rows.find((row) => String(row.Manufacturer) === '1470A2');
    expect(overridden?.Quantity).toBe(9);
    expect(overridden?.UOM).toBe('Box-1');
    expect(untouched?.Quantity).toBe(5);
  });

  it('does not apply inferred POD qty to multi-line TRXs (keeps sales)', async () => {
    const podName = '2600015424 checked.pdf';
    const { rows } = await run(
      [
        salesRow({
          'TRX #': 2600015424,
          Manufacturer: '3MOC-1470A3',
          Quantity: 100,
          UOM: 'Bag-1',
          'Lot Number': '13652194',
        }),
        salesRow({
          'TRX #': 2600015424,
          Manufacturer: '3MOC-1470A2',
          Quantity: 13,
          UOM: 'Bag-1',
          'Lot Number': '11060669',
        }),
      ],
      [podName],
      {
        [podName]: [
          {
            trx: '2600015424',
            manufacturer: '1470A3',
            itemDescription: 'Composite shade inferred qty 55 from amount 3025',
            lot: '',
            quantity: 55,
            uom: 'Each',
            sourceDoc: `${podName}#receiving#inferred`,
            confidence: 0.95,
          },
          {
            trx: '2600015424',
            manufacturer: '1470A2',
            itemDescription: 'FILTEK',
            lot: '',
            quantity: 5,
            uom: 'Bag-1',
            sourceDoc: `${podName}#receiving`,
            confidence: 0.8,
          },
        ],
      },
    );
    expect(rows.find((row) => String(row.Manufacturer) === '1470A3')?.Quantity).toBe(100);
    expect(rows.find((row) => String(row.Manufacturer) === '1470A2')?.Quantity).toBe(13);
  });

  it('keeps sales Quantity when POD qty is a catalog code, but still applies POD UOM', async () => {
    const podName = '2600015192 checked.pdf';
    const { rows } = await run(
      [
        salesRow({
          'TRX #': 2600015192,
          Manufacturer: '3MOC-37200',
          'Item Description': '37200 KETAC CEM',
          Quantity: 14,
          UOM: 'Each',
        }),
      ],
      [podName],
      {
        [podName]: [
          {
            trx: '2600015192',
            manufacturer: '37200',
            itemDescription: '37200 KETAC CEM RAD EF',
            lot: '10653807',
            quantity: 37200,
            uom: 'Bag-1',
            sourceDoc: podName,
            confidence: 0.8,
          },
        ],
      },
    );
    expect(rows[0]?.Quantity).toBe(14);
    expect(rows[0]?.UOM).toBe('Bag-1');
  });

  it('keeps sales Quantity when POD has no matching catalog line', async () => {
    const podName = '2600014236 POD checked.pdf';
    const { rows } = await run(
      [salesRow({ 'TRX #': 2600014236, Manufacturer: '3MOC-1954', Quantity: 10 })],
      [podName],
      {
        [podName]: [
          {
            trx: '2600014236',
            manufacturer: '99999',
            itemDescription: 'Other',
            lot: '',
            quantity: 99,
            uom: 'Each',
            sourceDoc: podName,
            confidence: 0.9,
          },
        ],
      },
    );
    expect(rows[0]?.Quantity).toBe(10);
  });

  it('strips 3MOC/3MOR manufacturer prefixes', async () => {
    const { rows } = await run(
      [salesRow({ 'TRX #': 2600014361, Manufacturer: '3MOC-46956' })],
      ['2600014361 pod checked.pdf'],
    );
    expect(rows[0]?.Manufacturer).toBe('46956');
  });

  it('collects TRX from every POD filename, including multi-TRX names', async () => {
    const sales = [
      salesRow({ 'TRX #': 2600014513, Quantity: 1 }),
      salesRow({ 'TRX #': 26125380, Quantity: 2 }),
      salesRow({ 'TRX #': 2600015078, Quantity: 3 }),
    ];
    const { rows } = await run(sales, [
      '2600014513, 26125380 checked.pdf',
      '2600015078 checked.pdf',
    ]);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => String(row['TRX #'])))).toEqual(
      new Set(['2600014513', '26125380', '2600015078']),
    );
  });

  it('uses Order Type from sales (falls back to TRX Type)', async () => {
    const { rows } = await run(
      [
        {
          ...salesRow({ 'TRX #': 2600014042 }),
          'Order Type': '',
          'TRX Type': 'Direct_Sales',
        },
      ],
      ['2600014042 checked.pdf'],
    );
    expect(rows[0]?.['Order Type']).toBe('Direct_Sales');
  });

  it('overrides fractional sales qty from receiving-note POLISHING line (49.5 → 50)', async () => {
    const podName = '2600015424 checked.pdf';
    const { rows } = await run(
      [
        salesRow({
          'TRX #': 2600015424,
          Manufacturer: '3MOC-1954',
          'Item Description': '1954 SOF-LEX',
          Quantity: 49.5,
          UOM: 'Box-100',
          'Lot Number': '11166524',
        }),
        salesRow({
          'TRX #': 2600015424,
          Manufacturer: '3MOC-1954',
          'Item Description': '1954 SOF-LEX',
          Quantity: 17,
          UOM: 'Box-150',
          'Lot Number': '11166524',
        }),
      ],
      [podName],
      {
        [podName]: [
          {
            trx: '2600015424',
            manufacturer: '1954',
            itemDescription: '50 POLISHING DUAL STRIPS',
            lot: '',
            quantity: 50,
            uom: 'Box-100',
            sourceDoc: `${podName}#receiving`,
            confidence: 0.95,
          },
        ],
      },
    );
    const overridden = rows.find((row) => Number(row.Quantity) === 50);
    const other = rows.find((row) => Number(row.Quantity) === 17);
    expect(overridden?.Manufacturer).toBe('1954');
    expect(overridden?.UOM).toBe('Box-100');
    expect(other?.Quantity).toBe(17);
  });

  it('prefers MOH receiving-note qty over sales on 1:1 TRX (51202×16 → 1470A2×55)', async () => {
    const podName = '2600015291 checked.pdf';
    const { rows } = await run(
      [
        salesRow({
          'TRX #': 2600015291,
          Manufacturer: '3MOC-51202',
          'Item Description': '51202 ADPER SINGLE BOND 2',
          Quantity: 16,
          UOM: 'Each',
          'Lot Number': '11709916',
        }),
      ],
      [podName],
      {
        [podName]: [
          {
            trx: '2600015291',
            manufacturer: '1470A2',
            itemDescription: 'Composite Light cure refill shade A2',
            lot: '',
            quantity: 55,
            uom: 'Each',
            sourceDoc: `${podName}#receiving`,
            confidence: 0.95,
          },
          {
            trx: '2600015291',
            manufacturer: '51202',
            itemDescription: '51202 ADPER SINGLE BOND 2',
            lot: '11709916',
            quantity: 16,
            uom: 'Each',
            sourceDoc: `${podName}#proforma`,
            confidence: 0.8,
          },
        ],
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.Quantity).toBe(55);
    expect(rows[0]?.Manufacturer).toBe('1470A2');
  });

  it('does not downgrade Bag-1 sales UOM to generic Each from POD', async () => {
    const podName = '2600015290 checked.pdf';
    const { rows } = await run(
      [salesRow({ 'TRX #': 2600015290, Manufacturer: '3MOC-1470A2', Quantity: 53, UOM: 'Bag-1' })],
      [podName],
      {
        [podName]: [
          {
            trx: '2600015290',
            manufacturer: '1470A2',
            itemDescription: 'FILTEK',
            lot: '',
            quantity: 53,
            uom: 'Each',
            sourceDoc: `${podName}#proforma`,
            confidence: 0.8,
          },
        ],
      },
    );
    expect(rows[0]?.Quantity).toBe(53);
    expect(rows[0]?.UOM).toBe('Bag-1');
  });

  it('on detailed POD GRN: keeps POD catalogs only, converts POLISHING pack×100, appends kit', async () => {
    const podName = '2600015875 checked.PDF';
    const { rows } = await run(
      [
        salesRow({
          'TRX #': 2600015875,
          Manufacturer: '3MOC-1954',
          'Item Description': '1954 SOF-LEX FINISHING STRIPS',
          Quantity: 3000,
          UOM: 'Box-1',
          'Lot Number': '0012139438',
        }),
        salesRow({
          'TRX #': 2600015875,
          Manufacturer: '3MOC-1470A2',
          Quantity: 30,
          UOM: 'Bag-1',
          'Lot Number': '12880707',
        }),
        salesRow({
          'TRX #': 2600015875,
          Manufacturer: '3MOC-4870A2',
          Quantity: 2,
          UOM: 'Bag-1',
          'Lot Number': '0012625407-7020140871',
        }),
      ],
      [podName],
      {
        [podName]: [
          {
            trx: '2600015875',
            manufacturer: '1470A2',
            itemDescription: 'FILTEK Z250 1470A2',
            lot: '',
            quantity: 30,
            uom: 'Each',
            sourceDoc: `${podName}#proforma`,
            confidence: 0.9,
          },
          {
            trx: '2600015875',
            manufacturer: '1954',
            itemDescription: 'POLISHING CELLULOID 3M',
            lot: '',
            quantity: 20,
            uom: 'Each',
            sourceDoc: `${podName}#proforma`,
            confidence: 0.9,
          },
          {
            trx: '2600015875',
            manufacturer: '56921',
            itemDescription: 'LIGHT CURE LUTING COMP KIT 56921',
            lot: '',
            quantity: 5,
            uom: 'Each',
            sourceDoc: `${podName}#proforma`,
            confidence: 0.9,
          },
        ],
      },
    );

    expect(rows.map((row) => String(row.Manufacturer)).sort()).toEqual(
      ['1470A2', '1954', '56921KIT'].sort(),
    );
    expect(rows.find((row) => String(row.Manufacturer) === '1954')?.Quantity).toBe(2000);
    expect(rows.find((row) => String(row.Manufacturer) === '1954')?.UOM).toBe('Box-1');
    expect(rows.find((row) => String(row.Manufacturer) === '56921KIT')?.Quantity).toBe(5);
    expect(rows.find((row) => String(row.Manufacturer) === '56921KIT')?.UOM).toBe('kit-1');
    expect(rows.find((row) => String(row.Manufacturer) === '56921KIT')?.['Lot Number']).toBe(
      '0012625407-7020140871',
    );
    expect(rows.some((row) => String(row.Manufacturer) === '4870A2')).toBe(false);
  });

  it('does not wipe sales rows when POD OCR is noisy junk catalogs', async () => {
    const podName = '2600014042 checked.pdf';
    const { rows } = await run(
      [
        salesRow({
          'TRX #': 2600014042,
          Manufacturer: '3MOC-7019A2B',
          Quantity: 50,
          UOM: 'Bag-1',
          'Lot Number': 'LOT-A',
        }),
        salesRow({
          'TRX #': 2600014042,
          Manufacturer: '3MOC-DUR-4',
          Quantity: 50,
          UOM: 'Bag-1',
          'Lot Number': 'LOT-B',
        }),
        salesRow({
          'TRX #': 2600014042,
          Manufacturer: '3MOR-900-832',
          Quantity: 5,
          UOM: 'Box-1',
          'Lot Number': '0925',
        }),
      ],
      [podName],
      {
        [podName]: [
          {
            trx: '2600014042',
            manufacturer: '8693C',
            itemDescription: 'SOF-LEX junk OCR',
            lot: '',
            quantity: 11612,
            uom: 'Each',
            sourceDoc: `${podName}#proforma`,
            confidence: 0.4,
          },
          {
            trx: '2600014042',
            manufacturer: '12611',
            itemDescription: 'address fragment',
            lot: '',
            quantity: 4,
            uom: 'Each',
            sourceDoc: `${podName}#proforma`,
            confidence: 0.3,
          },
          {
            trx: '2600014042',
            manufacturer: 'DUR-4',
            itemDescription: 'partial OCR',
            lot: '',
            quantity: 50,
            uom: 'Each',
            sourceDoc: `${podName}#proforma`,
            confidence: 0.5,
          },
        ],
      },
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => String(row.Manufacturer)).sort()).toEqual(
      ['7019A2B', '900-832', 'DUR-4'].sort(),
    );
    expect(rows.some((row) => String(row.Manufacturer) === '12611')).toBe(false);
  });
});
