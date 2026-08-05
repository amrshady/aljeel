# Codex Brief — SO_Detail authoritative Agency (all Asateel batches)

## Context / prior art (READ FIRST)
Read `CODEX_bmx-agency-allocation-rootcause_2026-07-23.md` in this repo. It fully
diagnoses this issue. Summary: commit `e833ef3` deliberately made the supplier
workbook agency authoritative and demoted SO_Detail to "validate JQ + supply
SPERSON only." `load_so_detail()` in `asateel-sample/asateel_poc.py` now carries a
LOCKED comment ("Agency and organization columns must not influence allocation")
and reads only ORDER_NUMBER + SPERSON, never CAT_AGENCY. That is the root cause of
resolved Agency disagreeing with the Order Number. The 34 HOME_AGENCY_DISCREPANCY
exceptions in the current golden run are these mismatches (caught, not corrected).

## Goal
Make **SO_Detail the source of truth for Agency**, derived from the corresponding
Order Number (canonical JQ). The resolved Agency must ALWAYS come from SO_Detail's
CAT_AGENCY for the matching JQ. Applies to **ALL Asateel batches** (not P&T-only).

## Required behavior
1. Extend `load_so_detail()` to also retain, per canonical JQ, `CAT_AGENCY` (code)
   and `CAT_AGENCY_DESC` alongside the existing SPERSON. Remove/replace the LOCKED
   "must not influence allocation" restriction for agency specifically. Use ONE
   explicit SO_Detail index (do not keep the hidden so_detail_index vs
   employee_so_detail_index split described in the root-cause doc — unify it).
2. For each already-created supplier JQ unit, join SO_Detail strictly by canonical
   JQ and set the row's authoritative agency from the matched SO_Detail CAT_AGENCY.
   Retain supplier CC / DIV / Solution unless a business rule says otherwise — this
   change is AGENCY-ONLY, do not alter cost center, division, or solution
   resolution.
3. Write that canonical agency to BOTH the standalone `Agency` column (col 27/28)
   AND rebuild the Distribution Combination segment 7 from it. NEVER patch only the
   combo or only the standalone column. Populate the `SO_Detail Agency` column and
   the discrepancy columns.
4. Do NOT restore the old SO_Detail-driven row-splitting/expansion behavior — only
   the agency value changes; keep current per_jq / per_line split logic intact.
5. Preserve the BMX P&T junior->head employee remap and the projects-labadi
   override exactly as-is (those govern EMPLOYEE, not agency; and note recent commit
   e4dc025 gates BMX remap to P&T — leave that gate untouched).

## Missing / conflicting SO_Detail agency (Ahmed's decision)
When the matching JQ has NO SO_Detail agency, a blank/`00000` agency, or CONFLICTING
rows (same JQ, two different CAT_AGENCY):
- Do NOT silently fall back to supplier agency and do NOT guess.
- Emit a review exception (keep/extend the existing exception category, e.g.
  ALLOCATION_REVIEW or a clear new AGENCY_UNRESOLVED reason) AND **highlight the
  ENTIRE output row RED** in the Oracle XLSX so it is visually obvious it needs
  attention. (Red row = needs-attention, same spirit as existing severity fills.)
- The row must still be emitted (not dropped); it's flagged, not silently altered.

## Hard invariant gate
Add a final invariant check: for EVERY output row, Distribution Combination segment
7 MUST equal the standalone `Agency` value. If any row violates this, fail loudly.

## Golden gate (MANDATORY — do not skip)
`python3 qc/asateel_golden_check.py` currently prints `GOLDEN OK` (baseline GREEN,
185 rows, 92/0 reconciled). After your change it must STILL run and complete. The
golden expectations may legitimately shift because agency now comes from SO_Detail —
if golden assertions change, DO NOT silently loosen them. Instead: (a) show the
before/after diff of what changed and why each change is correct per the SO_Detail
source of truth, and (b) if the golden fixture's expected agencies were based on the
old supplier-authoritative behavior, flag that the golden baseline itself needs
re-blessing by a human (Ahmed), rather than editing the check to pass. Report the
exact HOME_AGENCY_DISCREPANCY count before/after.

## Deliverables
1. Patched `asateel-sample/asateel_poc.py` (agency ingestion + authoritative join +
   combo rebuild + red-row flag + invariant gate). Touch `pipelines/asateel.py` only
   as needed to unify the SO_Detail index.
2. Before/after: HOME_AGENCY_DISCREPANCY count, number of rows whose agency changed,
   number of rows flagged red (unresolved/conflict), golden check output.
3. A short REPORT with the diff and the golden-gate status. READ-ONLY on golden
   fixtures — do not edit the golden check to force a pass.
4. DO NOT deploy. Report the diff for review.
```
