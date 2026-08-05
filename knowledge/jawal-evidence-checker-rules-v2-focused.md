# Jawwal AP Upload — Evidence Checker (Rules v2, FOCUSED — BLOCK only)

Scope (per Amr 2026-07-13): keep the gate tight on TWO things only —
  1. Every uploaded file is VALID (not corrupt / not fake / openable).
  2. Every invoice item is COVERED by evidence: a matching folder, and inside it the
     supporting document PLUS an OPEX form and/or an approval email thread (.msg/.eml).

No WARN tier. Every rule is a hard BLOCK. If any rule fails on any line/file, FINALIZE is
disabled. Pure pass/fail — the vendor either has valid + covered evidence for every invoice
item, or they cannot submit.

------------------------------------------------------------------------------------------

## GATE A — File validity (every uploaded file)  [BLOCK]

A1  Non-zero bytes. Reject 0-byte and partial uploads (`.tmp`, `.crdownload`, `.part`,
    `~$` Office lock files).
A2  Magic-byte sniff must match the real type — never trust the extension:
      PDF -> `%PDF-` header + `%%EOF`, not truncated.
      XLSX/XLSM -> valid ZIP, opens with the workbook reader.
      MSG/EML -> parses; has sender, subject, date.
      Images -> decode cleanly.
A3  PDF opens and renders: page count >= 1; NOT password/permission locked; has an
    extractable text layer OR a usable image layer for OCR.
A4  Workbook opens and contains the expected sheet (not a corrupt/incomplete ZIP).
A5  No empty folders. A folder with zero files = BLOCK.
A6  Safe filenames: no path traversal (`../`, absolute paths), no control/zero-width/RTL
    tricks. Normalize unicode (NFC) before any matching.

## GATE B — Coverage & evidence for every invoice item  [BLOCK]

B1  The invoice workbook is present, its header row is found, and every billable line has a
    Ref.No/Ticket identifier and a numeric `*Amount`. (Structural minimum to match on.)

B1a REF / TICKET FORMAT VALIDATION — STRICT, no typo tolerance. Every invoice Ref.No and
    Ticket value must be a well-formed, canonical reference:
      - Matches the expected pattern for its type (e.g. event serial DEPT-NN-YYYY like
        CE-20-2026, SIS-14-2026; ticket numbers = the exact expected digit length).
      - Correct segment widths: the sequence and year segments must have the exact digit
        counts. CE-202-26 is INVALID (sequence "202" + year "26" is malformed) and must be
        BLOCKED as a spelling mistake (REF_MALFORMED) — it is NOT auto-corrected to
        CE-20-2026.
      - No stray characters, doubled dashes, transposed digits, wrong separators, or
        trailing junk (e.g. "-new").
      - Duplicate Ref/Ticket within the batch = BLOCK (DUPLICATE_REF).
    NOTE (deliberate divergence): the deployed v30 PIPELINE matcher normalizes typos so an
    allocation still resolves (CE-202-26 -> CE-20-2026). The UPLOAD CHECKER does the
    OPPOSITE — it rejects the typo so the vendor fixes the source spreadsheet. Same
    reference, opposite policy by design.

B2  EVERY invoice line resolves to at least one matching evidence FOLDER on an EXACT
    canonical reference (after B1a has confirmed the ref is well-formed). Matching is
    case-insensitive and trims surrounding whitespace ONLY — it does NOT paper over
    malformed serials, missing/extra dashes, or wrong digit widths, and it is PREFIX-SAFE
    (SIS-14 must NOT match SIS-15). The invoice ref, the folder name, and the OPEX form
    serial must all agree exactly. No matching folder = BLOCK (NO_EVIDENCE_FOLDER); a
    folder whose name is itself malformed = BLOCK (FOLDER_REF_MALFORMED).

B3  Inside the matched folder, the SUPPORTING DOCUMENT for that line exists (the ticket /
    invoice-backup PDF for that Ref.No). Missing = BLOCK  (MISSING_SUPPORTING_DOC).

B4  APPROVAL EVIDENCE present for the line — at least ONE of:
      (a) an OPEX allocation form PDF for the event, OR
      (b) an approval email thread (.msg/.eml).
    Neither present = BLOCK  (MISSING_APPROVAL_EVIDENCE).
      - Sponsorship / event lines: the OPEX form is the required evidence. If the folder is
        an event folder (event serial present) and there is NO OPEX form, that is BLOCK even
        if a .msg exists  (MISSING_OPEX_FORM) — because the allocation cannot be built
        without it.
      - Non-event travel/ticket lines: an approval .msg thread satisfies B4.

B5  Event completeness: once an event's OPEX form is found, EVERY line of that event must be
    covered by it — no orphan event line left without the form's allocation = BLOCK
    (EVENT_LINE_UNCOVERED).

B6  Reverse coverage: every evidence folder maps back to at least one invoice line. A folder
    that matches no line = BLOCK  (ORPHAN_EVIDENCE_FOLDER) — no stray/mislabeled uploads.

------------------------------------------------------------------------------------------

## Gate logic

- Run Gate A then Gate B on every upload; produce a per-line + per-file checklist report.
- FINALIZE disabled while any BLOCK exists. Live count: X BLOCK, Z OK. Zero BLOCK = submit.
- Idempotent: re-running after fixes clears resolved items and keeps the audit log.
- Every finding: { code, line_ref / file_path, message, remediation_hint }.
- Emit machine-readable JSON alongside the human report for the pipeline to consume.

## Confirmed by Amr 2026-07-13

1. OPEX form is MANDATORY for sponsorship/event lines (a .msg alone is NOT enough). ✓
2. For non-event travel/ticket lines, an approval .msg thread IS sufficient. ✓
3. Ref/Ticket columns are strictly format-validated — no spelling mistakes allowed;
   CE-202-26 must be flagged, NOT matched to CE-20-2026. ✓ (B1a)

## Reuse notes (Codex, at build time)

- Ref/serial patterns: reuse the deployed v30 serial parser to KNOW the canonical shape,
  but in the checker run it in STRICT mode — validate/reject, do NOT normalize-and-accept.
- OPEX form discovery per event: reuse the deployed per-event form-linkage + OCR fallback.
- Prefix-safe matching (SIS-14 != SIS-15) stays; typo-normalization is DISABLED here.
- Keep all patterns/thresholds config-driven (expected digit widths, allowed DEPT codes).
