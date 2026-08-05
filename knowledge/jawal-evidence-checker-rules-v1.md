# Jawwal AP Upload — Pre-Submission Evidence Checker (Rules v1)

Purpose: a hard validation gate baked into the Jawwal upload portal. It runs on every
submission BEFORE the batch can be finalized/approved. If any BLOCK-tier rule fails, the
"Finalize / Submit for Approval" button stays disabled. Goal: zero back-and-forth — the
vendor cannot submit a batch that has corrupt files, missing folders, or unmatched evidence.

Design principles:
- Trust nothing by extension or filename — sniff and open every file.
- Every invoice element must have matching evidence; every evidence item must map to a line.
- Presence is not enough — content must correspond (ticket no / amount / event serial).
- Every failure carries: code, severity, the invoice line/ref it belongs to, a human message,
  and a remediation hint. Re-runnable after fixes (idempotent).

Two severities:
- BLOCK  — finalize disabled until resolved (0 BLOCK required to submit).
- WARN   — can finalize, but must be explicitly acknowledged and is logged in the report.

------------------------------------------------------------------------------------------

## TIER 0 — File integrity (per uploaded file)  [BLOCK]

0.1  File is non-zero bytes. Reject 0-byte and partial uploads (`.tmp`, `.crdownload`,
     `.part`, `~$` Office locks).
0.2  Magic-byte sniff must match declared type (do NOT trust the extension):
       - PDF  -> starts `%PDF-`, has EOF `%%EOF`, not truncated.
       - XLSX/XLSM -> valid ZIP container, opens with the workbook reader.
       - MSG/EML -> parses; has sender, subject, date.
       - Images (jpg/png) -> decode cleanly, min 200x200.
0.3  PDF must be openable and renderable: page count >= 1; NOT password/permission
     locked; has an extractable text layer OR a usable image layer for OCR.
0.4  Workbook must open, contain the expected sheet, and not be a corrupt/incomplete ZIP.
0.5  No archive traversal / weird paths in filenames (`../`, absolute paths, control chars,
     mixed RTL/zero-width tricks). Normalize unicode (NFC) before matching.
0.6  No empty folders. A folder with no files = BLOCK (either evidence is missing or the
     folder is junk).
0.7  Oversize / bomb guard: reject files above the per-file ceiling and archives whose
     decompressed size is implausible.
0.8  Duplicate-content guard: two files with identical hash but different names inside the
     same submission -> WARN (possible accidental re-upload / padding).

## TIER 1 — Submission structure  [BLOCK]

1.1  Exactly one invoice workbook present and identified.
1.2  Required header row located; all required columns present (Ref.No/Ticket, Description,
     *Amount, and the accounting-segment columns the pipeline fills).
1.3  Every `*Amount` is numeric and >= 0; no text/blank amounts on billable lines.
1.4  Currency is consistent across the sheet.
1.5  Sum of line amounts reconciles to the invoice grand total, tolerance 0.00
     (allow a defined cent tolerance only if the vendor states one). Mismatch = BLOCK.
1.6  Batch metadata present: batch id, period start/end.

## TIER 2 — Coverage & linkage (the core "no orphan" gate)  [BLOCK]

2.1  EVERY invoice line resolves to at least one evidence folder, matched on a normalized
     key (ticket number and/or event serial). Case-insensitive, dash/space-insensitive,
     prefix-safe (SIS-14 must NOT match SIS-15; CE-202-26 == CE-20-2026). A line with no
     matching folder = BLOCK  (code: NO_EVIDENCE_FOLDER).
2.2  Each ticket/travel line has its ticket document (the PDF for that ticket) inside the
     matched folder. Missing = BLOCK (MISSING_TICKET_DOC).
2.3  Each line has an approval email (.msg/.eml) in the evidence chain. Missing = BLOCK
     (MISSING_APPROVAL_EMAIL).
2.4  Each sponsorship/event line has the OPEX allocation form in the event folder.
     Missing = BLOCK (MISSING_OPEX_FORM).
2.5  Reverse coverage: every evidence folder/file maps to at least one invoice line.
     An orphan folder = WARN (ORPHAN_EVIDENCE_FOLDER) — surfaces vendor mislabeling.
2.6  Event completeness: once an event's OPEX form is found, EVERY line of that event must
     inherit it — no orphan event lines left unallocated = BLOCK.
2.7  No required accounting segment left blank/`00000` after resolution on a billable line
     without an attached review reason = BLOCK (UNRESOLVED_SEGMENT).

## TIER 3 — Content correspondence (presence is not enough)  [BLOCK unless noted]

3.1  Ticket number printed in the PDF matches the line Ref.No. Mismatch = BLOCK
     (TICKET_NO_MISMATCH). Digit-transposition near-match = WARN with the candidate shown.
3.2  Amount on the ticket/supporting doc matches the line amount within tolerance.
     Mismatch beyond tolerance = BLOCK (AMOUNT_MISMATCH).
3.3  Event serial on the OPEX form matches the folder AND the line (prefix-safe).
     Mismatch = WARN (REF_FOLDER_MISMATCH) — vendor tagging inconsistency, human glance.
3.4  Approval email references the ticket/event/employee it is filed under. No linkage = WARN.
3.5  Document dates fall within the batch period (with grace window). Out of window = WARN.

## TIER 4 — Sponsorship allocation validity  [BLOCK unless noted]

4.1  OPEX form allocation table is parseable and has >= 1 employee row. Unparseable = BLOCK
     (OPEX_TABLE_UNREADABLE) -> route to OCR; if still unreadable, BLOCK for manual entry.
4.2  Every employee number on the form resolves in the Manpower master. Unknown employee =
     BLOCK (EMPLOYEE_NOT_IN_MASTER) — never guess.
4.3  If the form lists per-employee amounts, they must sum to the event/line total (tolerance
     0.00). If it lists employees but no amounts, even split is applied. A mix of some-with /
     some-without amounts = BLOCK (ALLOCATION_AMOUNT_INCONSISTENT).
4.4  Agency on the form resolves to a code; DIV/CC/Solution derivable from Manpower for that
     agency (per the deployed 2026-06-29 rule). Unresolvable agency = BLOCK (AGENCY_UNRESOLVED).
4.5  Split children reconcile EXACTLY to the parent line amount (cent remainder absorbed on
     first child). Any drift = BLOCK (SPLIT_NOT_CONSERVED).

## TIER 5 — Control / fraud soft checks  [WARN, configurable to BLOCK]

5.1  Self-approval: requester == approver on the same line = WARN (SELF_APPROVED).
5.2  Duplicate ticket/invoice number within this batch or against a prior finalized batch =
     WARN (DUPLICATE_REF) — escalate to BLOCK if the amount also matches (likely double-pay).
5.3  Round-number / outlier sponsorship amount above threshold with thin evidence = WARN.
5.4  Sponsorship above the OPEX-required threshold with no form = already BLOCK via 2.4.

------------------------------------------------------------------------------------------

## Gate logic

- Run all tiers on upload; produce a per-line + per-file checklist report (downloadable).
- FINALIZE is disabled while any BLOCK exists. Count of BLOCK / WARN shown live.
- WARN items require an explicit per-item acknowledgment (checkbox + who/when) before submit;
  acknowledgments are stored in the batch audit trail.
- Report is idempotent: re-running after fixes clears resolved items and keeps the audit log.
- Every finding row: { code, severity, line_ref / file_path, message, remediation_hint }.

## Report output (suggested)

- Summary banner: X BLOCK, Y WARN, Z OK — "Batch cannot be finalized" / "Ready to submit".
- Section per tier; expandable per-line detail.
- Machine-readable JSON alongside the human report for the pipeline to consume.

## Notes for implementation (Codex)

- Reuse the deployed normalized event-serial matcher (prefix-safe) for 2.1 / 2.6 / 3.3.
- Reuse Manpower master + agency-filtered resolver for 4.2 / 4.4.
- Reuse the amount-conservation splitter for 4.3 / 4.5.
- Tolerances, thresholds, and WARN->BLOCK escalations must be config-driven, not hardcoded.
