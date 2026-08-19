import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { GeminiSolventumPodExtractor } from './gemini-solventum-pod.extractor';
import { LocalSolventumPodExtractor } from './local-solventum-pod.extractor';
import {
  SolventumPodExtractor,
  type SolventumPodFile,
  type SolventumPodLine,
} from './solventum-pod.types';

/**
 * Free-first POD extractor:
 * 1) local PDF text / Tesseract ara+eng OCR
 * 2) optional Gemini fallback when GEMINI_API_KEY is set and local fails
 */
@Injectable()
export class CompositeSolventumPodExtractor extends SolventumPodExtractor {
  private readonly logger = new Logger(CompositeSolventumPodExtractor.name);

  constructor(
    private readonly local: LocalSolventumPodExtractor,
    private readonly gemini: GeminiSolventumPodExtractor,
  ) {
    super();
  }

  async extract(file: SolventumPodFile): Promise<SolventumPodLine[]> {
    try {
      return await this.local.extract(file);
    } catch (localError) {
      this.logger.warn(
        `Local POD extraction failed for ${file.originalname}: ${String(localError)}`,
      );
      if (!process.env.GEMINI_API_KEY) {
        if (localError instanceof BadGatewayException) throw localError;
        throw new BadGatewayException({
          code: 'SOLVENTUM_POD_EXTRACTION_FAILED',
          message: `Local POD extraction failed for ${file.originalname}: ${
            localError instanceof Error ? localError.message : String(localError)
          }`,
        });
      }
      try {
        return await this.gemini.extract(file);
      } catch (geminiError) {
        this.logger.error(
          `Gemini POD fallback failed for ${file.originalname}: ${String(geminiError)}`,
        );
        throw new BadGatewayException({
          code: 'SOLVENTUM_POD_EXTRACTION_FAILED',
          message: `Could not extract delivered lines from ${file.originalname} via local OCR or Gemini.`,
        });
      }
    }
  }
}
