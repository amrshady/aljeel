Implemented the asynchronous Solventum chargeback workflow. No deploy, service restart, or commit was performed.

### Outcome

- Added `POST /ap/solventum/chargeback/jobs` returning HTTP 202 immediately.
- Added polling endpoint and result-download endpoint.
- Persisted job inputs, status, errors, partial failures, and output workbook in PostgreSQL.
- Added an in-process FIFO queue ensuring only one OCR batch runs per API process.
- Interrupted `PENDING`/`PROCESSING` jobs are requeued after API startup.
- Added lazy TTL cleanup.
- Preserved the existing synchronous endpoint and workbook-generation behavior.
- Updated the web client to poll every 4 seconds for up to 15 minutes.
- Added localized background-processing and partial-failure messaging.
- Added service lifecycle, failure, serialization, endpoint, and result-streaming tests.

### Files changed

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260819000000_solventum_chargeback_jobs/migration.sql`
- `apps/api/src/ap/ap.controller.ts`
- `apps/api/src/ap/ap.module.ts`
- `apps/api/src/ap/solventum-chargeback-job.service.ts`
- `apps/api/src/ap/solventum-chargeback-job.service.spec.ts`
- `apps/api/src/ap/ap.controller.solventum-job.spec.ts`
- `apps/api/src/ap/solventum-integration.service.ts`
- `apps/api/src/ap/solventum-integration.service.spec.ts`
- `apps/web/src/lib/ap-api.ts`
- `apps/web/src/components/solventum-chargeback-uploader.tsx`
- `apps/web/messages/en.json`
- `apps/web/messages/ar.json`

The existing untracked briefs, scratch directories, `.mjs` files, and `solventum_e2e.ts` were not touched.

### Persistence choice

The database stores:

- Source workbook as `BYTEA`
- POD names as `TEXT[]`
- POD contents as `BYTEA[]`
- Generated workbook as `BYTEA`

This avoids temporary-disk lifecycle and multi-host filesystem issues, and lets queued jobs survive API restarts.

### Deployment migration

Run before deploying the new API:

```bash
pnpm --dir /home/clawdbot/.openclaw/workspace/aljeel-repo \
  --filter @aljeel/api exec prisma migrate deploy
```

The migration applied by that command is:

```text
20260819000000_solventum_chargeback_jobs
```

No migration was applied locally.

### Environment variables

New:

```text
SOLVENTUM_JOB_TTL_HOURS=24
```

Preserved existing controls:

```text
SOLVENTUM_POD_OCR_CONCURRENCY=3
SOLVENTUM_POD_EXTRACT_TIMEOUT_MS=120000
```

### Verification results

Prisma:

```text
The schema at prisma/schema.prisma is valid 🚀
✔ Generated Prisma Client (v6.19.3)
```

Requested builds:

```text
@aljeel/shared-types build: PASS
@aljeel/api build:          PASS
@aljeel/web build:          PASS
```

Web production build completed all 17 static pages. It emitted only the existing workspace-root and Next.js ESLint-plugin warnings.

Solventum tests:

```text
Test Files  4 passed (4)
Tests      32 passed (32)
```

Full AP test suite:

```text
Test Files  5 passed (5)
Tests      41 passed (41)
```

Breakdown:

```text
solventum-pod-parse.spec.ts                 9 passed
solventum-integration.service.spec.ts      17 passed
solventum-chargeback-job.service.spec.ts    4 passed
ap.controller.solventum-job.spec.ts         2 passed
ap.service.spec.ts                          9 passed
```

Targeted API and web ESLint checks passed with zero warnings.

The complete working-tree diff remains available without staging or committing via:

```bash
git diff
git diff --no-index /dev/null apps/api/src/ap/solventum-chargeback-job.service.ts
git diff --no-index /dev/null apps/api/src/ap/solventum-chargeback-job.service.spec.ts
git diff --no-index /dev/null apps/api/src/ap/ap.controller.solventum-job.spec.ts
git diff --no-index /dev/null apps/api/prisma/migrations/20260819000000_solventum_chargeback_jobs/migration.sql
```

No deployment, restart, or commit was performed.
