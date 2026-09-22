import { createCanvas } from '@napi-rs/canvas';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { normalizeArabicIndicDigits } from './solventum-pod-parse';

export function isPdfFileName(name: string): boolean {
  return /\.pdf$/i.test(name.trim());
}

export type PdfExtractCode =
  | 'UNREADABLE_PDF'
  | 'PDF_PAGE_TOO_LARGE'
  | 'PDF_TIMEOUT'
  | 'PDF_OCR_BUSY'
  | 'PDF_TOO_MANY_ROWS';

export class PdfExtractError extends Error {
  constructor(
    readonly code: PdfExtractCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PdfExtractError';
  }
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

export type LedgerKind = 'aljeel' | 'supplier';
type PdfRow = { y: number; items: PdfTextItem[] };
type MergedCell = { x: number; right: number; text: string };

const ROW_Y_TOLERANCE = 4;
const COLUMN_SNAP = 8;
const MAX_PDF_PAGES = 40;
const MAX_OCR_PAGES = 10;
const MAX_PDF_ROWS = 100_000;
const MAX_PDF_ITEMS_PER_PAGE = 10_000;
const RENDER_SCALE = 2.5;
const MAX_RENDER_PIXELS = 4_000_000;
const MAX_CANVAS_EDGE = 2_200;
const MAX_OCR_JOBS = 2;
const PDF_EXTRACT_TIMEOUT_MS = 45_000;
const OCR_PAGE_TIMEOUT_MS = 20_000;

/** Tesseract.js 7 defaults to text-only; word boxes live under blocks. */
export const OCR_OUTPUT_FORMATS = { text: true, blocks: true } as const;

export const PDF_EXTRACT_LIMITS = {
  maxPages: MAX_PDF_PAGES,
  maxOcrPages: MAX_OCR_PAGES,
  maxRows: MAX_PDF_ROWS,
  maxItemsPerPage: MAX_PDF_ITEMS_PER_PAGE,
  extractTimeoutMs: PDF_EXTRACT_TIMEOUT_MS,
  ocrPageTimeoutMs: OCR_PAGE_TIMEOUT_MS,
  denseDigitalChars: 80,
} as const;

let ocrChain: Promise<unknown> = Promise.resolve();
let ocrQueued = 0;
let ocrWorker: Worker | null = null;

export function withOcrLock<T>(fn: () => Promise<T>): Promise<T> {
  if (ocrQueued >= MAX_OCR_JOBS) {
    throw new PdfExtractError(
      'PDF_OCR_BUSY',
      'Another scanned PDF is still being read. Try again in a moment.',
    );
  }
  ocrQueued += 1;
  const run = ocrChain.then(fn, fn).finally(() => {
    ocrQueued -= 1;
  });
  ocrChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function terminateOcrWorker(): Promise<void> {
  const worker = ocrWorker;
  ocrWorker = null;
  if (!worker) return;
  try {
    await worker.terminate();
  } catch {
    /* worker may already be dead */
  }
}

type RenderTaskLike = { cancel: (extraDelay?: number) => void };
type TextChunk = { items?: unknown[] };

/** Cancels in-flight pdf.js work and kills the Tesseract worker on abort. */
export class PdfExtractSession {
  aborted = false;
  private renderTask: RenderTaskLike | null = null;
  private reader: ReadableStreamDefaultReader<TextChunk> | null = null;
  private ocrOwned = false;
  onTerminateOcr: () => Promise<void> = terminateOcrWorker;

  attachRender(task: RenderTaskLike | null): void {
    this.renderTask = task;
    if (task) this.throwIfAborted();
  }

  attachReader(reader: ReadableStreamDefaultReader<TextChunk> | null): void {
    this.reader = reader;
    if (reader) this.throwIfAborted();
  }

  markOcr(): void {
    this.ocrOwned = true;
  }

  throwIfAborted(): void {
    if (this.aborted) throw new PdfExtractError('PDF_TIMEOUT');
  }

  async abort(): Promise<void> {
    const shouldKillOcr = this.ocrOwned && !this.aborted;
    this.aborted = true;
    try {
      this.renderTask?.cancel();
    } catch {
      /* already cancelled */
    }
    this.renderTask = null;
    try {
      await this.reader?.cancel();
    } catch {
      /* already cancelled */
    }
    this.reader = null;
    if (shouldKillOcr) {
      this.ocrOwned = false;
      try {
        await this.onTerminateOcr();
      } catch {
        /* ignore */
      }
    }
  }
}

export async function runWithDeadline<T>(
  timeoutMs: number,
  work: (session: PdfExtractSession) => Promise<T>,
  session = new PdfExtractSession(),
): Promise<T> {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const error = new PdfExtractError('PDF_TIMEOUT', `PDF read timed out after ${timeoutMs}ms.`);
      void session.abort().finally(() => reject(error));
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    const result = await Promise.race([work(session), timeout]);
    settled = true;
    return result;
  } catch (error) {
    if (!settled) {
      settled = true;
      const timedOut =
        session.aborted || (error instanceof PdfExtractError && error.code === 'PDF_TIMEOUT');
      if (timedOut) await session.abort();
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function renderScaleForPage(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new PdfExtractError('PDF_PAGE_TOO_LARGE', 'PDF page has invalid dimensions.');
  }
  const byPixels = Math.sqrt(MAX_RENDER_PIXELS / (width * height));
  const byEdge = Math.min(MAX_CANVAS_EDGE / width, MAX_CANVAS_EDGE / height);
  const scale = Math.min(RENDER_SCALE, byPixels, byEdge);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new PdfExtractError('PDF_PAGE_TOO_LARGE', 'PDF page is too large to render.');
  }
  return scale;
}

export function pdfTextItemsToRows(
  items: PdfTextItem[],
  inheritedColumnXs?: number[] | null,
): unknown[][] {
  return layoutClusteredRows(clusterItemsByRow(items), inheritedColumnXs).rows;
}

function layoutClusteredRows(
  clustered: PdfRow[],
  inheritedColumnXs?: number[] | null,
): { rows: unknown[][]; columnXs: number[] | null } {
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

function normalizeLabel(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u202d\u202c\u200e\u200f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[:.]+$/g, '');
}

function rowLooksLikeLedgerHeader(values: unknown[]): boolean {
  return rowsLookLikeLedger([values]);
}

export function ledgerKindFromValues(values: unknown[]): LedgerKind | null {
  const labels = values.map(normalizeLabel);
  if (labels.includes('invoice number') && (labels.includes('unpaid amount') || labels.includes('invoice amount'))) {
    return 'aljeel';
  }
  if (labels.includes('البيان') || (labels.includes('مدين') && labels.includes('تاريخ المعاملة'))) {
    return 'supplier';
  }
  return null;
}

export function splitLedgerTables(rows: unknown[][]): unknown[][][] {
  const tables: unknown[][][] = [];
  let current: unknown[][] = [];
  let kind: LedgerKind | null = null;
  for (const row of rows) {
    const rowKind = ledgerKindFromValues(row);
    if (rowKind && kind && rowKind !== kind) {
      if (current.length) tables.push(current);
      current = [row];
      kind = rowKind;
      continue;
    }
    if (rowKind && !kind) kind = rowKind;
    current.push(row);
  }
  if (current.length) tables.push(current);
  return tables.length ? tables : [rows];
}

export function rowsLookLikeLedger(rows: unknown[][]): boolean {
  const labels = rows.slice(0, 40).flat().map(normalizeLabel);
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

interface OcrRecognizeWord {
  text?: string;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrRecognizeData {
  words?: OcrRecognizeWord[];
  blocks?: Array<{
    paragraphs?: Array<{
      lines?: Array<{
        words?: OcrRecognizeWord[];
      }>;
    }>;
  }> | null;
}

/** Tesseract.js 7 Page has no data.words — walk blocks → paragraphs → lines → words. */
export function ocrWordsFromRecognizeData(data: OcrRecognizeData | null | undefined): OcrWordBox[] {
  const words: OcrWordBox[] = [];
  for (const block of data?.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text?.trim() ?? '';
          const bbox = word.bbox;
          if (!text || !bbox) continue;
          words.push({
            text,
            x0: bbox.x0,
            y0: bbox.y0,
            x1: bbox.x1,
            y1: bbox.y1,
          });
        }
      }
    }
  }
  return words;
}

export function tablesFromTextItems(
  items: PdfTextItem[],
  inherited?: { xs: number[] | null; kind: LedgerKind | null },
): { tables: unknown[][][]; inherit: { xs: number[] | null; kind: LedgerKind | null } } {
  const clustered = clusterItemsByRow(items);
  const segments: { kind: LedgerKind | null; rows: PdfRow[] }[] = [];
  let bucket: PdfRow[] = [];
  let kind: LedgerKind | null = null;
  for (const row of clustered) {
    const rowKind = ledgerKindFromValues(mergeAdjacentCells(row.items).map((cell) => cell.text));
    if (rowKind && kind && rowKind !== kind) {
      if (bucket.length) segments.push({ kind, rows: bucket });
      bucket = [row];
      kind = rowKind;
      continue;
    }
    if (rowKind && !kind) kind = rowKind;
    bucket.push(row);
  }
  if (bucket.length) segments.push({ kind, rows: bucket });

  const tables: unknown[][][] = [];
  let xs = inherited?.xs ?? null;
  let inheritKind = inherited?.kind ?? null;
  for (const segment of segments) {
    const useXs = segment.kind && segment.kind === inheritKind ? xs : null;
    const layout = layoutClusteredRows(segment.rows, useXs);
    tables.push(layout.rows);
    if (layout.columnXs) {
      xs = layout.columnXs;
      inheritKind = segment.kind ?? inheritKind;
    } else if (segment.kind) {
      inheritKind = segment.kind;
    }
  }
  return { tables, inherit: { xs, kind: inheritKind } };
}

export function pageNeedsOcr(tables: unknown[][][], digitalChars: number): boolean {
  if (tables.some((table) => rowsLookLikeLedger(table))) return false;
  return digitalChars < PDF_EXTRACT_LIMITS.denseDigitalChars;
}

function digitalCharCount(tables: unknown[][][]): number {
  return tables
    .flat()
    .flat()
    .map((cell) => String(cell ?? ''))
    .join('')
    .replace(/\s/g, '').length;
}

export async function collectTextItemsFromStream(
  stream: ReadableStream<TextChunk>,
  session: PdfExtractSession,
  maxItems = MAX_PDF_ITEMS_PER_PAGE,
): Promise<PdfTextItem[]> {
  const reader = stream.getReader();
  session.attachReader(reader);
  const items: PdfTextItem[] = [];
  let seen = 0;
  try {
    while (true) {
      session.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      for (const item of value?.items ?? []) {
        seen += 1;
        if (seen > maxItems * 5) {
          await reader.cancel();
          throw new PdfExtractError('PDF_TOO_MANY_ROWS', 'PDF page has too many text items.');
        }
        if (items.length >= maxItems) {
          await reader.cancel();
          return items;
        }
        if (!item || typeof item !== 'object' || !('str' in item) || !(item as { str?: unknown }).str) {
          continue;
        }
        const record = item as { str: unknown; transform?: unknown; width?: unknown };
        const transform = Array.isArray(record.transform) ? record.transform : [];
        items.push({
          str: String(record.str),
          x: Number(transform[4] ?? 0),
          y: Number(transform[5] ?? 0),
          width: Number(record.width ?? 0),
        });
      }
    }
    return items;
  } finally {
    session.attachReader(null);
    try {
      reader.releaseLock();
    } catch {
      /* cancelled streams already release */
    }
  }
}

export async function extractPdfRows(buffer: Buffer): Promise<unknown[][]> {
  return (await extractPdfSheets(buffer)).flat();
}

export async function extractPdfSheets(buffer: Buffer): Promise<unknown[][][]> {
  return runWithDeadline(PDF_EXTRACT_TIMEOUT_MS, (session) => extractPdfSheetsUncapped(buffer, session));
}

async function extractPdfSheetsUncapped(
  buffer: Buffer,
  session: PdfExtractSession,
): Promise<unknown[][][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      maxImageSize: MAX_RENDER_PIXELS,
    }).promise;
  } catch {
    throw new PdfExtractError('UNREADABLE_PDF');
  }

  try {
    session.throwIfAborted();
    const pageCount = Math.min(document.numPages, MAX_PDF_PAGES);
    const pages: { pageNo: number; tables: unknown[][][]; needsOcr: boolean }[] = [];
    let inherit: { xs: number[] | null; kind: LedgerKind | null } = { xs: null, kind: null };
    let ocrBudget = MAX_OCR_PAGES;

    for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
      session.throwIfAborted();
      const page = await document.getPage(pageNo);
      const items = await collectTextItemsFromStream(
        page.streamTextContent({ disableNormalization: true }) as ReadableStream<TextChunk>,
        session,
      );
      const layout = tablesFromTextItems(items, inherit);
      inherit = layout.inherit;
      const chars = digitalCharCount(layout.tables);
      const needsOcr = pageNeedsOcr(layout.tables, chars) && ocrBudget > 0;
      if (needsOcr) ocrBudget -= 1;
      pages.push({ pageNo, tables: layout.tables, needsOcr });
    }

    if (pages.some((page) => page.needsOcr)) {
      await withOcrLock(async () => {
        session.markOcr();
        const worker = await getOcrWorker();
        for (const page of pages) {
          if (!page.needsOcr) continue;
          session.throwIfAborted();
          page.tables = await ocrPdfPage(document, page.pageNo, worker, session);
        }
      });
    }

    const tables: unknown[][][] = [];
    let totalRows = 0;
    for (const page of pages) {
      for (const table of page.tables) {
        totalRows += table.length;
        if (totalRows > MAX_PDF_ROWS) {
          throw new PdfExtractError('PDF_TOO_MANY_ROWS');
        }
        const last = tables[tables.length - 1];
        const tableKind = table.map(ledgerKindFromValues).find((value) => value != null);
        const lastKind = last?.map(ledgerKindFromValues).find((value) => value != null);
        if (last && ((tableKind && lastKind && tableKind === lastKind) || !tableKind)) {
          last.push(...table);
        } else {
          tables.push(table);
        }
      }
    }
    return tables.length ? tables : [[]];
  } finally {
    await closePdfDocument(document);
  }
}

async function ocrPdfPage(
  document: { getPage: (pageNo: number) => Promise<PdfJsPage> },
  pageNo: number,
  worker: Worker,
  session: PdfExtractSession,
): Promise<unknown[][][]> {
  const png = await renderPdfPage(document, pageNo, session);
  session.throwIfAborted();
  const result = await runWithDeadline(
    OCR_PAGE_TIMEOUT_MS,
    async () => worker.recognize(png, {}, OCR_OUTPUT_FORMATS),
    session,
  );
  const items = ocrWordsToTextItems(ocrWordsFromRecognizeData(result.data));
  return tablesFromTextItems(items).tables;
}

export async function ocrImageToWords(png: Buffer): Promise<OcrWordBox[]> {
  return withOcrLock(async () => {
    const worker = await getOcrWorker();
    const result = await worker.recognize(png, {}, OCR_OUTPUT_FORMATS);
    return ocrWordsFromRecognizeData(result.data);
  });
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

async function renderPdfPage(
  document: { getPage: (pageNo: number) => Promise<PdfJsPage> },
  pageNo: number,
  session: PdfExtractSession,
): Promise<Buffer> {
  session.throwIfAborted();
  const page = await document.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = renderScaleForPage(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({
    canvas,
    canvasContext: context,
    viewport,
  } as never);
  session.attachRender(task);
  try {
    await task.promise;
  } catch (error) {
    session.throwIfAborted();
    throw error;
  } finally {
    session.attachRender(null);
  }
  return canvas.toBuffer('image/png');
}

type PdfJsPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  streamTextContent: (params?: { disableNormalization?: boolean }) => ReadableStream<TextChunk>;
  render: (opts: never) => RenderTaskLike & { promise: Promise<unknown> };
};

function coerceCell(text: string): string | number {
  const compact = text.replace(/,/g, '').trim();
  if (/^-?\d+(\.\d+)?$/.test(compact)) {
    const parsed = Number(compact);
    if (Number.isFinite(parsed)) return parsed;
  }
  return text;
}

async function closePdfDocument(document: { destroy?: () => Promise<unknown>; cleanup?: () => unknown }): Promise<void> {
  if (typeof document.destroy === 'function') {
    await document.destroy();
    return;
  }
  document.cleanup?.();
}
