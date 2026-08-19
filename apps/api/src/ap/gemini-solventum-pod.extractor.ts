import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import {
  SolventumPodExtractor,
  type SolventumPodFile,
  type SolventumPodLine,
} from './solventum-pod.types';

const GATEWAY_BASE =
  'https://gateway.ai.cloudflare.com/v1/3724a3e71944b366a39b3735aa117a58/accord-aljeel-ap/google-ai-studio/v1beta';
const FLASH_MODEL = 'gemini-3.5-flash-lite';
const PRO_MODEL = 'gemini-3.1-pro-preview';
const MIN_CONFIDENCE = 0.8;

const lineSchema = z.object({
  trx: z.union([z.string(), z.number()]).transform(String),
  itemDescription: z.string(),
  manufacturer: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => (value == null ? '' : String(value))),
  lot: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => (value == null ? '' : String(value))),
  quantity: z.coerce.number().finite(),
  uom: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => (value == null ? '' : String(value))),
  sourceDoc: z.string(),
  confidence: z.coerce.number().min(0).max(1),
});
const linesSchema = z.array(lineSchema);

const EXTRACTION_PROMPT = `Extract every delivered line item from every page in this POD packet.
Documents may include Arabic/English NUPCO receipt vouchers and Aljeel proforma invoices.
Return ONLY a strict JSON array. Each object must have exactly these fields:
{"trx":"invoice/TRX number","itemDescription":"description","manufacturer":"manufacturer code","lot":"lot/batch number","quantity":0,"uom":"unit of measure","sourceDoc":"document/page evidence","confidence":0.0}
Do not use markdown. Do not infer lines that are not attested by the document. Use a confidence from 0 to 1.`;

@Injectable()
export class GeminiSolventumPodExtractor extends SolventumPodExtractor {
  private readonly logger = new Logger(GeminiSolventumPodExtractor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async extract(file: SolventumPodFile): Promise<SolventumPodLine[]> {
    const pdfSha256 = createHash('sha256').update(file.buffer).digest('hex');
    try {
      const cached = await this.prisma.solventumPodCache.findUnique({ where: { pdfSha256 } });
      if (cached) return linesSchema.parse(cached.lineItems);
    } catch (error) {
      this.logger.warn(`Solventum POD cache read skipped: ${String(error)}`);
    }

    let model = FLASH_MODEL;
    let lines = await this.tryExtract(file.buffer, model);
    if (!lines || lines.length === 0 || lines.some((line) => line.confidence < MIN_CONFIDENCE)) {
      model = PRO_MODEL;
      lines = await this.tryExtract(file.buffer, model);
    }
    if (!lines || lines.length === 0) {
      throw new BadGatewayException({
        code: 'SOLVENTUM_POD_EXTRACTION_FAILED',
        message: `No reliable delivered lines could be extracted from ${file.originalname}.`,
      });
    }

    const cachedLines = lines as unknown as Prisma.InputJsonValue;
    try {
      await this.prisma.solventumPodCache.upsert({
        where: { pdfSha256 },
        create: { pdfSha256, lineItems: cachedLines, model },
        update: { lineItems: cachedLines, model },
      });
    } catch (error) {
      this.logger.warn(`Solventum POD cache write skipped: ${String(error)}`);
    }
    return lines;
  }

  private async tryExtract(pdf: Buffer, model: string): Promise<SolventumPodLine[] | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BadGatewayException({
        code: 'SOLVENTUM_GEMINI_NOT_CONFIGURED',
        message: 'GEMINI_API_KEY is not configured.',
      });
    }
    try {
      const response = await fetch(`${GATEWAY_BASE}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: EXTRACTION_PROMPT },
                { inline_data: { mime_type: 'application/pdf', data: pdf.toString('base64') } },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
      if (!text) return null;
      return this.parseJson(text, model);
    } catch {
      return null;
    }
  }

  private parseJson(text: string, model: string): SolventumPodLine[] | null {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start < 0 || end < start) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }

    const result = linesSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.error(`Gemini POD response from ${model} failed validation: ${result.error.message}`);
      return null;
    }
    return result.data;
  }
}
