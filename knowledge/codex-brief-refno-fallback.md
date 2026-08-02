# Codex Brief — Jawal Ref. No. Fallback Evidence Lookup (ADDITIVE, fallback-only)

## Objective
Add a **fallback-only** evidence lookup on the supplier's Ref. No. to the Jawal pipeline
(`aljeel/scripts/run_v30.py`). It must fire **only** when the existing per-row evidence
lookup finds NO files for a row. If files are found via Ref. No., treat them as that row's
evidence. Do not change how any currently-resolving row behaves.

## Hard constraints (NON-NEGOTIABLE)
1. **Existing lookup logic stays 100% unchanged** — same criteria, order, and primary keys.
2. Ref. No. lookup is a **fallback**, not a replacement. It runs ONLY on rows where the
   current logic returned no folder/no files (empty evidence).
3. A row that already resolves under current logic must be **byte-for-byte identical** in
   output — the fallback path must be unreachable for it.
4. No new required inputs; Ref. No. is already present on invoice rows.
5. If a row has no Ref. No., there is no fallback — leave it exactly as today.

## Context / current state
- There is already a `resolve_invoice_ref_folder(ref_no, invoice_ref_index)` helper and an
  `INVOICE_REF_FOLDER` route_reason in `run_v30.py` (~lines 2170-2200). Investigate whether
  this already runs as primary vs fallback, and make the Ref. No. resolution strictly a
  fallback for the empty-evidence case WITHOUT altering existing behavior for rows that
  already resolve. Prefer reusing existing helpers over new machinery.
- Origin case: batch J26-1108 row 29 — "DR FAHMI ALKAF - FOUR POINTS BY SHERATON MAKKAH -
  1 NTS. (26-1000)". 26-1000 is a supplier booking ref (no standalone ticket file);
  evidence lives under Ref. No. HF-2026-27.

## Behavior on fallback hit
- When fallback finds evidence via Ref. No., attach that folder as the row's evidence and
  set a distinct, visible route_reason / status so it is auditable (e.g. a REFNO_FALLBACK
  marker) — the row must MAP but remain reviewable, never silently blanked.

## Verification (MUST pass before shipping)
1. Golden gate: `python3 qc/asateel_golden_check.py` must print `GOLDEN OK` (regression
   guard for shared code paths) — do NOT confuse Asateel with Jawal, but confirm nothing
   shared regresses.
2. Re-run J26-1108 through the Jawal pipeline; confirm:
   - row 29 (26-1000) resolves with evidence from HF-2026-27, and
   - all other rows are unchanged vs the pre-change baseline
     (`batches/jawal-J26-1108/output.baseline-pre-red-20260731T125920Z/`).
3. Diff new output against baseline; the ONLY differences allowed are previously-empty rows
   now resolved via the Ref. No. fallback. Any change to a previously-resolved row = FAIL.

## Deliverables
- Minimal, guarded patch to `run_v30.py` (and helper modules if needed).
- A short note of exactly which rows changed in J26-1108 and why.
