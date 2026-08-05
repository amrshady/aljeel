# Codex brief — J26-1140 rows 27-29: GL Description (col AF) wrongly says "Contribution"

## Context
Batch: J26-1140 (Jawal travel). Current output:
`batches/jawal-J26-1140/output/Spreadsheet-J26-1140-FILLED-v30.xlsx` (v30, header row 3, data from row 4).
A frozen read-only baseline of this exact output + code state is at
`batches/jawal-J26-1140/output/_BASELINE-20260804T090631Z/` — DO NOT touch it.

## The complaint (from AP clerk, via Ahmed Samy)
Excel rows 27, 28, 29 have **GL Description (column AF)** containing the word **"Contribution"**, and
the clerk says that's wrong — these rows are **NOT** Accrued Employee Annual Tickets either.
Find the ROOT CAUSE and propose a fix. REPORT THE DIFF, DO NOT DEPLOY, DO NOT `git push`.

## Observed data (from the current v30 xlsx)
All three rows share Distribution Combination `03-20100-21070229-170010-170-00000-00000-00000-00-000000`:
- col S Account = `21070229` (Accrued Employee Annual Tickets)
- col X Contribution = `Contribution`
- col W DIV = `170`, col U Cost Center = `170010`
- col AF GL Description = `Accrued Employee Annual Tickets · — · Contribution · General · General · 00000 · 00 · 000000`

Row 27: Description `MAKHLOUF/MOUNA MS - BEY RUH (4860966728)` — NOT a CHD/dependent.
  - AR Agent Account Rule = `L9_external_travel: not in Manpower, no OPEX ref`
  - AS Agent Segments Breakdown = `Co=03 Loc=20100 Acc=60301003 CC=999999 DIV=000 Sol=00000 Ag=00000 Proj=00000 IC=00 F1=000000`
  - BB Resolution Layer = `not_resolved`; BD = "All 9 layers failed for 'MAKHLOUF/MOUNA MS'"
  - i.e. the resolver's OWN breakdown says account should be `60301003` (Travel Tickets Expense),
    but the FINAL written account is `21070229`. **These disagree.**

Row 28: `MERHEB/MAJD MR(CHD) - BEY RUH (4860966729)` — CHD dependent
Row 29: `MERHEB/YASMINA MS(CHD) - BEY RUH (4860966730)` — CHD dependent
  - Both: AR = `family_cluster_family_MERHEB_25: CHD+cluster→PERSONAL (v15.11)`
  - BB Resolution Layer = `v29_dependent_guard`; BK Trip Account Override = `21070229`
  - AS Agent Segments Breakdown = `... Acc=21070229 ... DIV=888 Ag=88888 ...`
  - So for 28/29 the override to 21070229 is intentional (family cluster / personal),
    BUT the DIV/CC/Contribution segment shown (DIV=170, "Contribution") does NOT match the
    breakdown's DIV=888/Ag=88888, and the clerk still says the AF label is wrong.

## What to investigate
1. **GL Description (AF) construction.** It is built by `build_gl_description(final_combo, lookup)` in
   `scripts/cost_center_resolver.py`, invoked from `scripts/run_v30.py`
   (`sync_final_gl_descriptions`, ~line 4356; also ~4419 and ~4516). Trace exactly where the
   segment that prints as "Contribution" comes from — is it the `Contribution` column (X) value,
   a DIV/segment lookup, or a hardcoded fallback? Why does `170` / this combo resolve the
   contribution/2nd-segment to the literal string "Contribution" instead of a real division name
   (or a blank/`—`)?
2. **Account bleed on row 27.** Why is the final written account `21070229` when the resolver's own
   Agent Segments Breakdown + Account Rule (L9_external_travel) computed `60301003`? Something is
   overwriting the not_resolved external-travel account with the annual-tickets account. Find where
   (family-cluster override? bundled-ticket shared-PDF propagation? note row 28's flag
   `BUNDLED_TICKET_SHARED_PDF:4860966728` points back to row 27's ticket). Determine whether row 27
   is being swept into the MERHEB family cluster / 21070229 override incorrectly because it shares a
   bundled PDF, even though MAKHLOUF is a different family and not a CHD.
3. Confirm whether the correct behaviour is: row 27 → account 60301003 (external travel) with a
   correct AF description, and rows 28/29 → keep 21070229 but with a correct AF description that does
   NOT read "Contribution" (or reads the proper division/segment name).

## Deliverable
- Root-cause writeup for BOTH symptoms (the "Contribution" AF label, and the 21070229 account bleed on row 27).
- Minimal, additive, fallback-safe fix proposal with exact file+line diffs.
- Explicitly flag any risk of the fix regressing other rows / other batches (golden J26-640 must hold).
- DO NOT edit-and-deploy. Report the diff for human review. This is fix #1 of several; we batch all
  fixes and deploy once.
