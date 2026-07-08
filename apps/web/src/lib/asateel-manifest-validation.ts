import {
  extractInvoiceNumbersFromWorkbookSheets,
  isXlsxFileName,
  validateAsateelInvoiceManifest,
  type AsateelInvoiceManifestValidation,
} from '@aljeel/shared-types';
import * as XLSX from 'xlsx';

export interface LocalManifestFile {
  file: File;
  relativePath?: string;
}

function fileLabel(item: LocalManifestFile): string {
  return item.relativePath ?? item.file.name;
}

async function parseXlsxSheets(file: File): Promise<unknown[][][]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return workbook.SheetNames.map((sheetName) =>
    XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][],
  );
}

/**
 * Parse local .xlsx files and verify every Invoice No has a matching attachment
 * in the selected folder. Returns null when the folder does not look like an
 * Asateel manifest (no Invoice No column found).
 */
export async function validateLocalAsateelManifest(
  files: LocalManifestFile[],
): Promise<AsateelInvoiceManifestValidation | null> {
  const fileNames = files.map(fileLabel);
  const xlsxItems = files.filter((item) => isXlsxFileName(fileLabel(item)));

  if (xlsxItems.length === 0) {
    return null;
  }

  const invoiceNos = new Set<string>();
  let foundInvoiceColumn = false;

  for (const item of xlsxItems) {
    const sheets = await parseXlsxSheets(item.file);
    const extracted = extractInvoiceNumbersFromWorkbookSheets(sheets);
    if (extracted.length === 0) {
      continue;
    }
    foundInvoiceColumn = true;
    for (const invoiceNo of extracted) {
      invoiceNos.add(invoiceNo);
    }
  }

  if (!foundInvoiceColumn) {
    return null;
  }

  return validateAsateelInvoiceManifest([...invoiceNos], fileNames);
}
