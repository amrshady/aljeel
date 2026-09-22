import { createCanvas } from '@napi-rs/canvas';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { normalizeArabicIndicDigits } from './solventum-pod-parse';

export function isPdfFileName(name: string): boolean {
  return /\.pdf$/i.test(name.trim());
}

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

export interface OcrWordBox {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const ROW_Y_TOLERANCE = 4;
const COLUMN_SNAP = 8;
const MAX_PDF_PAGES = 40;
const MAX_OCR_PAGES = 20;
const MAX_PDF_ROWS = 100_000;
const RENDER_SCALE = 2.5;

let ocrChain: Promise<unknown> = Promise.resolve();
let ocrWorker: Worker | null = null;

function withOcrLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = ocrChain.then(fn, fn);
  ocrChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

type PdfRow = { y: number; items: PdfTextItem[] };
type MergedCell = { x: number; right: number; text: string };

export function pdfTextItemsToRows(
  items: PdfTextItem[],
  inheritedColumnXs?: number[] | null,
): unknown[][] {
  return layoutPdfRows(items, inheritedColumnXs).rows;
}

function layoutPdfRows(
  items: PdfTextItem[],
  inheritedColumnXs?: number[] | null,
): { rows: unknown[][]; columnXs: number[] | null } {
  const clustered = clusterItemsByRow(items);
  const draft = clustered.map((row) => mergeAdjacentCells(row.items));
  const header = draft.find((cells) => rowLooksLikeLedgerHeader(cells.map((cell) => cell.text)));
  const columnXs =
    header && header.length >= 2 ? header.map((cell) => cell.x) : inheritedColumnXs ?? null;

  if (!columnXs) {
    return {
      columnXs: null,
      rows: draft.slice(0, MAX_PDF_ROWS).map((cells) => cells.map((cell) => coerceCell(cell.text))),
    };
  }

  // Snap by x-start, not string width. A wide date / Arabic run can overlap the
  // next column's box and still belong to its own header column.
  return {
    columnXs,
    rows: clustered.slice(0, MAX_PDF_ROWS).map((row) => {
      const buckets: PdfTextItem[][] = columnXs.map(() => []);
      const ordered = [...row.items].sort((left, right) => left.x - right.x);
      for (const item of ordered) {
        let col = 0;
        for (let index = 1; index < columnXs.length; index += 1) {
          const start = columnXs[index];
          if (start == null) break;
          if (item.x + COLUMN_SNAP >= start) col = index;
          else break;
        }
        buckets[col]?.push(item);
      }
      return buckets.map((bucket) =>
        coerceCell(mergeAdjacentCells(bucket).map((cell) => cell.text).join(' ')),
      );
    }),
  };
}

function clusterItemsByRow(items: PdfTextItem[]): PdfRow[] {
  const rows: PdfRow[] = [];
  for (const item of items) {
    const text = item.str.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= ROW_Y_TOLERANCE);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push({ ...item, str: text });
  }
  rows.sort((left, right) => right.y - left.y);
  return rows;
}

function mergeAdjacentCells(items: PdfTextItem[]): MergedCell[] {
  const ordered = [...items].sort((left, right) => left.x - right.x);
  const cells: MergedCell[] = [];
  for (const item of ordered) {
    const right = item.x + Math.max(item.width, 0);
    const last = cells[cells.length - 1];
    const gap = last ? item.x - last.right : Infinity;
    if (last && gap >= -3 && gap <= 12) {
      last.text = `${last.text}${gap < 1 ? '' : ' '}${item.str}`.trim();
      last.right = Math.max(last.right, right);
      continue;
    }
    cells.push({ x: item.x, right, text: item.str });
  }
  return cells;
}

function rowLooksLikeLedgerHeader(values: unknown[]): boolean {
  return rowsLookLikeLedger([values]);
}

export function rowsLookLikeLedger(rows: unknown[][]): boolean {
  const labels = rows
    .slice(0, 40)
    .flat()
    .map((cell) =>
      String(cell ?? '')
        .replace(/[\u202d\u202c\u200e\u200f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[:.]+$/g, ''),
    );
  return (
    labels.includes('invoice number') ||
    labels.includes('البيان') ||
    labels.includes('مدين') ||
    labels.includes('unpaid amount')
  );
}

/** Image-space OCR boxes (y grows down) → PDF-space items (y grows up). */
export function ocrWordsToTextItems(words: OcrWordBox[]): PdfTextItem[] {
  const maxY = words.reduce((max, word) => Math.max(max, word.y1), 0);
  return words.map((word) => ({
    str: normalizeArabicIndicDigits(word.text),
    x: word.x0,
    y: maxY - word.y0,
    width: Math.max(0, word.x1 - word.x0),
  }));
}

export async function extractPdfRows(buffer: Buffer): Promise<unknown[][]> {
  const digital = await extractDigitalRows(buffer);
  if (rowsLookLikeLedger(digital)) return digital;

  const digitalChars = digital
    .flat()
    .map((cell) => String(cell ?? ''))
    .join('')
    .replace(/\s/g, '').length;
  // Scans have little or no text layer. Dense digital text that is not a ledger
  // should not kick off OCR (slow and often worse than the embedded layer).
  if (digitalChars >= 80) return digital;

  const ocrRows = await withOcrLock(() => ocrPdfToRows(buffer));
  if (rowsLookLikeLedger(ocrRows)) return ocrRows;
  if (ocrRows.some((row) => row.some((cell) => cell != null && String(cell).trim()))) {
    return ocrRows;
  }
  return digital;
}

async function extractDigitalRows(buffer: Buffer): Promise<unknown[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    }).promise;
  } catch {
    throw new Error('UNREADABLE_PDF');
  }

  const pageCount = Math.min(document.numPages, MAX_PDF_PAGES);
  const rows: unknown[][] = [];
  let columnXs: number[] | null = null;
  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    const page = await document.getPage(pageNo);
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const transform = 'transform' in item && Array.isArray(item.transform) ? item.transform : [];
      items.push({
        str: String(item.str),
        x: Number(transform[4] ?? 0),
        y: Number(transform[5] ?? 0),
        width: 'width' in item ? Number(item.width ?? 0) : 0,
      });
    }
    const layout = layoutPdfRows(items, columnXs);
    if (layout.columnXs) columnXs = layout.columnXs;
    rows.push(...layout.rows);
    if (rows.length > MAX_PDF_ROWS) return rows.slice(0, MAX_PDF_ROWS);
  }
  return rows;
}

async function ocrPdfToRows(buffer: Buffer): Promise<unknown[][]> {
  const pages = await renderPdfPageBuffers(buffer);
  if (pages.length === 0) return [];
  const worker = await getOcrWorker();
  const rows: unknown[][] = [];
  let columnXs: number[] | null = null;
  for (const png of pages) {
    const result = await worker.recognize(png);
    const words = (
      (result.data as { words?: Array<{ text?: string; bbox: Omit<OcrWordBox, 'text'> }> }).words ?? []
    )
      .map((word) => ({
        text: word.text ?? '',
        x0: word.bbox.x0,
        y0: word.bbox.y0,
        x1: word.bbox.x1,
        y1: word.bbox.y1,
      }))
      .filter((word) => word.text.trim());
    const layout = layoutPdfRows(ocrWordsToTextItems(words), columnXs);
    if (layout.columnXs) columnXs = layout.columnXs;
    rows.push(...layout.rows);
    if (rows.length > MAX_PDF_ROWS) return rows.slice(0, MAX_PDF_ROWS);
  }
  return rows;
}

async function getOcrWorker(): Promise<Worker> {
  if (ocrWorker) return ocrWorker;
  try {
    ocrWorker = await createWorker('ara+eng', 1, { logger: () => undefined });
  } catch {
    ocrWorker = await createWorker('eng', 1, { logger: () => undefined });
  }
  await ocrWorker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
  });
  return ocrWorker;
}

async function renderPdfPageBuffers(buffer: Buffer): Promise<Buffer[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;
  const pageCount = Math.min(document.numPages, MAX_OCR_PAGES);
  const pages: Buffer[] = [];
  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    const page = await document.getPage(pageNo);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
    } as never).promise;
    pages.push(canvas.toBuffer('image/png'));
  }
  return pages;
}

function coerceCell(text: string): string | number {
  const compact = text.replace(/,/g, '').trim();
  if (/^-?\d+(\.\d+)?$/.test(compact)) {
    const parsed = Number(compact);
    if (Number.isFinite(parsed)) return parsed;
  }
  return text;
}
