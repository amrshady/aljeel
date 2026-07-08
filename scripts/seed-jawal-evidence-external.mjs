#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';

const requireFromApi = createRequire(new URL('../apps/api/package.json', import.meta.url));
const pg = requireFromApi('pg');

const { Client } = pg;

const DEFAULT_PG_URL = 'postgresql://aljeel:aljeel@localhost:5432/aljeel';
const DEFAULT_STORAGE_ROOT = '/home/clawdbot/pglocal/storage';
const SUPPLIER_ID = 'supplier_jawal';
const EXCLUDED_DIRS = new Set(['output', 'raw-internal', 'ai-poc-cache', 'audit']);

const dryRun = process.argv.includes('--dry-run');
const pgUrl = process.env.PG_URL || DEFAULT_PG_URL;
const storageRoot = process.env.STORAGE_ROOT || DEFAULT_STORAGE_ROOT;

const batchSources = [
  ['J26-550', '/tmp/jawal-evidence-stage/J26-550'],
  ['J26-589', '/tmp/jawal-evidence-stage/J26-589'],
  ['J26-593', '/home/clawdbot/.openclaw/workspace/aljeel/archive/raw-J26-593'],
  ['J26-640', '/home/clawdbot/.openclaw/workspace/aljeel/archive/raw-J26-640'],
  ['J26-815', '/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/evidence/j26-815'],
  ['J26-830', '/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/evidence/j26-830'],
  ['J26-870', '/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/evidence/j26-870'],
];

function makeId(prefix) {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
}

function normalizeRelativePath(filePath) {
  return filePath.split(sep).join('/');
}

function sanitizeStorageFileName(fileName) {
  return fileName
    .replaceAll('/', '__')
    .replaceAll('\\', '__')
    .replaceAll(/\s+/g, '_')
    .replaceAll(/[^A-Za-z0-9._-]/g, '_')
    .replaceAll(/_+/g, '_')
    .slice(0, 180);
}

function mimeTypeFor(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.msg')) return 'application/vnd.ms-outlook';
  if (lower.endsWith('.eml')) return 'message/rfc822';
  if (lower.endsWith('.msg.json')) return 'application/json';
  return 'application/octet-stream';
}

function isEvidenceFile(fileName) {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith('.pdf') ||
    lower.endsWith('.msg') ||
    lower.endsWith('.eml') ||
    lower.endsWith('.msg.json')
  );
}

async function collectEvidenceFiles(sourceDir) {
  const evidence = [];

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relativePath = normalizeRelativePath(relative(sourceDir, fullPath));
      const segments = relativePath.split('/');

      if (segments.some((segment) => EXCLUDED_DIRS.has(segment))) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile() || !isEvidenceFile(entry.name)) {
        continue;
      }

      evidence.push({
        fileName: relativePath,
        sourcePath: fullPath,
      });
    }
  }

  await walk(sourceDir);
  evidence.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return evidence;
}

async function fileInfo(evidenceFile) {
  const stats = await stat(evidenceFile.sourcePath);
  if (!stats.isFile()) {
    throw new Error(`${evidenceFile.fileName} is not a regular file`);
  }

  const bytes = await readFile(evidenceFile.sourcePath);
  return {
    ...evidenceFile,
    type: 'OTHER',
    sizeBytes: stats.size,
    checksumSha256: createHash('sha256').update(bytes).digest('hex'),
    mimeType: mimeTypeFor(evidenceFile.fileName),
  };
}

async function copyAndVerify(sourcePath, destinationPath, expectedBytes) {
  await copyFile(sourcePath, destinationPath);
  const copied = await stat(destinationPath);
  if (copied.size !== expectedBytes) {
    throw new Error(`copy size mismatch for ${sourcePath}: expected ${expectedBytes}, got ${copied.size}`);
  }
}

async function invoiceIdForBatch(client, invoiceNumber) {
  const result = await client.query(
    'SELECT id FROM "Invoice" WHERE "supplierId" = $1 AND "invoiceNumber" = $2 LIMIT 1',
    [SUPPLIER_ID, invoiceNumber],
  );
  return result.rows[0]?.id || null;
}

async function existingDocumentFileNames(client, invoiceId) {
  const result = await client.query(
    'SELECT "fileName" FROM "Document" WHERE "invoiceId" = $1',
    [invoiceId],
  );
  return new Set(result.rows.map((row) => row.fileName));
}

async function insertDocuments(client, preparedDocs) {
  await client.query('BEGIN');
  try {
    for (const doc of preparedDocs) {
      await client.query(
        `INSERT INTO "Document" (
          id, "invoiceId", type, "fileName", "storageKey", "mimeType",
          "sizeBytes", "checksumSha256", "virusScanStatus", "createdAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CLEAN', now())`,
        [
          doc.id,
          doc.invoiceId,
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
    bytes: result.bytes,
    detail: result.detail,
  }));

  console.log('');
  console.log(`Jawal external evidence seed ${dryRun ? 'dry run' : 'run'} summary`);
  console.table(rows);

  const errors = results.filter((result) => result.status === 'ERROR');
  if (errors.length > 0) {
    console.log('Errors:');
    for (const error of errors) {
      console.log(`- ${error.invoiceNumber}: ${error.detail}`);
    }
  }

  console.log(
    `Totals: documents ${dryRun ? 'would add' : 'added'}=${totals.documentsAdded}, ` +
    `bytes ${dryRun ? 'would copy' : 'copied'}=${totals.bytesCopied}`,
  );
}

async function main() {
  const client = new Client({ connectionString: pgUrl });
  const results = [];
  const totals = {
    documentsAdded: 0,
    bytesCopied: 0,
  };

  await client.connect();

  try {
    for (const [invoiceNumber, sourceDir] of batchSources) {
      try {
        const evidenceFiles = await collectEvidenceFiles(sourceDir);
        if (evidenceFiles.length === 0) {
          results.push({
            invoiceNumber,
            status: 'SKIPPED-NO-EVIDENCE',
            bytes: 0,
            detail: '0 docs',
          });
          continue;
        }

        const invoiceId = await invoiceIdForBatch(client, invoiceNumber);
        if (!invoiceId) {
          throw new Error(`missing draft invoice for ${invoiceNumber}`);
        }

        const existingFileNames = await existingDocumentFileNames(client, invoiceId);
        const newEvidenceFiles = evidenceFiles.filter((file) => !existingFileNames.has(file.fileName));

        if (newEvidenceFiles.length === 0) {
          results.push({
            invoiceNumber,
            status: 'SKIPPED-ALL-EXIST',
            bytes: 0,
            detail: `${evidenceFiles.length} existing docs`,
          });
          continue;
        }

        const docs = [];
        for (const evidenceFile of newEvidenceFiles) {
          docs.push(await fileInfo(evidenceFile));
        }

        const invoiceStorageDir = join(storageRoot, SUPPLIER_ID, invoiceId);
        const preparedDocs = docs.map((doc) => {
          const uuid = randomUUID();
          const storageFileName = `${uuid}-${sanitizeStorageFileName(doc.fileName)}`;
          return {
            ...doc,
            id: makeId('doc'),
            invoiceId,
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
            await insertDocuments(client, preparedDocs);
          } catch (error) {
            await Promise.all(copiedPaths.map((path) => rm(path, { force: true })));
            throw error;
          }
        }

        const bytes = preparedDocs.reduce((sum, doc) => sum + doc.sizeBytes, 0);
        totals.documentsAdded += preparedDocs.length;
        totals.bytesCopied += bytes;

        results.push({
          invoiceNumber,
          status: dryRun ? `WOULD-ADD ${preparedDocs.length} docs` : `ADDED ${preparedDocs.length} docs`,
          bytes,
          detail: invoiceId,
        });
      } catch (error) {
        results.push({
          invoiceNumber,
          status: 'ERROR',
          bytes: 0,
          detail: error instanceof Error ? error.message : String(error),
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
