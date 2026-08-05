# Codex brief: allow re-upload of an ARCHIVED Jawal invoice folder with the same name

Repo: /home/clawdbot/.openclaw/workspace/aljeel-repo (branch: main)
Mode: DIAGNOSE then FIX. Report the diff; do NOT commit, do NOT deploy.

## Reported bug (from a Jawal supplier)
A Jawal supplier cannot upload an invoice folder if it has the SAME NAME (batch ID,
e.g. J26-1080) as one that was previously uploaded and THEN ARCHIVED. The error the
supplier sees is the WRONG one:
  "The folder name is the Jawal batch ID and must follow the sequence format (J26-####) (for example (J26-1080))"
That JAWAL_INVALID_BATCH_ID message is misleading — the batch ID format is fine; the
real problem is a name collision with an archived invoice.

## What we want
1. Allow a supplier to re-upload / re-create an invoice folder using the same name as
   a previously-uploaded folder THAT HAS BEEN ARCHIVED (archivedAt != null). Archived
   invoices should NOT block reuse of the name.
2. If an upload IS still blocked for a legitimate reason (e.g. an ACTIVE/non-archived
   invoice already uses that name, or a genuinely malformed batch ID), show a CLEAR,
   DESCRIPTIVE, correctly-mapped error message explaining the real reason — never the
   batch-id message for a name-collision case.

## Key code facts already established (verify, then build on)
File: apps/api/src/invoices/invoices.service.ts — `createDraft()` (~line 108-190) and
`submit()` (~line 415-470).
- Prisma model Invoice has `@@unique([supplierId, invoiceNumber])` and a nullable
  `archivedAt DateTime?` (apps/api/prisma/schema.prisma ~line 217-262).
- In createDraft the duplicate checks DO NOT filter on archivedAt:
    - `existingDraft` query: status in [DRAFT, REJECTED]  (no archivedAt filter)
    - `alreadySubmitted` query: status notIn [DRAFT, REJECTED] -> throws
      ConflictException INVOICE_NUMBER_TAKEN (no archivedAt filter)
- Because the DB unique constraint spans [supplierId, invoiceNumber] and ignores
  archivedAt, an archived row still occupies the name, so a fresh create with the same
  name can hit a Prisma P2002 unique violation.
- JAWAL_INVALID_BATCH_ID_MESSAGE constant is at ~line 39. isValidJawalBatchId comes
  from @aljeel/shared-types.
- Web maps error codes in apps/web/src/lib/format-error.ts (INVOICE_NUMBER_TAKEN ->
  errors.invoiceNumberTaken/{name}; the client also has a pre-flight guard in
  apps/web/src/app/[locale]/invoices/new/page.tsx persistInvoice() that throws
  errors.jawalInvalidBatchId when !isValidJawalBatchId(folderName)).

## DIAGNOSE FIRST (report findings)
Explain the EXACT path that produces the batch-id message in the archived-collision
scenario. Two candidates to confirm/reject:
  (a) a Prisma P2002 unique-constraint error on invoice.create being caught and
      remapped somewhere to JAWAL_INVALID_BATCH_ID, or
  (b) the client-side guard / some other mapping firing.
Trace it concretely (grep the P2002 / error handling, the controller, and the web
create flow) before proposing the fix. State the true root cause.

## FIX REQUIREMENTS
- Make archived invoices NOT block name reuse. Decide the cleanest correct approach and
  justify it in the report. Options to weigh:
    * exclude archivedAt != null from the createDraft duplicate lookups AND handle the
      DB `@@unique([supplierId, invoiceNumber])` constraint so an archived row does not
      cause a P2002 (e.g. surface a proper ConflictException only when the colliding
      invoice is NOT archived; if the only collision is archived, allow creation —
      which may require a schema/constraint change or renaming/releasing the archived
      row's name). If a Prisma schema + migration change is needed, generate the
      migration under apps/api/prisma/migrations and update schema.prisma, but DO NOT
      run it against any DB — just include it and note that a migration deploy is
      required.
- Ensure the error surfaced for a REAL active-name collision is descriptive and
  correctly mapped (INVOICE_NUMBER_TAKEN -> "An invoice folder named \"{name}\" was
  already submitted…"), NOT the batch-id message.
- Keep the genuine JAWAL_INVALID_BATCH_ID check only for actually-malformed batch IDs.
- Do NOT touch the parked Asateel region-mismatch guard.

## Tests + verification
- Add/adjust unit tests in apps/api/src/invoices/invoices.service.spec.ts covering:
    * re-create with same name when prior invoice is ARCHIVED -> succeeds
    * re-create with same name when prior invoice is ACTIVE/non-archived -> throws
      INVOICE_NUMBER_TAKEN (descriptive), not batch-id error
    * malformed batch id -> still JAWAL_INVALID_BATCH_ID
- Run: pnpm --filter @aljeel/api test (or the invoices spec) and
  pnpm --filter @aljeel/api typecheck. Report results.

## Output
- Root-cause explanation (the exact mis-mapped path).
- The diff + files touched + any migration added.
- Test results. Then STOP — no commit, no deploy.
