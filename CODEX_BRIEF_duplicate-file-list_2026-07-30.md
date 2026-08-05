# Codex brief: show suppliers EXACTLY which files are duplicated (DUPLICATE_FILE_SUBMISSION)

Repo: /home/clawdbot/.openclaw/workspace/aljeel-repo (branch: main)
Mode: FIX. Report the diff; do NOT commit, do NOT deploy.

## Problem
When a Jawal supplier submits an invoice folder that contains files byte-identical to
files already submitted on another (non-draft) invoice, the API blocks with
`DUPLICATE_FILE_SUBMISSION` (Layer 1 cross-invoice hash gate in
apps/api/src/invoices/invoices.service.ts, in `submit()`). Two UX problems:

1. The API uses `prisma.document.findFirst(...)` and reports only ONE colliding file,
   even when many files collide (real case: 12 duplicated files across the batch).
2. The message only names the PRIOR invoice ("This file was already submitted on
   invoice J26-1080 (<timestamp>)."), not clearly WHICH file(s) in the supplier's
   current upload are the duplicates. The web client (apps/web/src/lib/format-error.ts)
   has NO case for `DUPLICATE_FILE_SUBMISSION`, so it just echoes the raw API string.

Goal: tell the supplier exactly which file(s) are duplicated (path/name) and which prior
invoice each already exists on, so they can find and remove them. List ALL duplicates,
not just the first.

## API change — apps/api/src/invoices/invoices.service.ts (submit(), the documentChecksums block ~lines 552-595)
- Replace the single `findFirst` duplicate lookup with a `findMany` that returns ALL
  documents whose checksum collides with the current invoice's document checksums under
  the SAME existing filters (checksumSha256 in [...], virusScanStatus != FAILED,
  invoiceId != current id, invoice.supplierId == supplierId,
  invoice.status notIn [DRAFT, REJECTED]).
  - IMPORTANT: also add `invoice: { archivedAt: null }` to the filter — an archived prior
    invoice should NOT block a new submission (consistent with the archived-reuse fix we
    just shipped; confirm this is correct and note it in the report).
- Build a de-duplicated list of collisions. For EACH colliding checksum, identify:
    * the file name/path AS IT APPEARS IN THE CURRENT invoice being submitted (so the
      supplier recognizes it in their own folder) — match current documents by checksum.
    * the prior invoiceNumber it already exists on (pick the earliest prior invoice by
      invoice.createdAt asc, then document.createdAt asc — same ordering intent as today).
- Keep throwing ConflictException with code `DUPLICATE_FILE_SUBMISSION`, but:
    * message: keep a sensible human summary, e.g.
      `"{n} file(s) in this upload were already submitted on other invoices. Remove them and try again."`
      (n = number of duplicated files). Keep it single-line, no PII beyond file names/invoice ids.
    * details: return a structured array so the client can render specifics, e.g.
      details: {
        duplicateCount: number,
        duplicates: Array<{ fileName: string; priorInvoiceNumber: string; priorSubmittedAt: string }>
      }
      where fileName is the CURRENT-upload path. Keep the existing top-level fields too if
      cheap (backward compat), but the array is the important part.
- Do not change the hash/gate LOGIC (still blocks real cross-invoice duplicates). Only
  the reporting + archived-exclusion.

## Web change
### apps/web/src/lib/format-error.ts
- Add a `case 'DUPLICATE_FILE_SUBMISSION':` in the switch in `formatInvoiceError`.
- Read `err.details.duplicates` (array). If present, produce a clear message listing the
  file names (and prior invoice per file). Because this can be many files, format as a
  concise list. Use a new i18n key with ICU pluralization + a joined file list. Suggested:
    t('errors.duplicateFiles', { count, files })
  where `files` is a newline- or comma-joined list of `"<fileName> (already on <priorInvoiceNumber>)"`.
  If details/array missing, fall back to err.message.
- Keep the existing helper structure; don't break other cases.

### apps/web/messages/en.json and ar.json (invoiceForm.errors)
- Add key `duplicateFiles`. Example EN:
  "duplicateFiles": "{count, plural, one {# file was} other {# files were}} already submitted on other invoices. Please remove {count, plural, one {it} other {them}} and try again:\n{files}"
- Provide a natural Arabic translation with the same {count} and {files} placeholders.
- Do NOT alter unrelated keys.

## Tests + verification
- Update/extend apps/api/src/invoices/invoices.service.spec.ts:
    * multiple colliding files -> ConflictException DUPLICATE_FILE_SUBMISSION with
      details.duplicates listing ALL of them (count matches), fileName = current path.
    * a collision whose only prior invoice is ARCHIVED -> does NOT block (no throw from
      this gate).
    * no collisions -> no throw.
- Run: pnpm --filter @aljeel/api test (invoices spec) and pnpm --filter @aljeel/api typecheck.
- Also run pnpm --filter @aljeel/web typecheck (format-error + JSON changes).
- Report results.

## Output
- The diff + files touched.
- Confirm the archived-exclusion decision.
- Test + typecheck results. Then STOP — no commit, no deploy.
