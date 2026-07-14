export const MIN_INVOICE_SUBMIT_XLSX_COUNT = 2;

export type InvoiceSubmitDocumentIssueCode = 'DOCUMENTS_REQUIRED' | 'XLSX_REQUIRED';

export interface InvoiceSubmitDocumentIssue {
  code: InvoiceSubmitDocumentIssueCode;
  message: string;
}

export interface ValidateInvoiceSubmitDocumentsOptions {
  /**
   * When true, skip the dual-.xlsx rule (used for Jawal — their Gate B
   * requires the travel spreadsheet, but not a second workbook).
   */
  skipXlsxRequirement?: boolean;
}

export function isXlsxFileName(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith('.xlsx');
}

/** Validates invoice folder contents before submit (at least one file; two .xlsx unless skipped). */
export function validateInvoiceSubmitDocuments(
  fileNames: string[],
  options?: ValidateInvoiceSubmitDocumentsOptions,
): InvoiceSubmitDocumentIssue | null {
  if (fileNames.length === 0) {
    return {
      code: 'DOCUMENTS_REQUIRED',
      message: 'At least one document must be attached before submitting.',
    };
  }

  if (options?.skipXlsxRequirement) {
    return null;
  }

  const xlsxCount = fileNames.filter(isXlsxFileName).length;
  if (xlsxCount < MIN_INVOICE_SUBMIT_XLSX_COUNT) {
    return {
      code: 'XLSX_REQUIRED',
      message: `At least ${MIN_INVOICE_SUBMIT_XLSX_COUNT} Excel (.xlsx) files are required before submitting.`,
    };
  }

  return null;
}
