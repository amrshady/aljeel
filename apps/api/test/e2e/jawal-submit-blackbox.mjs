import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(apiRoot, '../..');
const databaseName = 'aljeel_e2e';
const port = 43127;
const baseUrl = `http://127.0.0.1:${port}`;
const devEmail = 'jawal-e2e@invalid.test';
const results = [];
let server = null;
let prisma = null;
let adminUrl;
let testDatabaseUrl;
let storageDir;

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[line.slice(0, separator).trim()] = value;
  }
  return values;
}

async function configureDatabaseUrls() {
  const env = parseEnv(await readFile(join(apiRoot, '.env'), 'utf8'));
  assert(env.DATABASE_URL, 'apps/api/.env must define DATABASE_URL');
  const source = new URL(env.DATABASE_URL);
  assert.equal(source.protocol, 'postgresql:', 'DATABASE_URL must use PostgreSQL');
  assert.equal(source.hostname, 'localhost', 'Safety check: expected the explicitly authorized local PostgreSQL');
  assert.notEqual(source.pathname, `/${databaseName}`, 'Source DATABASE_URL unexpectedly already targets the E2E database');

  const testUrl = new URL(source);
  testUrl.pathname = `/${databaseName}`;
  testUrl.searchParams.set('schema', 'public');
  testDatabaseUrl = testUrl.toString();

  const maintenanceUrl = new URL(source);
  maintenanceUrl.pathname = '/postgres';
  maintenanceUrl.search = '';
  adminUrl = maintenanceUrl.toString();
}

async function recreateDatabase() {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await client.query(`CREATE DATABASE ${databaseName}`);
  } finally {
    await client.end();
  }
}

async function dropDatabase() {
  if (!adminUrl) return;
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS ${databaseName}`);
  } finally {
    await client.end();
  }
}

function run(command, args, options = {}) {
  const completed = spawnSync(command, args, {
    cwd: apiRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });
  if (completed.status !== 0) {
    const output = [completed.stdout, completed.stderr].filter(Boolean).join('\n');
    throw new Error(`${command} ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }
}

async function waitForHealth(child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited before becoming healthy (code ${child.exitCode})`);
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) return;
    } catch {
      // Server socket is not listening yet.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error('Timed out waiting for the built API health endpoint');
}

async function startServer() {
  const env = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    PORT: String(port),
    NODE_ENV: 'test',
    AUTH_DEV_MODE: 'true',
    AUTH_DEV_EMAIL: devEmail,
    STORAGE_DIR: storageDir,
    INVOICE_SUBMIT_NOTIFY_EMAILS: '',
    NOTIFY_EMAIL_DISABLED: 'true',
    SPACES_ACCESS_KEY_ID: '',
    SPACES_SECRET_ACCESS_KEY: '',
    SPACES_ENDPOINT: '',
    SPACES_REGION: '',
  };
  const child = spawn(process.execPath, ['dist/src/main.js'], {
    cwd: apiRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  child.on('exit', () => {
    if (child.exitCode && child.exitCode !== 0 && logs) {
      process.stderr.write('API process exited unexpectedly; captured logs omitted unless the test fails.\n');
    }
  });
  child.capturedLogs = () => logs;
  server = child;
  await waitForHealth(child);
}

async function stopServer(signal = 'SIGTERM') {
  if (!server || server.exitCode !== null) {
    server = null;
    return;
  }
  const child = server;
  server = null;
  child.kill(signal);
  await Promise.race([
    new Promise((resolvePromise) => child.once('exit', resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 3_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function workbookBuffer() {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Ref.No', 'Ticket', 'Description', 'Account', 'Type'],
    ['1002584', '065 6905428831', 'ALKULAIB/OMAR AHMED MR', '51000001', 'Travel'],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Lines');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

async function saveLocal(key, contents) {
  const path = join(storageDir, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function seedBase() {
  await prisma.supplier.create({
    data: {
      id: 'supplier_jawal_e2e',
      legalName: 'Jawal E2E Supplier',
      status: 'ACTIVE',
      erpIntegration: 'JAWAL',
    },
  });
  await prisma.supplierUser.create({
    data: {
      id: 'user_jawal_e2e',
      supplierId: 'supplier_jawal_e2e',
      email: devEmail,
      fullName: 'Jawal E2E User',
      role: 'SUPPLIER_ADMIN',
      isActive: true,
    },
  });
}

async function createInvoice(name, extraDocuments, { clean = false, fifo = false } = {}) {
  const invoice = await prisma.invoice.create({
    data: {
      supplierId: 'supplier_jawal_e2e',
      invoiceNumber: name,
      invoiceDate: new Date('2026-09-29T00:00:00.000Z'),
      status: 'DRAFT',
      lines: {
        create: {
          description: 'Jawal travel batch',
          qty: 1,
          unitPrice: 100,
          vatRate: 15,
          amount: 115,
        },
      },
    },
  });

  const xlsxKey = `${invoice.id}/invoice.xlsx`;
  const xlsx = workbookBuffer();
  await saveLocal(xlsxKey, xlsx);
  const documents = [{
    invoiceId: invoice.id,
    type: 'INVOICE',
    fileName: 'J26-1407_INV.xlsx',
    storageKey: `local:${xlsxKey}`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: xlsx.length,
    virusScanStatus: 'CLEAN',
  }];

  if (clean) {
    const emlKey = `${invoice.id}/approval.eml`;
    const eml = Buffer.from('Subject: Approved travel\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nApproved ticket 6905428831');
    await saveLocal(emlKey, eml);
    documents.push({
      invoiceId: invoice.id,
      type: 'OTHER',
      fileName: '6905428831/approval.eml',
      storageKey: `local:${emlKey}`,
      mimeType: 'message/rfc822',
      sizeBytes: eml.length,
      virusScanStatus: 'CLEAN',
    });
  }

  if (fifo) {
    const fifoKey = `${invoice.id}/blocking.png`;
    const fifoPath = join(storageDir, fifoKey);
    await mkdir(dirname(fifoPath), { recursive: true });
    run('mkfifo', [fifoPath]);
    documents.push({
      invoiceId: invoice.id,
      type: 'OTHER',
      fileName: 'unrelated/blocking.png',
      storageKey: `local:${fifoKey}`,
      mimeType: 'image/png',
      sizeBytes: 128,
      virusScanStatus: 'CLEAN',
    });
  }

  while (documents.length < 1 + extraDocuments) {
    const index = documents.length;
    documents.push({
      invoiceId: invoice.id,
      type: 'OTHER',
      fileName: `loose-file-${index}.txt`,
      storageKey: `local:${invoice.id}/loose-file-${index}.txt`,
      mimeType: 'text/plain',
      sizeBytes: 1,
      virusScanStatus: 'CLEAN',
    });
  }
  await prisma.document.createMany({ data: documents });
  return invoice.id;
}

async function submit(id, signal) {
  return fetch(`${baseUrl}/api/v1/invoices/${id}/submit`, { method: 'POST', signal });
}

async function state(id) {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id }, select: { status: true } });
  const submitAudits = await prisma.auditEvent.count({ where: { entity: 'Invoice', entityId: id, action: 'SUBMIT' } });
  return { status: invoice.status, submitAudits };
}

async function waitForStatus(id, expected, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let observed;
  while (Date.now() < deadline) {
    observed = await state(id);
    if (expected.includes(observed.status)) return observed;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error(`Timed out waiting for ${id} status ${expected.join('/')} (last ${observed?.status})`);
}

async function testMissing(label, documentCount, batchId) {
  const id = await createInvoice(batchId, documentCount - 1);
  const response = await submit(id);
  const body = await response.json();
  const observed = await state(id);
  assert.equal(response.status, 422);
  assert.equal(body.error?.code, 'JAWAL_FOLDER_MISMATCH');
  assert.notEqual(observed.status, 'SUBMITTED');
  assert.equal(observed.status, 'CHANGES_REQUESTED');
  assert.equal(observed.submitAudits, 0);
  results.push({ case: label, http: response.status, db: observed.status, submitAudits: observed.submitAudits, result: 'PASS' });
}

async function testCleanBigBatch() {
  const id = await createInvoice('J26-1409', 100, { clean: true });
  const response = await submit(id);
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.status, 'SUBMITTED');
  const observed = await waitForStatus(id, ['UNDER_REVIEW']);
  assert.equal(observed.submitAudits, 1);
  results.push({ case: 'clean batch (101 documents)', http: response.status, responseStatus: body.status, db: observed.status, submitAudits: observed.submitAudits, result: 'PASS' });
}

async function testCrashDuringGate() {
  const id = await createInvoice('J26-1410', 100, { fifo: true });
  const controller = new AbortController();
  const request = submit(id, controller.signal).catch(() => null);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 750));
  assert.equal((await state(id)).status, 'DRAFT', 'invoice changed before the blocked evidence gate completed');
  await stopServer('SIGKILL');
  controller.abort();
  await request;
  await startServer();
  const observed = await state(id);
  assert.equal(observed.status, 'DRAFT');
  assert.equal(observed.submitAudits, 0);
  results.push({ case: 'crash during synchronous evidence gate', http: 'connection interrupted', db: observed.status, submitAudits: observed.submitAudits, result: 'PASS' });
}

async function main() {
  try {
    await configureDatabaseUrls();
    storageDir = await mkdtemp(join(tmpdir(), 'aljeel-jawal-e2e-'));
    await recreateDatabase();
    run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: testDatabaseUrl } });
    run('pnpm', ['exec', 'nest', 'build']);
    prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    await prisma.$connect();
    await seedBase();
    await startServer();

    await testMissing('big batch missing folder (101 documents)', 101, 'J26-1407');
    await testMissing('small batch missing folder (1 document)', 1, 'J26-1408');
    await testCleanBigBatch();
    await testCrashDuringGate();

    console.log(JSON.stringify({ database: databaseName, provisioned: 'drop/create + prisma migrate deploy + fixture seed', results }, null, 2));
  } catch (error) {
    if (server?.capturedLogs) process.stderr.write(server.capturedLogs());
    throw error;
  } finally {
    await stopServer().catch(() => undefined);
    await prisma?.$disconnect().catch(() => undefined);
    await dropDatabase().catch((error) => {
      process.stderr.write(`Failed to drop isolated E2E database: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  }
}

await main();
