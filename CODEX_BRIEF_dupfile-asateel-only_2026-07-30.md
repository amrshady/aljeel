# Codex brief: restrict DUPLICATE_FILE_SUBMISSION gate to Asateel only (skip for Jawal)

Repo: /home/clawdbot/.openclaw/workspace/aljeel-repo (branch: main)
Mode: FIX. Report the diff; do NOT commit, do NOT deploy.

## Context
In apps/api/src/invoices/invoices.service.ts, `submit()` runs a cross-invoice
duplicate-file hash gate (the `documentChecksums` block that throws
ConflictException code `DUPLICATE_FILE_SUBMISSION`). It currently applies to ALL
suppliers regardless of erpIntegration.

Business decision (confirmed by AP clerk via Ahmed): this duplicate-file rule
should apply to **ASATEEL only**. For **JAWAL** suppliers the gate must be
SKIPPED entirely (Jawal legitimately reuses shared evidence across batches; AP
will handle any duplicate review manually).

## Change
- The `supplier` object (with `erpIntegration`) is already fetched earlier in
  `submit()` — reuse it; do NOT add another query.
- Wrap/guard the entire `documentChecksums` duplicate-lookup-and-throw block so it
  ONLY executes when `supplier?.erpIntegration === 'ASATEEL'`.
  - For any non-Asateel supplier (Jawal and others), the block is skipped: no
    checksum lookup, no DUPLICATE_FILE_SUBMISSION throw.
- Do NOT change the recently-added multi-file duplicate reporting logic itself
  (details.duplicates[], archived exclusion, EN/AR web formatting) — that all
  stays; it just now only fires for Asateel.
- Leave all other gates (Jawal batch-id, Jawal evidence, Asateel region/manifest,
  invoice math, invoice-number uniqueness) untouched.

## Tests
- Update apps/api/src/invoices/invoices.service.spec.ts:
    * ASATEEL supplier + colliding files -> still throws DUPLICATE_FILE_SUBMISSION
      (keep existing multi-file assertions).
    * JAWAL supplier + colliding files -> does NOT throw from this gate (submit
      proceeds past the duplicate check).
- Run: pnpm --filter @aljeel/api test (invoices spec) + pnpm --filter @aljeel/api typecheck.
- Report results.

## Output
- Diff + files touched.
- Test + typecheck results. Then STOP — no commit, no deploy.
