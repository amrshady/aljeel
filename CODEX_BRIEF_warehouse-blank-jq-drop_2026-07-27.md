# Codex Brief — Asateel: blank-JQ Warehouse line is silently dropped

## Symptom (confirmed by finance: this is a bug, not a data gap)
In batch `وسطي 17-2026`, invoice **04235** does NOT reconcile. Header gross = 747.50 SAR
(= 650 net × 1.15 VAT). It has TWO supplier lines in the Expenses Format sheet, but the
pipeline only emits ONE, so allocation_sum = 325 (373.75 gross), delta = -373.75.

Supplier "Expenses Format" rows for 04235 (verified in
`batches/asateel-وسطي 17-2026/src/Central_17-2026_Zcleared.xlsx`, sheet "Expenses Format",
header row 8; JQ = col X/24, Agency = col AF/33, CostCenter = col AJ/36, Amount = col AK/37):
- row 31: N=04235, X(JQ)=`JQ-26128627`, AF=`Bio-Rad`, AJ=`IVD Solutions`, AK=325  → KEPT (line 1)
- row 32: N=blank(same invoice), X(JQ)=**blank**, AF=`S&M`, AJ=`Warehouse`, AK=325 → **DROPPED**

The dropped line is a **Warehouse** line. Per AlJeel finance, a Warehouse line **legitimately
has no JQ** — a blank JQ on a Warehouse row is normal and expected, NOT a supplier error.

## Root cause to find & fix
The per-JQ expansion / supplier-match path (see `asateel-sample/asateel_poc.py` around the
JQ-unit expansion ~line 1591 and the supplier-match/allocation emit ~lines 2064-2225) appears
to require a non-empty JQ to emit a row, so a blank-JQ supplier line is discarded instead of
emitted. This drops legitimate Warehouse lines and breaks invoice reconciliation.

There is ALREADY a Warehouse concept in the engine:
- `is_warehouse_cc` detector (cost center 140040 / cost_center_name 'warehouse')
- `WAREHOUSE_DISTRIBUTION_COMBINATION` constant + `finalize_distribution()` helper
  (commit 4e808b7): every Warehouse row must output DC
  `03-40100-61500027-140040-190-00000-10200-00000-00-000000`
  (Location 40100, Agency 10200/S&M, DIV 190).

## Required fix
1. A supplier Expenses Format line with a **blank JQ** must NOT be silently dropped. Emit it as
   a normal allocation row (one output row per supplier line), carrying its supplier
   Amount / CostCenter / Division / Solution / Agency as usual.
2. For a blank-JQ **Warehouse** line specifically (detected via the existing `is_warehouse_cc`),
   route it through the existing Warehouse-pin path (`finalize_distribution()` /
   `WAREHOUSE_DISTRIBUTION_COMBINATION`) so it gets the pinned Warehouse DC and consistent side
   columns (Location 40100 / Agency 10200 S&M / DIV 190), exactly as committed in 4e808b7.
   No JQ is required for these rows.
3. Do NOT attempt SO_Detail agency resolution or JQ validation on a blank-JQ line (there is no JQ
   to join on). It must not become RED for "JQ missing from SO_Detail" — a blank JQ is a valid
   Warehouse case, distinct from "a JQ that is absent from SO_Detail".
4. Preserve the existing per-JQ split behavior for lines that DO have JQ(s). This change is
   ONLY about not dropping blank-JQ lines and correctly Warehouse-pinning them.
5. Keep the hard invariant: for every output row, Distribution Combination segment 7 ==
   standalone Agency column.

## Scope / non-goals
- AGENCY-ONLY logic, CC/DIV/Solution/employee/split logic for JQ-bearing lines: unchanged.
- Do NOT touch the v2 agency-resolution matrix work already uncommitted in the tree
  (that is being bundled separately). Build ON TOP of the current working tree; do not revert
  the uncommitted `asateel_poc.py` / `pipelines/asateel.py` changes.
- Keep the BMX P&T junior->head remap gate (commit e4dc025) untouched.

## Verify (MANDATORY — do not game)
1. Re-run 04235 (cache is warm) and show it now emits BOTH lines: Bio-Rad 325 (JQ) +
   Warehouse/S&M 325 (blank JQ, pinned Warehouse DC), allocation_sum = 650 net = 747.50 gross,
   delta = 0, reconciled = true. Command:
   ```
   python3 pipelines/asateel.py --folder CENTRAL --full \
     --pdf-dir 'batches/asateel-وسطي 17-2026/src' \
     --expenses-format 'batches/asateel-وسطي 17-2026/src/Central_17-2026_Zcleared.xlsx' \
     --so-detail 'reference/SO_Detail_Labadi_1_R21_AA.xlsx'
   ```
2. Run the golden gate `python3 qc/asateel_golden_check.py`. Report before/after row counts and
   status distribution. If the golden batch legitimately gains a previously-dropped blank-JQ
   Warehouse row, DO NOT edit the golden fixtures — report that the baseline needs human
   (Ahmed) re-blessing and show the exact diff.
3. Confirm the segment-7 == Agency invariant holds on the 04235 output.

## Deliverables
- Combined diff + files touched.
- 04235 before/after (rows, sums, delta, reconciled).
- Golden gate output + whether baseline needs re-blessing.
- DO NOT deploy. Report the diff for review.
