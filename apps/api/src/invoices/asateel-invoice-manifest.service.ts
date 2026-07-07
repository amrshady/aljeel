import { Injectable } from '@nestjs/common';
import {
  extractInvoiceNumbersFromWorkbookSheets,
  isSpreadsheetFileName,
  isXlsxFileName,
  validateAsateelInvoiceManifest,
  type AsateelInvoiceManifestIssue,
} from '@aljeel/shared-types';
import { Readable } from 'node:stream';
import * as XLSX from 'xlsx';
import { KbStorageService } from '../kb/kb-storage.service';
import { StorageService } from '../storage/storage.service';

interface InvoiceDocument {
  fileName: string;
  storageKey: string;
}

@Injectable()
export class AsateelInvoiceManifestService {
  constructor(
    private readonly storage: StorageService,
    private readonly kb: KbStorageService,
  ) {}

  async validateUploadedFolder(
    documents: InvoiceDocument[],
  ): Promise<AsateelInvoiceManifestIssue | null> {
    const fileNames = documents.map((document) => document.fileName);
    const spreadsheetDocuments = documents.filter((document) =>
      isSpreadsheetFileName(document.fileName),
    );

    if (spreadsheetDocuments.length === 0) {
      return {
        code: 'ASATEEL_INVOICE_TABLE_REQUIRED',
        message:
          'Upload a spreadsheet containing the Asateel shipping report with an Invoice No column.',
      };
    }

    const invoiceNos = new Set<string>();
    let sourceSpreadsheet: string | undefined;
    for (const document of spreadsheetDocuments) {
      if (!isXlsxFileName(document.fileName)) {
        continue;
      }
      const buffer = await this.readDocumentBuffer(document.storageKey);
      const sheets = this.parseWorkbookSheets(buffer);
      const extracted = extractInvoiceNumbersFromWorkbookSheets(sheets);
      if (extracted.length === 0) {
        continue;
      }
      sourceSpreadsheet = document.fileName;
      for (const invoiceNo of extracted) {
        invoiceNos.add(invoiceNo);
      }
    }

    if (invoiceNos.size === 0) {
      return {
        code: 'ASATEEL_INVOICE_TABLE_REQUIRED',
        message:
          'None of the uploaded spreadsheets contain an Invoice No column with invoice numbers.',
      };
    }

    const manifestIssue = validateAsateelInvoiceManifest([...invoiceNos], fileNames);
    if (!manifestIssue) {
      return null;
    }

    return {
      ...manifestIssue,
      details: {
        ...manifestIssue.details,
        sourceSpreadsheet,
      },
    };
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
