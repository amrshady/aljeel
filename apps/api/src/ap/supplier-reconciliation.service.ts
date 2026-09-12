import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  extractInvoiceNumber,
  isTotalLabel,
  paymentDetailsFileName,
  reconcileSupplierStatement,
  type AljeelInvoiceLine,
  type SupplierStatementLine,
} from './supplier-reconciliation';
import { buildSupplierReconWorkbook, COMPANY_NAME } from './supplier-reconciliation-workbook';

export { COMPANY_NAME };

interface UploadedWorkbook {
  originalname: string;
  buffer: Buffer;
}

type SheetKind = 'aljeel' | 'supplier' | 'other';

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .replace(/[\u202d\u202c\u200e\u200f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[:.]+$/g, '');

@Injectable()
export class SupplierReconciliationService {
  async reconcileWorkbooks(files: UploadedWorkbook[]): Promise<{ output: Buffer; fileName: string }> {
    const parsed = this.parseInputs(files);
    const result = reconcileSupplierStatement(parsed.aljeel, parsed.supplier, {
      asOfDate: parsed.asOfDate,
      currency: parsed.currency,
    });
    return {
      output: await buildSupplierReconWorkbook(result),
      fileName: paymentDetailsFileName(result.booksBalance),
    };
  }

  parseInputs(files: UploadedWorkbook[]): {
    aljeel: AljeelInvoiceLine[];
    supplier: SupplierStatementLine[];
    asOfDate: string;
    currency: string;
  } {
    if (!files.length) {
      throw new BadRequestException({
        code: 'SUPPLIER_RECON_FILES_INVALID',
        message: 'Upload one workbook with both ledgers, or two Excel files (Aljeel export + supplier statement).',
      });
    }

    let aljeel: AljeelInvoiceLine[] | null = null;
    let supplier: SupplierStatementLine[] | null = null;

    for (const file of files) {
      const workbook = this.readWorkbook(file);
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, {
          header: 1,
          defval: null,
          raw: true,
        });
        const kind = this.detectSheetKind(rows);
        if (kind === 'aljeel') {
          if (aljeel) {
            throw new BadRequestException({
              code: 'SUPPLIER_RECON_DUPLICATE_ALJEEL',
              message: 'More than one Aljeel Oracle export sheet was found. Upload a single Aljeel export.',
            });
          }
          aljeel = this.parseAljeelSheet(rows);
        } else if (kind === 'supplier') {
          if (supplier) {
            throw new BadRequestException({
              code: 'SUPPLIER_RECON_DUPLICATE_SUPPLIER',
              message: 'More than one supplier statement sheet was found. Upload a single supplier ledger.',
            });
          }
          supplier = this.parseSupplierSheet(rows);
        }
      }
    }

    if (!aljeel?.length) {
      throw new BadRequestException({
        code: 'SUPPLIER_RECON_ALJEEL_MISSING',
        message:
          'Could not find an Aljeel Oracle export (a sheet with Invoice Number and Unpaid Amount).',
      });
    }
    if (!supplier?.length) {
      throw new BadRequestException({
        code: 'SUPPLIER_RECON_SUPPLIER_MISSING',
        message:
          'Could not find a supplier statement (a sheet with invoice numbers in البيان / description and amounts).',
      });
    }

    return {
      aljeel,
      supplier,
      asOfDate: new Date().toISOString().slice(0, 10),
      currency: 'SAR',
    };
  }

  private readWorkbook(file: UploadedWorkbook): XLSX.WorkBook {
    try {
      return XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    } catch {
      throw new BadRequestException({
        code: 'SUPPLIER_RECON_WORKBOOK_INVALID',
        message: `Could not read Excel workbook: ${file.originalname}`,
      });
    }
  }

  private detectSheetKind(rows: unknown[][]): SheetKind {
    const header = this.findHeaderRow(rows);
    if (!header) return 'other';
    const labels = new Set(header.cells.map(normalizeHeader).filter(Boolean));
    if (labels.has('invoice number') && (labels.has('unpaid amount') || labels.has('invoice amount'))) {
      return 'aljeel';
    }
    if (labels.has('البيان') || (labels.has('مدين') && labels.has('تاريخ المعاملة'))) {
      return 'supplier';
    }
    if (labels.has('doc.no') || labels.has('balance per books')) {
      return 'other';
    }
    return 'other';
  }

  private findHeaderRow(rows: unknown[][]): { index: number; cells: unknown[] } | null {
    for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
      const cells = rows[index] ?? [];
      const labels = cells.map(normalizeHeader);
      if (
        labels.includes('invoice number') ||
        labels.includes('البيان') ||
        labels.includes('مدين')
      ) {
        return { index, cells };
      }
    }
    return null;
  }

  private parseAljeelSheet(rows: unknown[][]): AljeelInvoiceLine[] {
    const header = this.findHeaderRow(rows);
    if (!header) return [];
    const indexOf = (name: string) =>
      header.cells.findIndex((cell) => normalizeHeader(cell) === name);

    const invoiceIdx = indexOf('invoice number');
    const unpaidIdx = indexOf('unpaid amount');
    const amountIdx = indexOf('invoice amount');
    const prepayIdx = indexOf('prepayment available amount');
    const supplierIdx = indexOf('supplier or party');
    const dateIdx = indexOf('invoice date');
    if (invoiceIdx < 0) return [];

    const lines: AljeelInvoiceLine[] = [];
    for (const row of rows.slice(header.index + 1)) {
      const invoiceNumber = extractInvoiceNumber(row[invoiceIdx]);
      if (!invoiceNumber || isTotalLabel(row[invoiceIdx]) || isTotalLabel(row[unpaidIdx])) continue;
      const invoiceAmount = this.asNumber(row[amountIdx] ?? row[unpaidIdx]);
      const unpaidAmount = this.asNumber(row[unpaidIdx] ?? row[amountIdx]);
      if (invoiceAmount == null && unpaidAmount == null) continue;
      lines.push({
        invoiceNumber,
        date: this.asDate(row[dateIdx]),
        supplierName: this.asText(row[supplierIdx]),
        unpaidAmount: unpaidAmount ?? invoiceAmount ?? 0,
        invoiceAmount: invoiceAmount ?? unpaidAmount ?? 0,
        prepaymentAvailable: this.asNumber(row[prepayIdx]) ?? 0,
      });
    }
    return lines;
  }

  private parseSupplierSheet(rows: unknown[][]): SupplierStatementLine[] {
    const header = this.findHeaderRow(rows);
    if (!header) return [];
    const indexOf = (...names: string[]) =>
      header.cells.findIndex((cell) => names.includes(normalizeHeader(cell)));

    const descriptionIdx = indexOf('البيان', 'description', 'invoice no', 'invoice number');
    const amountIdx = indexOf('مدين', 'amount', 'debit');
    const dateIdx = indexOf('تاريخ المعاملة', 'date');
    const notesIdx = indexOf('ملاحظات', 'notes', 'remarks');
    const extractedIdx = header.cells.findIndex(
      (_cell, index) => index > Math.max(descriptionIdx, 0) && extractInvoiceNumber(rows[header.index + 1]?.[index]),
    );

    const lines: SupplierStatementLine[] = [];
    for (const row of rows.slice(header.index + 1)) {
      const invoiceNumber =
        extractInvoiceNumber(descriptionIdx >= 0 ? row[descriptionIdx] : null) ??
        (extractedIdx >= 0 ? extractInvoiceNumber(row[extractedIdx]) : null);
      if (!invoiceNumber) continue;
      if (isTotalLabel(row[descriptionIdx]) || isTotalLabel(row[amountIdx])) continue;
      const amount = this.asNumber(amountIdx >= 0 ? row[amountIdx] : null);
      if (amount == null) continue;
      lines.push({
        invoiceNumber,
        date: this.asDate(dateIdx >= 0 ? row[dateIdx] : null),
        amount,
        description: this.asText(descriptionIdx >= 0 ? row[descriptionIdx] : null),
        notes: this.asText(notesIdx >= 0 ? row[notesIdx] : null),
      });
    }
    return lines;
  }

  private asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value ?? '').replace(/,/g, '').trim();
    if (!text) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private asText(value: unknown): string | null {
    const text = String(value ?? '').trim();
    return text ? text : null;
  }

  private asDate(value: unknown): string | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) return null;
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
    const text = String(value ?? '').trim();
    return text || null;
  }
}
