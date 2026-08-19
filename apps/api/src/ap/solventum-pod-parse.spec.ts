import { describe, expect, it } from 'vitest';
import {
  extractCatalogCodes,
  extractTrxFromFilename,
  isPlausibleDeliveredQuantity,
  normalizeArabicIndicDigits,
  parsePodTextToLines,
  stripManufacturerPrefix,
} from './solventum-pod-parse';

const NUPCO_5875_TEXT = `
Page 1 of 1
NUPCO 
National Unified Procurement Company 
وثيقة استلام مخزنية
Al-Jeel Medical Trading Co. Ltd
#
PO Item Trade Item No. Description Qty UOM Unit Price Amount
1
10
4215245303301
FILTEK Z250 
1470A2 3M ESPE
30
EA
55.000
1,650
2
20
4215245303201
FILTEK Z250 
1470A1 3M ESPE
20
EA
55.000
1,100
3
30
4215245303401
FILTEK Z250 
1470A3 3M ESPE
60
EA
55.000
3,300
4
40
4215180603902
POLISHING 
CELLULOID 3M
20
EA
64.013
1,280.25
5
50
4215245300502
LIGHT CURE 
LUTING COMP KIT 
56921 3M ESPE
5
EA
801.863 4,009.31
6
60
4215245303801
FILTEK Z250 
1470B2 3M ESPE
30
EA
55.000
1,650
`;

describe('solventum-pod-parse', () => {
  it('extracts TRX numbers from POD filenames', () => {
    expect(extractTrxFromFilename('2600015875 checked.PDF')).toEqual(['2600015875']);
    expect(extractTrxFromFilename('2600015192, 26125123 (1) checked.pdf')).toEqual([
      '2600015192',
      '26125123',
    ]);
  });

  it('strips 3MOC/3MOR manufacturer prefixes', () => {
    expect(stripManufacturerPrefix('3MOC-1470A2')).toBe('1470A2');
    expect(stripManufacturerPrefix('3MOR-900-832')).toBe('900-832');
  });

  it('parses the NUPCO 5875 receipt into 6 delivered lines including 56921', () => {
    const lines = parsePodTextToLines(NUPCO_5875_TEXT, '2600015875 checked.PDF', ['2600015875'], 0.9);
    expect(lines.length).toBeGreaterThanOrEqual(5);
    const catalogs = lines.map((line) => line.manufacturer);
    expect(catalogs).toEqual(expect.arrayContaining(['1470A2', '1470A1', '1470A3', '1470B2', '56921']));
    const kit = lines.find((line) => line.manufacturer === '56921');
    expect(kit?.quantity).toBe(5);
    expect(kit?.trx).toBe('2600015875');
  });

  it('extracts catalog codes from mixed sales/POD text', () => {
    expect(extractCatalogCodes('3MOC-1470A2 FILTEK')).toContain('1470A2');
    expect(extractCatalogCodes('LIGHT CURE LUTING COMP KIT 56921')).toContain('56921');
  });

  it('rejects catalog codes disguised as delivered quantities', () => {
    expect(isPlausibleDeliveredQuantity(1954, '1954', 'SOF-LEX FINISHING STRIPS')).toBe(false);
    expect(isPlausibleDeliveredQuantity(37200, '37200', 'KETAC CEM RAD EF')).toBe(false);
    expect(isPlausibleDeliveredQuantity(1470, '1470A2', 'FILTEK')).toBe(false);
    expect(isPlausibleDeliveredQuantity(14, '37200', 'KETAC CEM RAD EF')).toBe(true);
    expect(isPlausibleDeliveredQuantity(50, '1954', 'SOF-LEX')).toBe(true);
    expect(isPlausibleDeliveredQuantity(5, '56921', 'RELYX')).toBe(true);
  });

  it('parses NUPCO tender POLISHING qty from amount/unit/qty triples', () => {
    const text = `
27500.00   55   500   Composite,   Light cure refill shade A2. (must
3200.62   64.0125   50   POLISHING   DUAL STRIPS ,COARSE   /   MEDIUM   (100/P
`;
    const lines = parsePodTextToLines(text, '2600015424.pdf', ['2600015424'], 0.9);
    const polish = lines.find((line) => line.manufacturer === '1954');
    expect(polish?.quantity).toBe(50);
    const composite = lines.find((line) => line.manufacturer === '1470A2');
    expect(composite?.quantity).toBe(500);
  });

  it('parses MOH receiving notes with Arabic-Indic quantity digits', () => {
    const text = `
محضر استلام
Ministry of Health
الكمية
Composite, Light cure refill shade A2. (must be same brand)
٥٥ Piece ٥٥ ٣٠٢٥
`;
    const lines = parsePodTextToLines(text, '2600015291.pdf', ['2600015291'], 0.85);
    const composite = lines.find((line) => line.manufacturer === '1470A2');
    expect(composite?.quantity).toBe(55);
    expect(composite?.sourceDoc).toContain('#receiving');
  });

  it('infers MOH Composite qty from perfect-square amount when Arabic digits are missed', () => {
    const text = `
محضر استلام
Ministrv of Health
Composite, Light cure refill Yeo Picce
shade AY. (must be same brand)
2025
51202 ADPER 16 gach 189.062 3025
Total Net Price 3025
`;
    const lines = parsePodTextToLines(text, '2600015291.pdf', ['2600015291'], 0.85);
    const composite = lines.filter((line) => line.manufacturer === '1470A2');
    expect(composite.some((line) => line.quantity === 55)).toBe(true);
    expect(composite.find((line) => line.quantity === 55)?.sourceDoc).toContain('#receiving');
  });

  it('normalizes Arabic-Indic digits', () => {
    expect(normalizeArabicIndicDigits('٥٥')).toBe('55');
    expect(normalizeArabicIndicDigits('٣٠٢٥')).toBe('3025');
  });
});
