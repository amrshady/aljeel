Implemented the production timeout mitigation without deploying, restarting, committing, or changing chargeback row logic.

Key behavior:

- Bounded extraction concurrency via `SOLVENTUM_POD_OCR_CONCURRENCY`, default `3`, minimum `1`.
- Per-file timeout via `SOLVENTUM_POD_EXTRACT_TIMEOUT_MS`, default `120000`, minimum `10000`.
- Stable result ordering preserves filename-to-TRX mapping.
- Rejected/timed-out PODs produce one aggregate Nest warning.
- Successful PODs still generate the workbook normally.
- No new dependencies.

### Verification

Focused Solventum tests passed:

```text
✓ src/ap/solventum-pod-parse.spec.ts (9 tests) 25ms
✓ src/ap/solventum-integration.service.spec.ts (17 tests) 237ms

Test Files  2 passed (2)
Tests       26 passed (26)
Duration    1.40s
```

`git diff --check` passed.

The requested API build was run but is blocked by pre-existing errors in the untracked file `apps/api/solventum_e2e.ts`:

```text
solventum_e2e.ts:11:3 - error TS2724:
"./src/ap/solventum-integration.service" has no exported member
named 'SOLVENTUM_SOURCE_COLUMNS'.

solventum_e2e.ts:201:8 - error TS7006:
Parameter 'column' implicitly has an 'any' type.

solventum_e2e.ts:202:12 - error TS7006:
Parameter 'column' implicitly has an 'any' type.

Found 3 error(s).
```

No build errors referenced the changed service or spec.

### Full diff

```diff
diff --git a/apps/api/src/ap/solventum-integration.service.spec.ts b/apps/api/src/ap/solventum-integration.service.spec.ts
index 1c56c76..173ecac 100644
--- a/apps/api/src/ap/solventum-integration.service.spec.ts
+++ b/apps/api/src/ap/solventum-integration.service.spec.ts
@@ -1,5 +1,6 @@
 import * as XLSX from 'xlsx';
-import { describe, expect, it } from 'vitest';
+import { Logger } from '@nestjs/common';
+import { afterEach, describe, expect, it, vi } from 'vitest';
 import {
   SOLVENTUM_OUTPUT_COLUMNS,
   SolventumIntegrationService,
@@ -59,6 +60,86 @@ const run = async (
 };
 
 describe('SolventumIntegrationService', () => {
+  afterEach(() => {
+    delete process.env.SOLVENTUM_POD_OCR_CONCURRENCY;
+    delete process.env.SOLVENTUM_POD_EXTRACT_TIMEOUT_MS;
+    vi.restoreAllMocks();
+    vi.useRealTimers();
+  });
+
+  it('bounds concurrent POD extractions and preserves successful rows', async () => {
+    process.env.SOLVENTUM_POD_OCR_CONCURRENCY = '2';
+    let inFlight = 0;
+    let maxInFlight = 0;
+    const extractor = new (class extends SolventumPodExtractor {
+      async extract(): Promise<SolventumPodLine[]> {
+        inFlight++;
+        maxInFlight = Math.max(maxInFlight, inFlight);
+        await new Promise((resolve) => setTimeout(resolve, 5));
+        inFlight--;
+        return [];
+      }
+    })();
+    const service = new SolventumIntegrationService(extractor);
+    const names = Array.from({ length: 6 }, (_, index) => `26000142${30 + index} POD.pdf`);
+    const buffer = await service.generateChargeback(
+      workbook(names.map((name) => salesRow({ 'TRX #': Number(name.slice(0, 10)) }))),
+      names.map((originalname) => ({ originalname, buffer: Buffer.from('pdf') })),
+    );
+
+    expect(buffer.length).toBeGreaterThan(0);
+    expect(maxInFlight).toBe(2);
+  });
+
+  it('times out one hanging POD and still returns rows from successful PODs', async () => {
+    vi.useFakeTimers();
+    process.env.SOLVENTUM_POD_EXTRACT_TIMEOUT_MS = '10000';
+    const extractor = new (class extends SolventumPodExtractor {
+      async extract(file: SolventumPodFile): Promise<SolventumPodLine[]> {
+        if (file.originalname.startsWith('2600014236')) return new Promise(() => undefined);
+        return [];
+      }
+    })();
+    const service = new SolventumIntegrationService(extractor);
+    const pending = service.generateChargeback(
+      workbook([salesRow({ 'TRX #': 2600014236 }), salesRow({ 'TRX #': 2600014237 })]),
+      ['2600014236 POD.pdf', '2600014237 POD.pdf'].map((originalname) => ({
+        originalname,
+        buffer: Buffer.from('pdf'),
+      })),
+    );
+    await vi.advanceTimersByTimeAsync(10_000);
+    const output = XLSX.read(await pending, { type: 'buffer' });
+    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(output.Sheets.Sheet1!);
+
+    expect(rows.map((row) => String(row['TRX #']))).toEqual(['2600014236', '2600014237']);
+  });
+
+  it('warns once for rejected PODs and still generates the workbook', async () => {
+    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
+    const failedName = '2600014236 failed.pdf';
+    const extractor = new (class extends SolventumPodExtractor {
+      async extract(file: SolventumPodFile): Promise<SolventumPodLine[]> {
+        if (file.originalname === failedName) throw new Error('OCR failed');
+        return [];
+      }
+    })();
+    const service = new SolventumIntegrationService(extractor);
+    const buffer = await service.generateChargeback(
+      workbook([salesRow({ 'TRX #': 2600014236 }), salesRow({ 'TRX #': 2600014237 })]),
+      [failedName, '2600014237 good.pdf'].map((originalname) => ({
+        originalname,
+        buffer: Buffer.from('pdf'),
+      })),
+    );
+
+    expect(buffer.length).toBeGreaterThan(0);
+    expect(warn).toHaveBeenCalledOnce();
+    expect(warn).toHaveBeenCalledWith(
+      `Solventum: 1/2 PODs failed extraction: ${failedName}`,
+    );
+  });
+
   it('omits Item Description from output columns', async () => {
diff --git a/apps/api/src/ap/solventum-integration.service.ts b/apps/api/src/ap/solventum-integration.service.ts
index f5a7c4d..83cac1b 100644
--- a/apps/api/src/ap/solventum-integration.service.ts
+++ b/apps/api/src/ap/solventum-integration.service.ts
@@ -1,4 +1,4 @@
-import { BadRequestException, Inject, Injectable } from '@nestjs/common';
+import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
 import * as XLSX from 'xlsx';
@@ -50,6 +50,54 @@ const isFilenamePlaceholder = (pod: SolventumPodLine) =>
 
 const isGenericUom = (value: unknown) => /^(EA|EACH|PIECE|PCS)$/i.test(clean(value));
 
+const envInt = (name: string, fallback: number, minimum: number) => {
+  const parsed = Number.parseInt(process.env[name] ?? '', 10);
+  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
+};
+
+const settleWithConcurrency = async <T>(
+  tasks: Array<() => Promise<T>>,
+  concurrency: number,
+): Promise<PromiseSettledResult<T>[]> => {
+  const results = new Array<PromiseSettledResult<T>>(tasks.length);
+  let nextIndex = 0;
+
+  const worker = async () => {
+    while (nextIndex < tasks.length) {
+      const index = nextIndex++;
+      try {
+        results[index] = { status: 'fulfilled', value: await tasks[index]!() };
+      } catch (reason) {
+        results[index] = { status: 'rejected', reason };
+      }
+    }
+  };
+
+  await Promise.all(
+    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
+  );
+  return results;
+};
+
+const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, filename: string): Promise<T> =>
+  new Promise<T>((resolve, reject) => {
+    const timer = setTimeout(
+      () => reject(new Error(`POD extraction timed out after ${timeoutMs}ms: ${filename}`)),
+      timeoutMs,
+    );
+    timer.unref?.();
+    promise.then(
+      (value) => {
+        clearTimeout(timer);
+        resolve(value);
+      },
+      (error) => {
+        clearTimeout(timer);
+        reject(error);
+      },
+    );
+  });
+
@@ -66,6 +114,8 @@ const isGenericUom = (value: unknown) => /^(EA|EACH|PIECE|PCS)$/i.test(clean(val
 @Injectable()
 export class SolventumIntegrationService {
+  private readonly logger = new Logger(SolventumIntegrationService.name);
+
   constructor(@Inject(SolventumPodExtractor) private readonly extractor: SolventumPodExtractor) {}
@@ -116,7 +166,22 @@ export class SolventumIntegrationService {
 
   private async extractPodLines(podFiles: SolventumPodFile[]): Promise<SolventumPodLine[]> {
     const lines: SolventumPodLine[] = [];
-    const settled = await Promise.allSettled(podFiles.map((file) => this.extractor.extract(file)));
+    const concurrency = envInt('SOLVENTUM_POD_OCR_CONCURRENCY', 3, 1);
+    const timeoutMs = envInt('SOLVENTUM_POD_EXTRACT_TIMEOUT_MS', 120_000, 10_000);
+    const settled = await settleWithConcurrency(
+      podFiles.map((file) => () =>
+        withTimeout(this.extractor.extract(file), timeoutMs, file.originalname),
+      ),
+      concurrency,
+    );
+    const failedNames = settled.flatMap((result, index) =>
+      result.status === 'rejected' ? [podFiles[index]!.originalname] : [],
+    );
+    if (failedNames.length > 0) {
+      this.logger.warn(
+        `Solventum: ${failedNames.length}/${podFiles.length} PODs failed extraction: ${failedNames.join(', ')}`,
+      );
+    }
     settled.forEach((result, index) => {
       if (result.status !== 'fulfilled') return;
```

Files changed:

- [solventum-integration.service.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/solventum-integration.service.ts)
- [solventum-integration.service.spec.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/solventum-integration.service.spec.ts)
