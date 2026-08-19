import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  extractTrxFromFilename,
  isPlausibleDeliveredQuantity,
  normalizeArabicIndicDigits,
  parsePodTextToLines,
} from './solventum-pod-parse';
import {
  SolventumPodExtractor,
  type SolventumPodFile,
  type SolventumPodLine,
} from './solventum-pod.types';

const MIN_TEXT_CHARS = 80;
const MAX_OCR_PAGES = 6;
const RENDER_SCALE = 3.0;

/** Serialize OCR so parallel POD uploads don't stomp each other. */
let ocrChain: Promise<unknown> = Promise.resolve();
function withOcrLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = ocrChain.then(fn, fn);
  ocrChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

@Injectable()
export class LocalSolventumPodExtractor extends SolventumPodExtractor {
  private readonly logger = new Logger(LocalSolventumPodExtractor.name);
  private worker: Worker | null = null;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async extract(file: SolventumPodFile): Promise<SolventumPodLine[]> {
    const pdfSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const cached = await this.readCache(pdfSha256);
    if (cached?.model?.includes('-v4')) {
      const cachedLines = (cached.lineItems as unknown as SolventumPodLine[]).filter((line) =>
        isPlausibleDeliveredQuantity(line.quantity, line.manufacturer, line.itemDescription),
      );
      if (cachedLines.length > 0) return cachedLines;
    }

    const filenameTrx = extractTrxFromFilename(file.originalname);
    let model = 'local-text-v4';
    let text = await this.extractDigitalText(file.buffer);
    let confidence = 0.92;

    if (text.replace(/\s+/g, '').length < MIN_TEXT_CHARS) {
      try {
        model = 'local-ocr-tesseractjs-v4';
        text = await withOcrLock(() => this.ocrPdf(file.buffer, file.originalname));
        confidence = 0.8;
      } catch (error) {
        this.logger.warn(`OCR skipped for ${file.originalname}: ${String(error)}`);
        text = '';
      }
    }

    text = normalizeArabicIndicDigits(text);
    const lines = parsePodTextToLines(text, file.originalname, filenameTrx, confidence);
    if (lines.length > 0) {
      await this.writeCache(pdfSha256, lines, model);
      return lines;
    }

    if (filenameTrx.length > 0) {
      return filenameTrx.map((trx) => ({
        trx,
        itemDescription: '',
        manufacturer: '',
        lot: '',
        quantity: 0,
        uom: '',
        sourceDoc: `${file.originalname}#filename`,
        confidence: 0.4,
      }));
    }

    throw new BadGatewayException({
      code: 'SOLVENTUM_POD_EXTRACTION_FAILED',
      message: `No delivered lines or TRX numbers could be extracted from ${file.originalname}.`,
    });
  }

  private async readCache(pdfSha256: string) {
    try {
      return await this.prisma.solventumPodCache.findUnique({ where: { pdfSha256 } });
    } catch (error) {
      this.logger.warn(`Solventum POD cache read skipped: ${String(error)}`);
      return null;
    }
  }

  private async writeCache(pdfSha256: string, lines: SolventumPodLine[], model: string) {
    try {
      await this.prisma.solventumPodCache.upsert({
        where: { pdfSha256 },
        create: {
          pdfSha256,
          lineItems: lines as unknown as Prisma.InputJsonValue,
          model,
        },
        update: {
          lineItems: lines as unknown as Prisma.InputJsonValue,
          model,
        },
      });
    } catch (error) {
      this.logger.warn(`Solventum POD cache write skipped: ${String(error)}`);
    }
  }

  private async extractDigitalText(pdf: Buffer): Promise<string> {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(pdf),
        useSystemFonts: true,
      }).promise;
      const parts: string[] = [];
      for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
        const page = await doc.getPage(pageNo);
        const content = await page.getTextContent();
        parts.push(
          content.items.map((item) => ('str' in item ? String(item.str) : '')).join(' '),
        );
      }
      return parts.join('\n');
    } catch (error) {
      this.logger.warn(`pdfjs text extraction failed: ${String(error)}`);
      return '';
    }
  }

  private async getWorker(): Promise<Worker> {
    if (this.worker) return this.worker;
    try {
      this.worker = await createWorker('ara+eng', 1, {
        logger: () => undefined,
      });
      await this.worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      });
    } catch (error) {
      this.logger.warn(`Arabic+English OCR init failed, falling back to eng: ${String(error)}`);
      this.worker = await createWorker('eng', 1, {
        logger: () => undefined,
      });
      await this.worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      });
    }
    return this.worker;
  }

  private async ocrPdf(pdf: Buffer, originalname: string): Promise<string> {
    const pages = await this.renderPdfPageBuffers(pdf);
    if (pages.length === 0) {
      throw new BadGatewayException({
        code: 'SOLVENTUM_POD_OCR_RENDER_FAILED',
        message: `Could not render scanned pages for OCR from ${originalname}.`,
      });
    }

    const worker = await this.getWorker();
    const chunks: string[] = [];
    for (const [index, png] of pages.entries()) {
      const result = await worker.recognize(png);
      chunks.push(normalizeArabicIndicDigits(result.data.text ?? ''));
      this.logger.debug(
        `OCR page ${index + 1}/${pages.length} for ${originalname}: ${result.data.text?.length ?? 0} chars`,
      );
    }

    const text = chunks.join('\n');
    if (text.replace(/\s+/g, '').length < 20) {
      try {
        const dir = join(process.cwd(), 'storage', 'solventum-ocr-debug');
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${Date.now()}-${originalname}.png`), pages[0]!);
      } catch {
        // ignore
      }
      throw new BadGatewayException({
        code: 'SOLVENTUM_POD_OCR_EMPTY',
        message: `OCR produced little/no text for ${originalname}.`,
      });
    }
    return text;
  }

  private async renderPdfPageBuffers(pdf: Buffer): Promise<Buffer[]> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(pdf),
      useSystemFonts: true,
    }).promise;
    const pageCount = Math.min(doc.numPages, MAX_OCR_PAGES);
    const pages: Buffer[] = [];

    for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      // White background improves OCR on scanned POD pages.
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
}
