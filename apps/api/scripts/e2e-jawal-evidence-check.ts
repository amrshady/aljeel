#!/usr/bin/env npx tsx
/**
 * Live end-to-end check for the Jawal Gates A/B upload checker.
 *
 * Exercises the same gate path submit uses:
 *   validateInvoiceSubmitDocuments → JawalEvidenceCheckService.validateUploadedFolder
 * against real Postgres + on-disk local storage (no Nest DI — tsx lacks decorator metadata).
 *
 *   cd apps/api && npx tsx scripts/e2e-jawal-evidence-check.ts
 */
import { config } from 'dotenv';
import { resolve, join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import {
  validateInvoiceSubmitDocuments,
  type JawalEvidenceValidation,
} from '@aljeel/shared-types';
import { StorageService } from '../src/storage/storage.service';
import { KbStorageService } from '../src/kb/kb-storage.service';
import { JawalEvidenceCheckService } from '../src/invoices/jawal-evidence-check.service';

config({ path: resolve(__dirname, '../.env') });
process.env.STORAGE_DIR ??= './storage';

const SUPPLIER_ID = 'supplier_jawal';
const USER_ID = 'user_supplier_jawal';
const USER_EMAIL = 'admin@jawal.com';
const STORAGE_ROOT = resolve(process.cwd(), process.env.STORAGE_DIR || './storage');

type Scenario = {
  name: string;
  expect: 'PASS' | 'FAIL';
  expectCode?: string;
  lines: Array<[string, string, string, string, string]>;
  files: Array<{
    relativePath: string;
    kind: 'xlsx' | 'pdf' | 'msg' | 'bytes';
    content?: Buffer;
  }>;
};

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
}

function buildWorkbook(rows: Array<[string, string, string, string, string]>): Buffer {
  const grid = [['Ref.No', 'Ticket', 'Description', 'Account', 'Type'], ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Lines');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

function minimalPdf(label: string): Buffer {
  const body = `BT /F1 12 Tf 50 750 Td (${label.replace(/[()\\]/g, '')}) Tj ET`;
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n',
    `4 0 obj<< /Length ${body.length} >>stream\n${body}\nendstream\nendobj\n`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function minimalMsg(): Buffer {
  const buf = Buffer.alloc(512, 0);
  buf[0] = 0xd0;
  buf[1] = 0xcf;
  buf[2] = 0x11;
  buf[3] = 0xe0;
  buf[4] = 0xa1;
  buf[5] = 0xb1;
  buf[6] = 0x1a;
  buf[7] = 0xe1;
  return buf;
}

function dummyXlsx(label: string): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([['Note'], [label]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Meta');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

/** Mirror invoices.service.submit gate for JAWAL suppliers. */
async function runSubmitGate(
  jawalEvidence: JawalEvidenceCheckService,
  documents: Array<{ fileName: string; storageKey: string; sizeBytes: number }>,
): Promise<{ ok: true } | { ok: false; code: string; message: string; details?: unknown }> {
  const documentIssue = validateInvoiceSubmitDocuments(
    documents.map((d) => d.fileName),
    { skipXlsxRequirement: true },
  );
  if (documentIssue) {
    return { ok: false, code: documentIssue.code, message: documentIssue.message };
  }

  const evidence: JawalEvidenceValidation =
    await jawalEvidence.validateUploadedFolder(documents);
  if (evidence.error) {
    return {
      ok: false,
      code: evidence.error.code,
      message: evidence.error.message,
      details: evidence.error.details,
    };
  }
  return { ok: true };
}

const scenarios: Scenario[] = [
  {
    name: 'B1a malformed CE-202-26 blocks (no auto-fix)',
    expect: 'FAIL',
    expectCode: 'JAWAL_REF_MALFORMED',
    lines: [['CE-202-26', '6905428831', 'Staff travel', '51000001', 'Travel']],
    files: [
      { relativePath: 'invoice-source.xlsx', kind: 'xlsx' },
      { relativePath: 'summary.xlsx', kind: 'bytes', content: dummyXlsx('summary') },
      { relativePath: 'CE-20-2026/approval.msg', kind: 'msg' },
      { relativePath: 'CE-20-2026/eticket.pdf', kind: 'pdf' },
    ],
  },
  {
    name: 'B4 event/sponsorship .msg alone blocks (OPEX required)',
    expect: 'FAIL',
    expectCode: 'JAWAL_APPROVAL_MISSING',
    lines: [['CE-20-2026', '', 'Annual sponsorship gala', '60307021', 'Event']],
    files: [
      { relativePath: 'invoice-source.xlsx', kind: 'xlsx' },
      { relativePath: 'summary.xlsx', kind: 'bytes', content: dummyXlsx('summary') },
      { relativePath: 'CE-20-2026/thread.msg', kind: 'msg' },
      { relativePath: 'CE-20-2026/eticket.pdf', kind: 'pdf' },
    ],
  },
  {
    name: 'Travel line with .msg + PDF passes',
    expect: 'PASS',
    lines: [['SIS-14', '6905428831', 'Staff travel RUH-JED', '51000001', 'Travel']],
    files: [
      { relativePath: 'invoice-source.xlsx', kind: 'xlsx' },
      { relativePath: 'summary.xlsx', kind: 'bytes', content: dummyXlsx('summary') },
      { relativePath: 'SIS-14/approval.msg', kind: 'msg' },
      { relativePath: 'SIS-14/eticket.pdf', kind: 'pdf' },
    ],
  },
  {
    name: 'Event line with OPEX + PDF passes',
    expect: 'PASS',
    lines: [['CE-20-2026', '', 'Sponsorship gala', '60307021', 'Event']],
    files: [
      { relativePath: 'invoice-source.xlsx', kind: 'xlsx' },
      { relativePath: 'summary.xlsx', kind: 'bytes', content: dummyXlsx('summary') },
      { relativePath: 'CE-20-2026/OPEX-CE-20-2026.pdf', kind: 'pdf' },
      { relativePath: 'CE-20-2026/brochure.pdf', kind: 'pdf' },
    ],
  },
  {
    name: 'B2 prefix-safe: SIS-15 folder does not satisfy SIS-14',
    expect: 'FAIL',
    expectCode: 'JAWAL_FOLDER_MISMATCH',
    lines: [['SIS-14', '6905428831', 'Staff travel', '51000001', 'Travel']],
    files: [
      { relativePath: 'invoice-source.xlsx', kind: 'xlsx' },
      { relativePath: 'summary.xlsx', kind: 'bytes', content: dummyXlsx('summary') },
      { relativePath: 'SIS-15/approval.msg', kind: 'msg' },
      { relativePath: 'SIS-15/eticket.pdf', kind: 'pdf' },
    ],
  },
];

async function ensureSupplier(prisma: PrismaClient) {
  await prisma.supplier.upsert({
    where: { id: SUPPLIER_ID },
    create: {
      id: SUPPLIER_ID,
      legalName: 'Jawwal Travel & Tourism',
      crNumber: 'CR-1010122966',
      vatNumber: '310073322610003',
      status: 'ACTIVE',
      paymentTerms: 'Net 30',
      defaultCurrency: 'SAR',
      erpVendorId: 'VEND-JAWAL',
      erpIntegration: 'JAWAL',
    },
    update: { erpIntegration: 'JAWAL', status: 'ACTIVE' },
  });
  await prisma.supplierUser.upsert({
    where: { id: USER_ID },
    create: {
      id: USER_ID,
      supplierId: SUPPLIER_ID,
      email: USER_EMAIL,
      fullName: 'Jawal Admin',
      role: 'SUPPLIER_ADMIN',
      mfaEnabled: true,
      isActive: true,
    },
    update: {
      supplierId: SUPPLIER_ID,
      email: USER_EMAIL,
      isActive: true,
      role: 'SUPPLIER_ADMIN',
    },
  });
}

async function stageScenario(prisma: PrismaClient, scenario: Scenario, index: number) {
  const invoiceNumber = `E2E-JAWAL-${Date.now()}-${index}`;
  const invoiceId = makeId('inv');
  const storagePaths: string[] = [];
  const workbook = buildWorkbook(scenario.lines);
  const documents: Array<{ fileName: string; storageKey: string; sizeBytes: number }> = [];

  await prisma.invoice.create({
    data: {
      id: invoiceId,
      supplierId: SUPPLIER_ID,
      invoiceNumber,
      invoiceDate: new Date(),
      currency: 'SAR',
      subtotal: '100.00',
      vat: '15.00',
      total: '115.00',
      status: 'DRAFT',
      source: 'UPLOAD',
    },
  });

  for (const file of scenario.files) {
    let content: Buffer;
    if (file.kind === 'xlsx') content = workbook;
    else if (file.kind === 'pdf') content = minimalPdf(file.relativePath);
    else if (file.kind === 'msg') content = minimalMsg();
    else content = file.content ?? Buffer.from('x');

    const storageFileName = `${randomUUID()}-${file.relativePath.replaceAll('/', '__')}`;
    const storageKey = `local:${SUPPLIER_ID}/${invoiceId}/${storageFileName}`;
    const absolute = join(STORAGE_ROOT, SUPPLIER_ID, invoiceId, storageFileName);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
    storagePaths.push(absolute);

    await prisma.document.create({
      data: {
        id: makeId('doc'),
        invoiceId,
        type: 'OTHER',
        fileName: file.relativePath,
        storageKey,
        mimeType:
          file.kind === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : file.kind === 'pdf'
              ? 'application/pdf'
              : file.kind === 'msg'
                ? 'application/vnd.ms-outlook'
                : 'application/octet-stream',
        sizeBytes: content.length,
        checksumSha256: createHash('sha256').update(content).digest('hex'),
        virusScanStatus: 'CLEAN',
      },
    });

    documents.push({
      fileName: file.relativePath,
      storageKey,
      sizeBytes: content.length,
    });
  }

  return { invoiceId, storagePaths, documents };
}

async function cleanup(prisma: PrismaClient, invoiceId: string, storagePaths: string[]) {
  await prisma.document.deleteMany({ where: { invoiceId } });
  await prisma.invoice.delete({ where: { id: invoiceId } }).catch(() => undefined);
  for (const path of storagePaths) {
    await rm(path, { force: true });
  }
  await rm(join(STORAGE_ROOT, SUPPLIER_ID, invoiceId), {
    recursive: true,
    force: true,
  }).catch(() => undefined);
}

async function main() {
  const prisma = new PrismaClient();
  await ensureSupplier(prisma);

  const storage = new StorageService();
  const kb = new KbStorageService();
  const jawalEvidence = new JawalEvidenceCheckService(storage, kb);

  console.log('Live Jawal submit-gate e2e');
  console.log(`  cwd=${process.cwd()}`);
  console.log(`  storage=${STORAGE_ROOT}`);
  console.log(`  supplier=${SUPPLIER_ID} erp=JAWAL`);

  const supplier = await prisma.supplier.findUnique({
    where: { id: SUPPLIER_ID },
    select: { erpIntegration: true },
  });
  if (supplier?.erpIntegration !== 'JAWAL') {
    throw new Error(`Expected supplier erpIntegration=JAWAL, got ${supplier?.erpIntegration}`);
  }

  const results: Array<{
    name: string;
    expect: string;
    actual: string;
    ok: boolean;
  }> = [];

  try {
    for (let i = 0; i < scenarios.length; i += 1) {
      const scenario = scenarios[i]!;
      const { invoiceId, storagePaths, documents } = await stageScenario(
        prisma,
        scenario,
        i,
      );

      // Re-read from DB the way submit() does.
      const dbDocs = await prisma.document.findMany({
        where: { invoiceId },
        select: { fileName: true, storageKey: true, sizeBytes: true },
      });

      const gate = await runSubmitGate(jawalEvidence, dbDocs);
      const actual = gate.ok ? 'PASS' : 'FAIL';
      const code = gate.ok ? null : gate.code;
      const ok =
        actual === scenario.expect &&
        (scenario.expect === 'PASS' || !scenario.expectCode || code === scenario.expectCode);

      results.push({
        name: scenario.name,
        expect: scenario.expect + (scenario.expectCode ? ` (${scenario.expectCode})` : ''),
        actual: actual + (code ? ` (${code})` : ''),
        ok,
      });

      console.log(
        `${ok ? '✓' : '✗'} ${scenario.name}\n` +
          `    docs=${dbDocs.length} staged=${documents.length}\n` +
          `    expect=${scenario.expect}${scenario.expectCode ? `/${scenario.expectCode}` : ''} ` +
          `actual=${actual}${code ? `/${code}` : ''}` +
          (!ok && !gate.ok ? `\n    ${gate.message}` : ''),
      );

      await cleanup(prisma, invoiceId, storagePaths);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('\nSummary');
  console.table(
    results.map((r) => ({
      scenario: r.name,
      expect: r.expect,
      actual: r.actual,
      ok: r.ok ? 'PASS' : 'FAIL',
    })),
  );

  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
  } else {
    console.log('\nAll live Jawal submit gate scenarios passed.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
