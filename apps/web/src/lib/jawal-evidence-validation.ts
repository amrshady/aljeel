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
import * as XLSX from 'xlsx';

export interface LocalJawalEvidenceFile {
  file: File;
  relativePath?: string;
}

function fileLabel(item: LocalJawalEvidenceFile): string {
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

async function inspectFile(item: LocalJawalEvidenceFile): Promise<JawalEvidenceFileMeta> {
  const label = sanitizeEvidenceRelativePath(fileLabel(item));
  const meta: JawalEvidenceFileMeta = {
    fileName: label,
    sizeBytes: item.file.size,
    zeroBytes: item.file.size <= 0,
    unsafeName: isUnsafeEvidenceFileName(fileLabel(item)),
  };

  if (item.file.size <= 0) return meta;

  const needsBytes =
    isXlsxFileName(label) || /\.(pdf|msg|xlsx|xlsm|xls)$/i.test(label);
  if (!needsBytes) return meta;

  const bytes = new Uint8Array(await item.file.arrayBuffer());
  const sniff = sniffContainerMagic(label, bytes);
  if (!sniff.ok) {
    if (/\.pdf$/i.test(label)) meta.pdfInvalid = true;
    else if (isSpreadsheetFileName(label)) meta.workbookInvalid = true;
    else meta.magicMismatch = true;
  }
  if (/\.pdf$/i.test(label) && !meta.pdfInvalid) {
    const pdf = sniffPdfBuffer(bytes);
    if (!pdf.ok) meta.pdfInvalid = true;
  }

  return meta;
}

/**
 * Parse local folder uploads and run the Jawal Gates A/B checker.
 * Returns null when the folder does not look like a Jawal evidence pack
 * (no Ref.No + Ticket spreadsheet found).
 */
export async function validateLocalJawalEvidence(
  files: LocalJawalEvidenceFile[],
): Promise<JawalEvidenceValidation | null> {
  const xlsxItems = files.filter((item) => isXlsxFileName(fileLabel(item)));
  if (xlsxItems.length === 0) return null;

  let lines: ReturnType<typeof extractJawalInvoiceLines> = [];
  let sourceSpreadsheet: string | undefined;
  let foundJawalTable = false;

  for (const item of xlsxItems) {
    try {
      const sheets = await parseXlsxSheets(item.file);
      if (!looksLikeJawalWorkbook(sheets)) continue;
      foundJawalTable = true;
      const extracted = extractJawalInvoiceLines(sheets);
      sourceSpreadsheet = fileLabel(item);
      lines = extracted;
      break;
    } catch {
      // Workbook open failures are recorded via Gate A on the file meta below.
    }
  }

  if (!foundJawalTable) return null;

  const fileMetas = await Promise.all(files.map((item) => inspectFile(item)));

  // Mark unreadable Jawal spreadsheets.
  for (const item of xlsxItems) {
    const label = sanitizeEvidenceRelativePath(fileLabel(item));
    const meta = fileMetas.find((file) => file.fileName === label);
    if (!meta) continue;
    try {
      await parseXlsxSheets(item.file);
    } catch {
      meta.workbookInvalid = true;
    }
  }

  return validateJawalEvidencePack({
    lines,
    files: fileMetas,
    sourceSpreadsheet,
  });
}
