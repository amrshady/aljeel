import { Injectable } from '@nestjs/common';
import {
  extractJawalInvoiceLines,
  isSpreadsheetFileName,
  isUnsafeEvidenceFileName,
  isXlsxFileName,
  looksLikeJawalWorkbook,
  sanitizeEvidenceRelativePath,
  sniffContainerMagic,
  sniffPdfBuffer,
  validateJawalEvidencePack,
  type JawalEvidenceFileMeta,
  type JawalEvidenceValidation,
} from '@aljeel/shared-types';
import { Readable } from 'node:stream';
import * as XLSX from 'xlsx';
import { KbStorageService } from '../kb/kb-storage.service';
import { StorageService } from '../storage/storage.service';

interface InvoiceDocument {
  fileName: string;
  storageKey: string;
  sizeBytes?: number;
}

@Injectable()
export class JawalEvidenceCheckService {
  constructor(
    private readonly storage: StorageService,
    private readonly kb: KbStorageService,
  ) {}

  async validateUploadedFolder(
    documents: InvoiceDocument[],
  ): Promise<JawalEvidenceValidation> {
    const spreadsheetDocuments = documents.filter((document) =>
      isSpreadsheetFileName(document.fileName),
    );

    if (spreadsheetDocuments.length === 0) {
      return {
        error: {
          code: 'JAWAL_TABLE_REQUIRED',
          message:
            'Upload a Jawal travel spreadsheet with Ref.No and Ticket columns, plus the evidence folder tree.',
        },
        warning: null,
        findings: [
          {
            code: 'JAWAL_TABLE_REQUIRED',
            message:
              'Upload a Jawal travel spreadsheet with Ref.No and Ticket columns, plus the evidence folder tree.',
            gate: 'B',
            rule: 'B1',
          },
        ],
      };
    }

    let lines: ReturnType<typeof extractJawalInvoiceLines> = [];
    let sourceSpreadsheet: string | undefined;
    const fileMetas: JawalEvidenceFileMeta[] = [];

    for (const document of documents) {
      const meta: JawalEvidenceFileMeta = {
        fileName: sanitizeEvidenceRelativePath(document.fileName),
        sizeBytes: document.sizeBytes ?? 0,
        unsafeName: isUnsafeEvidenceFileName(document.fileName),
        zeroBytes: (document.sizeBytes ?? 0) <= 0,
      };

      const needsBytes =
        isXlsxFileName(document.fileName) ||
        /\.(pdf|msg|eml|xlsx|xlsm|xls|png|jpe?g|gif|webp|tiff?|bmp)$/i.test(
          document.fileName,
        );

      if (needsBytes) {
        try {
          const buffer = await this.readDocumentBuffer(document.storageKey);
          meta.sizeBytes = buffer.length;
          meta.zeroBytes = buffer.length <= 0;

          const sniff = sniffContainerMagic(document.fileName, buffer);
          if (!sniff.ok) {
            if (/\.pdf$/i.test(document.fileName)) {
              meta.pdfInvalid = true;
            } else if (isSpreadsheetFileName(document.fileName)) {
              meta.workbookInvalid = true;
            } else {
              meta.magicMismatch = true;
            }
          }

          if (isXlsxFileName(document.fileName) && !meta.workbookInvalid) {
            try {
              const sheets = this.parseWorkbookSheets(buffer);
              if (looksLikeJawalWorkbook(sheets)) {
                const extracted = extractJawalInvoiceLines(sheets);
                if (extracted.length > 0 || lines.length === 0) {
                  sourceSpreadsheet = document.fileName;
                  lines = extracted;
                }
              }
            } catch {
              meta.workbookInvalid = true;
            }
          }

          if (/\.pdf$/i.test(document.fileName) && !meta.pdfInvalid) {
            const pdf = sniffPdfBuffer(buffer);
            if (!pdf.ok) meta.pdfInvalid = true;
          }
        } catch {
          // Spreadsheet parse is required for Gate B; other read failures are infra,
          // not vendor evidence defects — skip magic-byte flags in that case.
          if (isSpreadsheetFileName(document.fileName)) {
            meta.workbookInvalid = true;
          }
        }
      }

      fileMetas.push(meta);
    }

    if (!sourceSpreadsheet && spreadsheetDocuments.length > 0) {
      return {
        error: {
          code: 'JAWAL_TABLE_REQUIRED',
          message:
            'None of the uploaded spreadsheets contain Ref.No and Ticket columns required for Jawal evidence checks.',
        },
        warning: null,
        findings: [
          {
            code: 'JAWAL_TABLE_REQUIRED',
            message:
              'None of the uploaded spreadsheets contain Ref.No and Ticket columns required for Jawal evidence checks.',
            gate: 'B',
            rule: 'B1',
          },
        ],
      };
    }

    const result = validateJawalEvidencePack({
      lines,
      files: fileMetas,
      sourceSpreadsheet,
    });

    if (result.error) {
      return {
        ...result,
        error: {
          ...result.error,
          details: {
            ...result.error.details,
            sourceSpreadsheet,
          },
        },
        warning: result.warning
          ? {
              ...result.warning,
              details: {
                ...result.warning.details,
                sourceSpreadsheet,
              },
            }
          : null,
      };
    }

    return result.warning
      ? {
          ...result,
          warning: {
            ...result.warning,
            details: {
              ...result.warning.details,
              sourceSpreadsheet,
            },
          },
        }
      : result;
  }

  private parseWorkbookSheets(buffer: Buffer): unknown[][][] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    return workbook.SheetNames.map((sheetName) =>
      XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, {
        header: 1,
        defval: null,
        raw: true,
      }) as unknown[][],
    );
  }

  private async readDocumentBuffer(storageKey: string): Promise<Buffer> {
    const stream = storageKey.startsWith('invoices/')
      ? await this.kb.createReadStream(storageKey)
      : this.storage.createReadStream(storageKey.replace(/^local:/, ''));
    return this.streamToBuffer(stream);
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
