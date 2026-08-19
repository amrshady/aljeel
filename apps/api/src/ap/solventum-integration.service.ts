import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  catalogsOverlap,
  extractTrxFromFilename,
  isInferredPodQuantity,
  isPlausibleDeliveredQuantity,
  isReceivingNoteLine,
  normalizePodKey,
  stripManufacturerPrefix,
} from './solventum-pod-parse';
import {
  SolventumPodExtractor,
  type SolventumPodFile,
  type SolventumPodLine,
} from './solventum-pod.types';

export const SOLVENTUM_OUTPUT_FILE_NAME = 'Chargeback report supported by PODs attached.xlsx';

/** Chargeback columns — Item Description omitted by design. */
export const SOLVENTUM_OUTPUT_COLUMNS = [
  'TRX #',
  'TRX Date',
  'Order Type',
  'Account Name',
  'Ship Address',
  'Manufacturer',
  'Agency',
  'Lot Number',
  'Quantity',
  'UOM',
] as const;

type SalesRow = Record<string, unknown>;

const MARKS = /[\u202d\u202c\u200e\u200f]/g;
const clean = (value: unknown) =>
  String(value ?? '')
    .replace(MARKS, '')
    .trim()
    .replace(/\s+/g, ' ');

const normalizeTrx = (value: unknown) => {
  const normalized = clean(value);
  return /^\d+(?:\.0+)?$/.test(normalized) ? String(Math.trunc(Number(normalized))) : normalized;
};

const isFilenamePlaceholder = (pod: SolventumPodLine) =>
  pod.quantity === 0 && !pod.itemDescription && !pod.manufacturer && pod.sourceDoc.includes('#filename');

const isGenericUom = (value: unknown) => /^(EA|EACH|PIECE|PCS)$/i.test(clean(value));

/**
 * LOCKED RULE (row selection by filename):
 * For every uploaded POD file, extract the TRX from the POD filename.
 * Then, from the Sales Sheet, retrieve every record that contains this TRX value.
 *
 * Exception (clerk parity on clean NUPCO GRNs): when a multi-line TRX has a POD whose
 * catalogs mostly match sales exactly, keep only matching sales rows, apply POD qtys
 * (incl. SOF-LEX pack ×100), and append unmatched POD-only lines (e.g. 56921KIT).
 * Noisy OCR junk must NOT trigger this path.
 *
 * Quantity: when a POD delivered line matches a selected sales row (same TRX + catalog),
 * override Quantity (and UOM when present) from the POD scan. Prefer MOH receiving-note
 * quantities over proforma when both exist.
 */
@Injectable()
export class SolventumIntegrationService {
  constructor(@Inject(SolventumPodExtractor) private readonly extractor: SolventumPodExtractor) {}

  async generateChargeback(workbookBuffer: Buffer, podFiles: SolventumPodFile[]): Promise<Buffer> {
    const salesRows = this.readSalesRows(workbookBuffer);
    const podTrx = this.collectTrxFromPodFilenames(podFiles);

    if (podTrx.size === 0) {
      throw new BadRequestException({
        code: 'SOLVENTUM_POD_TRX_REQUIRED',
        message: 'No TRX numbers could be extracted from the uploaded POD filenames.',
      });
    }

    const selected = salesRows.filter((row) => podTrx.has(normalizeTrx(row['TRX #'])));
    if (selected.length === 0) {
      throw new BadRequestException({
        code: 'SOLVENTUM_NO_MATCHING_SALES',
        message:
          'POD filenames contained TRX numbers, but none matched rows in the sales workbook.',
      });
    }

    const podLines = await this.extractPodLines(podFiles);
    const chargebackRows = this.applyPodQuantities(selected, podLines).map((row) =>
      this.toChargebackRow(row),
    );

    const output = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      output,
      XLSX.utils.json_to_sheet(chargebackRows, {
        header: Array.from(SOLVENTUM_OUTPUT_COLUMNS),
      }),
      'Sheet1',
    );
    return XLSX.write(output, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  private collectTrxFromPodFilenames(podFiles: SolventumPodFile[]): Set<string> {
    const trx = new Set<string>();
    for (const file of podFiles) {
      for (const value of extractTrxFromFilename(file.originalname)) {
        trx.add(normalizeTrx(value));
      }
    }
    return trx;
  }

  private async extractPodLines(podFiles: SolventumPodFile[]): Promise<SolventumPodLine[]> {
    const lines: SolventumPodLine[] = [];
    const settled = await Promise.allSettled(podFiles.map((file) => this.extractor.extract(file)));
    settled.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const fileTrxs = extractTrxFromFilename(podFiles[index]?.originalname ?? '');
      const primaryTrx = fileTrxs[0];
      for (const line of result.value) {
        if (isFilenamePlaceholder(line)) continue;
        lines.push({
          ...line,
          trx: normalizeTrx(line.trx || primaryTrx || ''),
        });
      }
    });
    return lines;
  }

  /**
   * Keep every sales row selected by filename TRX, unless that TRX has a clean detailed
   * POD delivery list — then keep POD-matched catalogs only and append unmatched POD lines.
   * Override Quantity from POD when catalog matches, or via 1:1 receiving-note fallback.
   * Never replace a specific sales UOM (Bag-1 / Box-100) with generic Each.
   */
  private applyPodQuantities(salesRows: SalesRow[], podLines: SolventumPodLine[]): SalesRow[] {
    const originalCountByTrx = new Map<string, number>();
    const salesByTrx = new Map<string, SalesRow[]>();
    for (const row of salesRows) {
      const trx = normalizeTrx(row['TRX #']);
      originalCountByTrx.set(trx, (originalCountByTrx.get(trx) ?? 0) + 1);
      if (!salesByTrx.has(trx)) salesByTrx.set(trx, []);
      salesByTrx.get(trx)!.push(row);
    }
    const detailedTrx = this.detailedDeliveryTrx(podLines, salesByTrx, originalCountByTrx);
    const { rows: filtered, droppedByTrx } = this.filterToPodCatalogs(
      salesRows,
      podLines,
      detailedTrx,
    );

    const usedPod = new Set<number>();
    const receivingTrx = new Set(
      podLines.filter(isReceivingNoteLine).map((pod) => normalizeTrx(pod.trx)),
    );

    const matched: SalesRow[] = filtered.map((row) => {
      const trx = normalizeTrx(row['TRX #']);
      const salesRowsForTrx = originalCountByTrx.get(trx) ?? 0;
      const preferReceiving = salesRowsForTrx === 1 && receivingTrx.has(trx);

      const ranked = podLines
        .map((pod, index) => ({
          pod,
          index,
          score: this.scoreQuantityMatch(row, pod, salesRowsForTrx, preferReceiving),
        }))
        .filter(({ index, score }) => !usedPod.has(index) && score > 0)
        .sort((a, b) => b.score - a.score);

      const best = ranked[0];
      if (!best) return row;

      usedPod.add(best.index);
      const next: SalesRow = { ...row };
      const appliedQty = this.resolveAppliedQuantity(row, best.pod, salesRowsForTrx);
      if (appliedQty != null) {
        next.Quantity = appliedQty;
      }
      if (best.pod.uom) {
        const salesUom = clean(row.UOM);
        const podUom = clean(best.pod.uom);
        const packConverted =
          appliedQty != null && appliedQty !== best.pod.quantity && /^Box-1$/i.test(salesUom);
        if (
          !packConverted &&
          !(isGenericUom(podUom) && salesUom && !isGenericUom(salesUom))
        ) {
          next.UOM = best.pod.uom;
        }
      }
      if (
        isReceivingNoteLine(best.pod) &&
        best.pod.manufacturer &&
        salesRowsForTrx === 1 &&
        normalizePodKey(stripManufacturerPrefix(row.Manufacturer)) !==
          normalizePodKey(best.pod.manufacturer)
      ) {
        next.Manufacturer = best.pod.manufacturer;
      }
      if (best.pod.lot && !clean(row['Lot Number'])) {
        next['Lot Number'] = best.pod.lot;
      }
      return next;
    });

    return [...matched, ...this.podOnlyRows(filtered, podLines, usedPod, detailedTrx, droppedByTrx)];
  }

  /**
   * Only treat a POD as an authoritative multi-line delivery list when enough lines
   * exactly match sales catalogs. Stops noisy OCR (VAT digits, address fragments)
   * from wiping real sales rows on TRXs like 4042 / 6033.
   */
  private detailedDeliveryTrx(
    podLines: SolventumPodLine[],
    salesByTrx: Map<string, SalesRow[]>,
    salesCountByTrx: Map<string, number>,
  ): Set<string> {
    const podsByTrx = new Map<string, SolventumPodLine[]>();
    for (const pod of podLines) {
      if (isInferredPodQuantity(pod)) continue;
      const trx = normalizeTrx(pod.trx);
      const manuf = normalizePodKey(stripManufacturerPrefix(pod.manufacturer));
      if (!trx || !manuf || !(pod.quantity > 0)) continue;
      if (!isPlausibleDeliveredQuantity(pod.quantity, pod.manufacturer, pod.itemDescription)) {
        continue;
      }
      if (!podsByTrx.has(trx)) podsByTrx.set(trx, []);
      podsByTrx.get(trx)!.push(pod);
    }

    const detailed = new Set<string>();
    for (const [trx, pods] of podsByTrx) {
      if ((salesCountByTrx.get(trx) ?? 0) <= 1) continue;
      const sales = salesByTrx.get(trx) ?? [];
      const exactHits = pods.filter((pod) =>
        sales.some((row) => {
          const salesManuf = normalizePodKey(stripManufacturerPrefix(row.Manufacturer));
          const podManuf = normalizePodKey(stripManufacturerPrefix(pod.manufacturer));
          return salesManuf !== '' && salesManuf === podManuf;
        }),
      );
      const distinctExact = new Set(
        exactHits.map((pod) => normalizePodKey(stripManufacturerPrefix(pod.manufacturer))),
      );
      if (distinctExact.size >= 2 && exactHits.length / pods.length >= 0.5) {
        detailed.add(trx);
      }
    }
    return detailed;
  }

  private filterToPodCatalogs(
    salesRows: SalesRow[],
    podLines: SolventumPodLine[],
    detailedTrx: Set<string>,
  ): { rows: SalesRow[]; droppedByTrx: Map<string, SalesRow[]> } {
    const droppedByTrx = new Map<string, SalesRow[]>();
    const rows: SalesRow[] = [];
    for (const row of salesRows) {
      const trx = normalizeTrx(row['TRX #']);
      if (!detailedTrx.has(trx)) {
        rows.push(row);
        continue;
      }
      const hit = podLines.some(
        (pod) => normalizeTrx(pod.trx) === trx && this.catalogsMatch(row, pod),
      );
      if (hit) {
        rows.push(row);
      } else {
        if (!droppedByTrx.has(trx)) droppedByTrx.set(trx, []);
        droppedByTrx.get(trx)!.push(row);
      }
    }
    return { rows, droppedByTrx };
  }

  private catalogsMatch(row: SalesRow, pod: SolventumPodLine): boolean {
    if (!(pod.quantity > 0)) return false;
    const salesManuf = stripManufacturerPrefix(row.Manufacturer);
    const podManuf = stripManufacturerPrefix(pod.manufacturer);
    if (podManuf && normalizePodKey(salesManuf) === normalizePodKey(podManuf)) return true;
    return catalogsOverlap(
      `${row.Manufacturer} ${row['Item Description']}`,
      `${pod.manufacturer} ${pod.itemDescription}`,
    );
  }

  private podOnlyRows(
    matchedSales: SalesRow[],
    podLines: SolventumPodLine[],
    usedPod: Set<number>,
    detailedTrx: Set<string>,
    droppedByTrx: Map<string, SalesRow[]>,
  ): SalesRow[] {
    const templateByTrx = new Map<string, SalesRow>();
    for (const row of matchedSales) {
      const trx = normalizeTrx(row['TRX #']);
      if (!templateByTrx.has(trx)) templateByTrx.set(trx, row);
    }
    for (const [trx, dropped] of droppedByTrx) {
      if (!templateByTrx.has(trx) && dropped[0]) templateByTrx.set(trx, dropped[0]);
    }

    const extras: SalesRow[] = [];
    podLines.forEach((pod, index) => {
      if (usedPod.has(index)) return;
      if (isInferredPodQuantity(pod)) return;
      const trx = normalizeTrx(pod.trx);
      if (!detailedTrx.has(trx) || !(pod.quantity > 0) || !pod.manufacturer) return;
      if (!isPlausibleDeliveredQuantity(pod.quantity, pod.manufacturer, pod.itemDescription)) {
        return;
      }
      if (
        matchedSales.some((row) => normalizeTrx(row['TRX #']) === trx && this.catalogsMatch(row, pod))
      ) {
        return;
      }
      const template = templateByTrx.get(trx);
      if (!template) return;

      const dropped = droppedByTrx.get(trx) ?? [];
      extras.push({
        ...template,
        Manufacturer: this.podManufacturerLabel(pod),
        'Item Description': pod.itemDescription || template['Item Description'],
        'Lot Number': clean(pod.lot) || this.lotDonorFromDropped(pod, dropped) || '',
        Quantity: pod.quantity,
        UOM: /KIT/i.test(`${pod.itemDescription} ${pod.uom}`)
          ? 'kit-1'
          : pod.uom || template.UOM,
      });
      usedPod.add(index);
    });
    return extras;
  }

  /** When POD kit line has no lot, reuse the replaced sales line's lot (clerk 56921KIT). */
  private lotDonorFromDropped(pod: SolventumPodLine, dropped: SalesRow[]): string {
    if (clean(pod.lot) || dropped.length === 0) return '';
    if (dropped.length === 1) return clean(dropped[0]!['Lot Number']);
    if (!/KIT/i.test(pod.itemDescription)) return '';
    const bulk = dropped.find((row) =>
      /4870|BULK\s*FILL/i.test(`${row.Manufacturer ?? ''} ${row['Item Description'] ?? ''}`),
    );
    return clean(bulk?.['Lot Number']);
  }

  private podManufacturerLabel(pod: SolventumPodLine): string {
    const base = stripManufacturerPrefix(pod.manufacturer);
    if (/KIT/i.test(pod.itemDescription) && !/KIT/i.test(base)) {
      return `${base}KIT`;
    }
    return base;
  }

  /**
   * SOF-LEX / POLISHING: NUPCO often reports pack count (20 EA) while sales is Box-1 strip
   * units (3000). Clerk converts pack × 100 → chargeback qty (2000) and keeps sales UOM.
   */
  private polishPackQuantity(row: SalesRow, pod: SolventumPodLine): number | null {
    const salesManuf = normalizePodKey(stripManufacturerPrefix(row.Manufacturer));
    const podManuf = normalizePodKey(stripManufacturerPrefix(pod.manufacturer));
    if (salesManuf !== '1954' && podManuf !== '1954') return null;
    if (!/POLISHING|SOF-?LEX|1954/i.test(`${pod.itemDescription} ${row['Item Description'] ?? ''}`)) {
      return null;
    }

    const salesUom = clean(row.UOM);
    const podUom = clean(pod.uom);
    const salesQty = Number(row.Quantity);
    if (!Number.isFinite(salesQty) || salesQty <= 0 || !(pod.quantity > 0)) return null;
    if (!/^Box-1$/i.test(salesUom) && !isGenericUom(salesUom)) return null;
    if (!(isGenericUom(podUom) || /^Box-100$/i.test(podUom))) return null;

    const converted = pod.quantity * 100;
    if (converted > pod.quantity && converted <= salesQty) return converted;
    return null;
  }

  private resolveAppliedQuantity(
    row: SalesRow,
    pod: SolventumPodLine,
    salesRowsForTrx: number,
  ): number | null {
    const pack = this.polishPackQuantity(row, pod);
    if (pack != null) return pack;
    if (!this.canApplyPodQuantity(row, pod, salesRowsForTrx)) return null;
    return pod.quantity;
  }

  private canApplyPodQuantity(
    row: SalesRow,
    pod: SolventumPodLine,
    salesRowsForTrx: number,
  ): boolean {
    if (
      !isPlausibleDeliveredQuantity(
        pod.quantity,
        pod.manufacturer || row.Manufacturer,
        `${pod.itemDescription} ${row['Item Description'] ?? ''}`,
      )
    ) {
      return false;
    }
    if (!isPlausibleDeliveredQuantity(pod.quantity, row.Manufacturer, row['Item Description'])) {
      if (!isPlausibleDeliveredQuantity(pod.quantity, pod.manufacturer, pod.itemDescription)) {
        return false;
      }
    }

    const salesQty = Number(row.Quantity);
    if (!Number.isFinite(salesQty) || salesQty <= 0) return true;

    const absDiff = Math.abs(pod.quantity - salesQty);
    const near = absDiff <= 1 || Math.abs(pod.quantity - Math.round(salesQty)) <= 1;
    const fractionalFix =
      !Number.isInteger(salesQty) &&
      (Math.round(salesQty) === pod.quantity || Math.ceil(salesQty) === pod.quantity);

    // Inferred qtys (√amount) and full receiving-note replacements are 1:1 TRX only.
    // This is how we take POD qty 55 on 5291 without poisoning multi-line 5424 rows.
    if (isInferredPodQuantity(pod) || (salesRowsForTrx === 1 && isReceivingNoteLine(pod))) {
      return salesRowsForTrx === 1;
    }

    // Multi-line TRXs: only correct near/fractional mismatches (49.5 → 50), never 13 → 5 or 100 → 55.
    return near || fractionalFix;
  }

  private scoreQuantityMatch(
    row: SalesRow,
    pod: SolventumPodLine,
    salesRowsForTrx: number,
    preferReceiving: boolean,
  ): number {
    if (!pod.trx || normalizeTrx(row['TRX #']) !== normalizeTrx(pod.trx)) return 0;
    if (!(pod.quantity > 0)) return 0;

    const receiving = isReceivingNoteLine(pod);
    const inferred = isInferredPodQuantity(pod);

    // Inferred Composite qtys must not attach to multi-line chargebacks.
    if (inferred && salesRowsForTrx !== 1) return 0;

    // On single-line TRXs, clerk follows the MOH receiving note over the proforma invoice.
    if (preferReceiving && !receiving) return 0;

    let score = 10;
    let catalogHit = false;
    const salesManuf = stripManufacturerPrefix(row.Manufacturer);
    const podManuf = stripManufacturerPrefix(pod.manufacturer);

    if (podManuf && normalizePodKey(salesManuf) === normalizePodKey(podManuf)) {
      score += 50;
      catalogHit = true;
    }
    if (
      catalogsOverlap(
        `${row.Manufacturer} ${row['Item Description']}`,
        `${pod.manufacturer} ${pod.itemDescription}`,
      )
    ) {
      score += 40;
      catalogHit = true;
    }

    const salesLot = normalizePodKey(row['Lot Number']);
    const podLot = normalizePodKey(pod.lot);
    if (podLot && salesLot && salesLot === podLot) score += 30;

    if (receiving) score += 40;
    if (salesRowsForTrx === 1 && receiving) score += 40;
    if (inferred && salesRowsForTrx === 1) score += 30;

    const salesQty = Number(row.Quantity);
    if (
      Number.isFinite(salesQty) &&
      !Number.isInteger(salesQty) &&
      (Math.round(salesQty) === pod.quantity || Math.ceil(salesQty) === pod.quantity)
    ) {
      score += 25;
    }

    // Multi-line TRXs require a catalog/manufacturer hit — receiving boost alone is not enough.
    if (catalogHit && score >= 50) return score;
    // Single-line TRX: MOH receiving note may replace the sales catalog entirely.
    if (receiving && salesRowsForTrx === 1 && score >= 50) return score;
    return 0;
  }

  private toChargebackRow(row: SalesRow): Record<string, unknown> {
    const orderType = row['Order Type'] || row['TRX Type'] || '';
    return {
      'TRX #': normalizeTrx(row['TRX #']),
      'TRX Date': row['TRX Date'] ?? '',
      'Order Type': orderType,
      'Account Name': row['Account Name'] ?? '',
      'Ship Address': row['Ship Address'] ?? '',
      Manufacturer: stripManufacturerPrefix(row.Manufacturer),
      Agency: row.Agency ?? '',
      'Lot Number': row['Lot Number'] ?? '',
      Quantity: row.Quantity ?? '',
      UOM: row.UOM ?? '',
    };
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

    const sheet = workbook.Sheets.Sheet2 ?? this.findSalesSheet(workbook);
    if (!sheet) {
      throw new BadRequestException({
        code: 'SOLVENTUM_SHEET_REQUIRED',
        message: 'The Excel workbook must contain a sales worksheet with the required columns.',
      });
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const headerRowIndex = matrix.findIndex((row) =>
      row.some((cell) => clean(cell).toLowerCase() === 'trx #'),
    );
    if (headerRowIndex < 0) {
      throw new BadRequestException({
        code: 'SOLVENTUM_COLUMNS_REQUIRED',
        message: 'Could not find a header row containing TRX #.',
      });
    }

    const headers = (matrix[headerRowIndex] ?? []).map(clean);
    const required = [
      'TRX #',
      'TRX Date',
      'Account Name',
      'Ship Address',
      'Manufacturer',
      'Agency',
      'Lot Number',
      'Quantity',
      'UOM',
    ] as const;
    const missing = required.filter((column) => !headers.includes(column));
    const hasOrderType =
      headers.includes('Order Type') || headers.includes('TRX Type') || headers.includes('OrderType');
    if (!hasOrderType) missing.push('Order Type' as never);
    if (missing.length) {
      throw new BadRequestException({
        code: 'SOLVENTUM_COLUMNS_REQUIRED',
        message: `Sales sheet is missing required columns: ${missing.join(', ')}`,
      });
    }

    return XLSX.utils.sheet_to_json<SalesRow>(sheet, {
      defval: '',
      raw: true,
      range: headerRowIndex,
    });
  }

  private findSalesSheet(workbook: XLSX.WorkBook) {
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const first = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })[0] ?? [];
      if (first.some((cell) => clean(cell).toLowerCase() === 'trx #')) return sheet;
    }
    return undefined;
  }
}
