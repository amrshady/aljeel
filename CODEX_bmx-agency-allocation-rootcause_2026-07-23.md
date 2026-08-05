## Root cause

The bug is not in `build_distribution_combination()` and it is not an ordering/index swap.

The allocation pipeline intentionally stopped using `SO_Detail.CAT_AGENCY` and made the supplier Expenses Format agency authoritative. The AP clerk’s nine corrections restore the JQ-specific `CAT_AGENCY` values from SO_Detail into the combo.

The decisive change is commit `e833ef3`:

> `asateel: supplier-sheet authoritative agency; SO_Detail JQ-validation-only`

Before that change, SO_Detail’s agency was applied as the authoritative allocation. The removed code explicitly did this:

- read `CAT_AGENCY` and `CAT_AGENCY_DESC`;
- joined them by canonical JQ;
- replaced `resolved["agency_code"]`;
- recorded discrepancies as “SO_Detail used.”

The current implementation deliberately omits those fields at [asateel_poc.py:1377](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1377). Its comment at lines 1381–1383 says agency “must not influence allocation.” It now loads only `ORDER_NUMBER` and `SPERSON`, at lines 1401–1433.

Meanwhile, the supplier workbook agency becomes the resolved allocation at:

- [asateel_poc.py:954](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:954): supplier workbook is declared authoritative.
- [asateel_poc.py:1591](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1591): each JQ-expanded supplier record retains its supplier-row agency.
- [asateel_poc.py:2209](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2209): `supplier_match["agency_code"]` is copied into the allocation.
- [asateel_poc.py:2225](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2225): that supplier allocation replaces `resolved`.
- [asateel_poc.py:2312](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2312): the final agency code is taken from `resolved`.

## Answers to the three hypotheses

### 1. Is the combo built from a different variable than the Agency column?

No.

For every ordinary row, both values come from exactly the same variable:

- [asateel_poc.py:2384](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2384) writes `agency_code` to the standalone `Agency` column.
- [asateel_poc.py:2413](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2413) immediately calls `finalize_distribution()`.
- [asateel_poc.py:1246](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1246) builds segment 7 directly from `row["Agency"]`.

Warehouse rows are also synchronized: [asateel_poc.py:1259](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1259) writes the constant’s segments back into every standalone segment column before setting the combo.

Therefore the generated pipeline output cannot contain a combo/Agency mismatch. The mismatch exists only because the clerk edited column 14 without editing columns 27–28.

The current generated workbook confirms this invariant: before manual correction, every cited combo agency equals column 27.

### 2. Is there a per-invoice ordering/index misalignment?

No. The apparent swaps are source disagreements exposed by a correct JQ-keyed comparison.

Supplier records are expanded into JQ-specific units at [asateel_poc.py:1591](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1591), then emitted directly at lines 2064–2081. SO_Detail lookup uses the canonical JQ at lines 2146–2158. There is no `zip()` or parallel agency list whose index could drift.

The 04045 “swap” is conclusive:

- JQ `260009447`: supplier row says KLS Martin `10052`; global SO_Detail says Bio-Rad `10111`.
- JQ `260009113`: supplier row says Bio-Rad `10111`; global SO_Detail says KLS Martin `10052`.

Those are exactly the clerk’s two corrections. The values look swapped only because the two source systems assign opposite agencies to those two JQs.

Other cited corrections similarly agree with SO_Detail:

- `260009496`: SO_Detail `10111`, not supplier `10071`.
- `260009898`: SO_Detail `10153`, not supplier `10111`.
- `260008724`: SO_Detail `10081`, not supplier `10155`.
- `260009487` and `260009490`: SO_Detail `10111`, not supplier/BMX `10153`.

Thus the join key is working; the wrong precedence rule is being applied.

`Additional Information` does not drive the agency join. It is merely serialized from the same supplier record at [asateel_poc.py:1710](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1710). Its employee prefix is the supplier-sheet employee, while output `Employee No` may come from SO_Detail `SPERSON`, creating another intentional source split.

### 3. What does blank SO_Detail Agency mean?

It does not mean SO_Detail was completely unavailable.

The production wrapper creates two different SO_Detail indexes:

- [pipelines/asateel.py:376](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:376): allocation/debug `so_detail_index` is `{}` when `--so-detail` is omitted.
- [pipelines/asateel.py:377](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:377): `employee_so_detail_index` silently loads the global reference even when `--so-detail` is omitted.

The second index is passed separately at [pipelines/asateel.py:425](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:425) and supplies output Employee No through [asateel_poc.py:2150](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2150).

But `_so_detail_agency` is unconditionally initialized to blank at [asateel_poc.py:2196](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2196), and the loader no longer reads `CAT_AGENCY` at all. Therefore column 37 is guaranteed blank under current code, even though the global SO_Detail file is actively used for `SPERSON`.

The fallback is explicit:

- agency: supplier Expenses Format/workbook;
- employee: global SO_Detail `SPERSON`;
- project employee overrides: Labadi lookup/BMX mapping.

It is not a silent exception caused by a failed join. It is the designed precedence introduced by `e833ef3`.

## Precise conclusion

Hypothesis 3 is closest, with an important correction:

- SO_Detail wiring is not simply missing.
- It is split and deliberately disabled for agency allocation.
- The global SO_Detail is still loaded for employee resolution.
- The supplier-workbook fallback/precedence is the source of the nine wrong combo agencies.
- Hypotheses 1 and 2 are false.

The project resolver is not the root cause. It resolves the agency supplied to it first and normally preserves that canonical agency; see [asateel_project_allocation.py:332](/home/clawdbot/.openclaw/workspace/aljeel/scripts/asateel_project_allocation.py:332) and lines 353–365. It does not independently derive agency from JQ.

## Recommended fix

Restore JQ-keyed `CAT_AGENCY` ingestion for project/P&T batches, without restoring the old SO_Detail-driven row-splitting behavior:

1. Extend `load_so_detail()` to retain validated `CAT_AGENCY` and `CAT_AGENCY_DESC`, alongside `SPERSON`.
2. Use one explicit SO_Detail input/index rather than the hidden `so_detail_index` versus `employee_so_detail_index` split.
3. For each already-created supplier JQ unit, join SO_Detail strictly by canonical JQ.
4. In project/P&T mode, set the row’s canonical agency from the matched SO_Detail `CAT_AGENCY`; retain supplier CC/DIV/Solution unless business rules say otherwise.
5. Write that canonical agency to both columns 27–28 and rebuild the combo from it. Never patch only the combo.
6. Populate `SO_Detail Agency` and the discrepancy columns.
7. Treat missing, duplicate-conflicting, `00000`, or unknown SO_Detail agency as a review exception rather than silently choosing supplier agency.
8. Add a final invariant gate: combo segment 7 must equal standalone `Agency` for every output row.

This would reproduce the clerk’s valid corrections while preventing the internally inconsistent workbook she produced by editing only column 14. No files were modified.
