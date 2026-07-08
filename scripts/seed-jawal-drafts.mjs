#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';

const requireFromApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const pg = requireFromApi('pg');

const { Client } = pg;

const DEFAULT_PG_URL = 'postgresql://aljeel:aljeel@localhost:5432/aljeel';
const DEFAULT_BATCH_ROOT = '/home/clawdbot/.openclaw/workspace/aljeel/batches';
const DEFAULT_STORAGE_ROOT = '/home/clawdbot/pglocal/storage';
const SUPPLIER_ID = 'supplier_jawal';

const dryRun = process.argv.includes('--dry-run');
const pgUrl = process.env.PG_URL || DEFAULT_PG_URL;
const batchRoot = process.env.JAWAL_BATCH_ROOT || DEFAULT_BATCH_ROOT;
const storageRoot = process.env.STORAGE_ROOT || DEFAULT_STORAGE_ROOT;

const batches = [
  {
    invoiceNumber: 'J26-550',
    files: [
      { type: 'INVOICE', fileName: 'AL JEEL 1-7 APR 26 INV.pdf' },
    ],
  },
  {
    invoiceNumber: 'J26-589',
    files: [
      { type: 'INVOICE', fileName: 'AL JEEL 8-15 APR 26 INV.pdf' },
      { type: 'OTHER', fileName: 'AL JEEL 8-15 APR 26 INV.xlsx' },
    ],
  },
  {
    invoiceNumber: 'J26-593',
    files: [
      { type: 'INVOICE', fileName: 'AL JEEL 16-23 APR 26 INV.pdf' },
      { type: 'OTHER', fileName: 'AL JEEL 16-23 APR 26 INV.xlsx' },
      { type: 'OTHER', fileName: 'AL JEEL 16-23 APR 26 SOA.pdf' },
      { type: 'OTHER', fileName: 'AL JEEL 16-23 APR 26 REFUND INV.pdf' },
    ],
  },
  {
    invoiceNumber: 'J26-640',
    files: [
      { type: 'INVOICE', fileName: 'INV-30 APR 26 AL JEEL.pdf' },
      { type: 'OTHER', fileName: 'INV-30 APR 26 AL JEEL.xlsx' },
      { type: 'OTHER', fileName: 'SOA-AL JEEL.pdf' },
      { type: 'OTHER', fileName: 'CRN- AL JEEL.pdf' },
    ],
  },
  {
    invoiceNumber: 'J26-815',
    files: [
      { type: 'INVOICE', fileName: 'invoice-source.xlsx' },
    ],
  },
  {
    invoiceNumber: 'J26-830',
    files: [
      { type: 'INVOICE', fileName: 'invoice-source.xlsx' },
    ],
  },
  {
    invoiceNumber: 'J26-870',
    files: [
      { type: 'INVOICE', fileName: 'invoice-source.xlsx' },
    ],
  },
  {
    invoiceNumber: 'J26-925',
    files: [
      { type: 'INVOICE', fileName: 'AL JEEL 1-7 JUN 26 INV.pdf' },
    ],
  },
  {
    invoiceNumber: 'J26-939',
    files: [
      { type: 'INVOICE', fileName: 'AL JEEL 8-15 JUN 26 INV.pdf' },
      { type: 'OTHER', fileName: 'AL JEEL 8-15 JUN 26 INV.xlsx' },
      { type: 'OTHER', fileName: 'AL JEEL 8-15 JUN 26 SOA.pdf' },
      { type: 'OTHER', fileName: 'AL JEEL 8-15 JUN 26 REFUND INV.pdf' },
      { type: 'OTHER', fileName: 'AL JEEL NOT PAID SOA.pdf' },
      { type: 'OTHER', fileName: 'AL JEEL NOT PAID SOA.xlsx' },
    ],
  },
  {
    invoiceNumber: 'J26-954',
    files: [
      { type: 'INVOICE', fileName: 'AL JEEL 16-23 JUN 26 INV.pdf' },
    ],
  },
];

function makeId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
}

function sanitizeStorageFileName(fileName) {
  return basename(fileName).replaceAll('/', '').replaceAll('\\', '');
}

function mimeTypeFor(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
}

async function fileInfo(batchDir, allowlistedFile) {
  const originalBaseName = basename(allowlistedFile.fileName);
  const sourcePath = join(batchDir, originalBaseName);

  try {
    const stats = await stat(sourcePath);
    if (!stats.isFile()) {
      return { missing: true, warning: `${allowlistedFile.fileName} is not a regular file` };
    }

    const bytes = await readFile(sourcePath);
    return {
      type: allowlistedFile.type,
      fileName: originalBaseName,
      sourcePath,
      sizeBytes: stats.size,
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
      mimeType: mimeTypeFor(originalBaseName),
      mtime: stats.mtime,
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { missing: true, warning: `missing allowlisted file: ${allowlistedFile.fileName}` };
    }
    throw error;
  }
}

async function copyAndVerify(sourcePath, destinationPath, expectedBytes) {
  await copyFile(sourcePath, destinationPath);
  const copied = await stat(destinationPath);
  if (copied.size !== expectedBytes) {
    throw new Error(`copy size mismatch for ${sourcePath}: expected ${expectedBytes}, got ${copied.size}`);
  }
}

async function invoiceExists(client, invoiceNumber) {
  const result = await client.query(
    'SELECT id FROM "Invoice" WHERE "supplierId" = $1 AND "invoiceNumber" = $2 LIMIT 1',
    [SUPPLIER_ID, invoiceNumber],
  );
  return result.rows[0]?.id || null;
}

async function insertBatch(client, batch, invoiceId, invoiceDate, preparedDocs) {
  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO "Invoice" (
        id, "supplierId", "invoiceNumber", "invoiceDate", currency,
        subtotal, vat, total, status, source, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'SAR', 0, 0, 0, 'DRAFT', 'UPLOAD', now(), now())`,
      [invoiceId, SUPPLIER_ID, batch.invoiceNumber, invoiceDate],
    );

    for (const doc of preparedDocs) {
      await client.query(
        `INSERT INTO "Document" (
          id, "invoiceId", type, "fileName", "storageKey", "mimeType",
          "sizeBytes", "checksumSha256", "virusScanStatus", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CLEAN', now())`,
        [
          doc.id,
          invoiceId,
          doc.type,
          doc.fileName,
          doc.storageKey,
          doc.mimeType,
          doc.sizeBytes,
          doc.checksumSha256,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function printReport(results, totals) {
  const rows = results.map((result) => ({
    batch: result.invoiceNumber,
    status: result.status,
    detail: result.detail,
  }));

  console.log('');
  console.log(`Jawal draft seed ${dryRun ? 'dry run' : 'run'} summary`);
  console.table(rows);

  const warnings = results.flatMap((result) =>
    result.warnings.map((warning) => `${result.invoiceNumber}: ${warning}`),
  );
  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  const errors = results.filter((result) => result.status === 'ERROR');
  if (errors.length > 0) {
    console.log('Errors:');
    for (const error of errors) {
      console.log(`- ${error.invoiceNumber}: ${error.detail}`);
    }
  }

  console.log(
    `Totals: invoices ${dryRun ? 'would create' : 'created'}=${totals.invoicesCreated}, ` +
    `documents=${totals.documentsCreated}, bytes ${dryRun ? 'would copy' : 'copied'}=${totals.bytesCopied}`,
  );
}

async function main() {
  const client = new Client({ connectionString: pgUrl });
  const results = [];
  const totals = {
    invoicesCreated: 0,
    documentsCreated: 0,
    bytesCopied: 0,
  };

  await client.connect();

  try {
    for (const batch of batches) {
      const warnings = [];

      try {
        const existingInvoiceId = await invoiceExists(client, batch.invoiceNumber);
        if (existingInvoiceId) {
          results.push({
            invoiceNumber: batch.invoiceNumber,
            status: 'SKIPPED-EXISTS',
            detail: existingInvoiceId,
            warnings,
          });
          continue;
        }

        const batchDir = join(batchRoot, `jawal-${batch.invoiceNumber}`);
        const presentDocs = [];

        for (const allowlistedFile of batch.files) {
          const info = await fileInfo(batchDir, allowlistedFile);
          if (info.missing) {
            warnings.push(info.warning);
          } else {
            presentDocs.push(info);
          }
        }

        if (presentDocs.length === 0) {
          throw new Error('none of the allowlisted files are present');
        }

        const primaryDoc = presentDocs.find((doc) => doc.type === 'INVOICE');
        const invoiceDate = primaryDoc?.mtime || presentDocs[0].mtime;
        if (!primaryDoc) {
          warnings.push('primary INVOICE file missing; invoiceDate uses first present allowlisted file mtime');
        }

        const invoiceId = makeId('inv_jawal');
        const invoiceStorageDir = join(storageRoot, SUPPLIER_ID, invoiceId);
        const preparedDocs = presentDocs.map((doc) => {
          const uuid = randomUUID();
          const storageFileName = `${uuid}-${sanitizeStorageFileName(doc.fileName)}`;
          return {
            ...doc,
            id: makeId('doc'),
            storageKey: `local:${SUPPLIER_ID}/${invoiceId}/${storageFileName}`,
            destinationPath: join(invoiceStorageDir, storageFileName),
          };
        });

        if (!dryRun) {
          const copiedPaths = [];
          try {
            await mkdir(invoiceStorageDir, { recursive: true });
            for (const doc of preparedDocs) {
              await copyAndVerify(doc.sourcePath, doc.destinationPath, doc.sizeBytes);
              copiedPaths.push(doc.destinationPath);
            }
            await insertBatch(client, batch, invoiceId, invoiceDate, preparedDocs);
          } catch (error) {
            await Promise.all(copiedPaths.map((path) => rm(path, { force: true })));
            await rm(invoiceStorageDir, { force: true, recursive: true });
            throw error;
          }
        }

        totals.invoicesCreated += 1;
        totals.documentsCreated += preparedDocs.length;
        totals.bytesCopied += preparedDocs.reduce((sum, doc) => sum + doc.sizeBytes, 0);

        results.push({
          invoiceNumber: batch.invoiceNumber,
          status: dryRun ? 'WOULD-CREATE' : 'CREATED',
          detail: `${invoiceId}, ${preparedDocs.length} docs`,
          warnings,
        });
      } catch (error) {
        results.push({
          invoiceNumber: batch.invoiceNumber,
          status: 'ERROR',
          detail: error instanceof Error ? error.message : String(error),
          warnings,
        });
      }
    }
  } finally {
    await client.end();
  }

  printReport(results, totals);

  if (results.some((result) => result.status === 'ERROR')) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
