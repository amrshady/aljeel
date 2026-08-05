# Codex Brief — ingest SPLIT output (one employee per line)

## Context
The Jawal reconciliation pipeline produces TWO output files per batch in
`/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-<BATCH>/output/`:
- `Spreadsheet-<BATCH>-FILLED-v30.xlsx` — one row per invoice ticket (multi-employee
  sponsorship allocations kept collapsed on a single row).
- `Spreadsheet-<BATCH>-FILLED-v30-SPLIT.xlsx` — multi-employee sponsorship rows
  exploded into ONE ROW PER EMPLOYEE. This is the finance-correct Oracle upload
  (confirmed by AP owners: Oracle requires one employee per line).

The vendor platform ingests the resolved output as the clerk-downloadable
ORACLE_UPLOAD document via `findResolvedOutput()` in
`apps/api/src/ap/jawal-integration.service.ts` (~line 405). It currently selects
the NON-split `FILLED-v30.xlsx`, so clerks get the collapsed file (missing the
per-employee allocation rows).

## Change required (MINIMAL / surgical)
In `apps/api/src/ap/jawal-integration.service.ts`, `findResolvedOutput()`:
1. Prefer the SPLIT file first: build `expectedSplit =
   Spreadsheet-<invoiceNumber>-FILLED-v30-SPLIT.xlsx` and return it if it exists.
2. Fall back to the existing non-split `FILLED-v30.xlsx` only if the SPLIT file is
   absent (backward compatibility / older batches).
3. Update the directory-scan fallback so it prefers a filename matching
   `-split` (case-insensitive) over a plain `filled` match, before defaulting to
   the first xlsx.

Do NOT change anything else (ingest, audit, polling, storage all stay the same).
The SPLIT file has the same column layout as FILLED, so downstream ingest is
unaffected.

## Verify
- `pnpm --filter @aljeel/api build` (or the repo's tsc/nest build) compiles clean.
- Show the unified diff of the single function.
- Do NOT deploy, do NOT restart services. Report the diff only.

## Working dir
`/home/clawdbot/.openclaw/workspace/aljeel-repo`
