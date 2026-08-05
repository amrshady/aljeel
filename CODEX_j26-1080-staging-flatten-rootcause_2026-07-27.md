# J26-1080 — True Root Cause: Staging Flattens Ticket Folders

Date: 2026-07-27
Investigator: AP Agent (operational diagnosis, Codex-assisted)

## Executive summary

The supplier submission was NOT the problem. Jawal Travel uploaded a correctly
foldered evidence pack, and the API preserved the full ticket-numbered paths in
the database. The folder structure was destroyed **at the pipeline staging step**
(`stageInvoiceDocuments()` in `jawal-integration.service.ts`), which flattens every
document to its basename before writing to the batch dir. The Python pipeline then
saw a flat `raw/` with no ticket folders and gated all 79 rows as missing evidence,
leaving Distribution Combination empty.

## Evidence chain

1. Invoice record (DB):
   - invoiceNumber `J26-1080`, supplierId `supplier_jawal`, status `APPROVED`
   - source `UPLOAD`, createdAt 2026-07-20, jawalTriggeredAt 2026-07-22
2. Supplier config is correct:
   - `supplier_jawal` → `erpIntegration: "JAWAL"` (guard WOULD route here)
3. Submit-time guard exists and is deployed:
   - commit `4e27e38` (Jul 14) added `JawalEvidenceCheckService`; in `main` history
   - running API (built + started Jul 26) has it compiled in `dist/`
4. Documents in DB preserved folder structure:
   - 149 / 150 document `fileName`s contain full relative paths WITH ticket folders,
     e.g. `01-07jul/01JUL/4860349359/MR_FARHAN_ALANAZI-7MQ2RS.pdf`
   - So upload path-preservation is working; supplier delivered proper layout
5. Staging DESTROYS the structure:
   - `stageInvoiceDocuments()` → `apps/api/src/ap/jawal-integration.service.ts:203`
   - line 218: `const fileName = \`${doc.id}-${this.sanitizeFileName(doc.fileName)}\`;`
   - `sanitizeFileName()` (line 485): `const base = name.split(/[\\/]/).pop()` — keeps
     basename only, drops all directory components
   - every file written FLAT into `<batchDir>/src/`
6. Pipeline preflight then reports NO_FOLDER for all tickets → missing_evidence_gate
   → segments blank → Distribution Combination empty.

## Verdict

- NOT a supplier/intake-validation failure. The submit gate and evidence check are
  fine; the supplier uploaded a valid foldered pack.
- The defect is in the API→pipeline **staging bridge**: it flattens ticket-numbered
  folders that both the supplier and the DB got right.

## Minimal fix (to be implemented via Codex, EDIT mode — NOT yet done)

In `stageInvoiceDocuments()`:
- Preserve the relative directory path from `doc.fileName` when writing to `src/`,
  recreating the ticket-numbered subfolders (mkdir -p on the parent), instead of
  collapsing to basename.
- Keep the `doc.id-` de-dup prefix only on the FILE basename, not on the folder path
  (or drop it and rely on folder isolation) so the pipeline's folder matcher keys on
  the ticket number correctly.
- Guard against path traversal: normalize and confirm the resolved target stays under
  `src/` (reject `..` escapes).
- Zero-regression: batches whose docs have no path separator continue to stage flat
  (and are now ALSO rescued by the flat-evidence matcher fix from
  CODEX_j26-1080-flat-evidence-fix_2026-07-27.md).

## Note on the two fixes

- The pipeline-side flat-evidence matcher (already implemented today) is a good
  DEFENSE-IN-DEPTH safety net: even if staging flattens, the pipeline can now
  recover by embedded ticket number.
- But the CORRECT primary fix is to stop flattening at staging so the pipeline gets
  the real folder structure the supplier provided.
