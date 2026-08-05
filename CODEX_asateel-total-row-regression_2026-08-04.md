# Asateel Oracle-upload total-row regression investigation

## Executive finding

Confirmed. Both affected Oracle upload files contain a supplier workbook `Grand Total` row incorrectly emitted as an invoice distribution row.

The regression was introduced by commit `9eb290efaa03ce2afe3d2a469acd49f9794ba319` on **2026-07-27 09:38:44 UTC**, specifically the change that stopped dropping blank-JQ supplier rows. Its “usable allocation block” guard is too permissive: the total row’s `Division = "Grand Total"` satisfies the test even though it has no real CC/DIV/Agency allocation.

No files were edited and nothing was deployed.

## 1. Affected outputs confirmed

### Eastern — الشرقية 8-2026

Output: [Eastern-2026-2026_Oracle-upload.xlsx](</home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-الشرقية 8-2026/Eastern-2026-2026_Oracle-upload.xlsx>)

Source allocation workbook: [Eastren_8-2026.xlsx](</home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-الشرقية 8-2026/src/cmsehvdyb00mmpk7zcpc8jh1f-Eastren_8-2026.xlsx>)

The last output row is Excel row 27:

| Field | Value |
|---|---|
| Invoice | `04505` |
| Invoice Amount | `2645` |
| Amount | **`34400`** |
| Distribution Combination | `03-20100-61500027---00000-00000-00000-00-000000` |
| Match method | `supplier_blank_jq_unit` |
| Header subtotal | `2300` |
| Header total | `2645` |

In the source workbook:

- Row 29 is the real invoice `04505`, Amount `2300`, Warehouse allocation.
- Row 30 is `Grand Total`, with cached formula result `34400`.
- Row 30 has `Division = "Grand Total"` and Amount `34400`, but no invoice/JQ/agency/cost center.
- Header fill-down associates row 30 with invoice `04505`.

Eastern has an additional wrinkle: the legitimate row 29 contains bare JQ `14730`. Because nonblank malformed/bare JQs are rejected, the legitimate `2300` row is dropped from `supplier_jq_units`; the accepted total row then becomes the only emitted unit for invoice `04505`. Thus this case **replaces** the final legitimate amount with `34400`.

Output Amount sum is `66,500`, composed of `32,100` other rows plus the leaked `34,400`.

### Central — ادارة 11-26

Output: [Central-26-2026_Oracle-upload.xlsx](</home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-ادارة 11-26/Central-26-2026_Oracle-upload.xlsx>)

Source allocation workbook: [Main_11-2026_.xlsx](</home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-ادارة 11-26/src/cmsei7t6q00p7pk7zwtvneyjc-Main_11-2026_.xlsx>)

The last output row is Excel row 31:

| Field | Value |
|---|---|
| Invoice | `04478` |
| Invoice Amount | blank, due output header suppression |
| Amount | **`52200`** |
| Distribution Combination | `03-20100-61500027---00000-00000-00000-00-000000` |
| Line number | `2` |
| Match method | `supplier_blank_jq_unit` |
| Header subtotal | `2000` |
| Header total | `2300` |

In the source workbook:

- Row 35 is the legitimate final invoice `04478`, Amount `2000`.
- Row 36 is a mostly blank numbered template row.
- Row 37 is `Grand Total`, with Amount cell AK37 cached as `52200`.
- Row 37 has `Division = "Grand Total"` and no invoice/JQ/real allocation.
- Header fill-down carries invoice `04478` through rows 36–37.

Here the legitimate blank-JQ Warehouse row is retained, and the total row is appended as line 2. Output Amount sum is exactly **`104,400 = 52,200 × 2`**.

### `matched/`

The current [matched/asateel-oracle-upload.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-oracle-upload.xlsx) is the same Central result and contains the same row 31 leak.

No Eastern-named copy was found under `matched/` or `archive/matched/`; the runbook explains that `matched/asateel-oracle-upload.xlsx` is overwritten by each run.

## 2. Exact code path

### A. Supplier parser fills the invoice downward

In [asateel_poc.py:1635](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1635):

1. A nonblank invoice cell updates `current_inv`.
2. Blank subsequent rows use:
   `row_inv = description_inv or current_inv`
3. Therefore template, signature, and `Grand Total` rows inherit the last invoice.
4. The parser reads the total formula’s cached value as `amount`.
5. It reads `Grand Total` from the source Division column.
6. The resulting record is placed in `supplier_index[last_invoice]`.

This fill-down behavior predates the regression and is needed for genuine multi-line supplier entries, but it means downstream filtering must reliably distinguish data from footer rows.

### B. July 27 blank-JQ filter accepts the footer

The regression is at [asateel_poc.py:1698](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1698), especially lines 1702–1723.

For a blank JQ, the record is retained when:

```python
rec.get("amount") is not None
and any(
    _clean(rec.get(field))
    for field in ("agency", "cost_center", "division", "solution")
)
```

The `Grand Total` row passes because:

- `amount` is `34400` or `52200`; and
- `division` is the literal text `Grand Total`.

It is then labeled `supplier_blank_jq_unit`.

### C. Supplier units replace/expand PDF lines

At [asateel_poc.py:2145](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2145), the accepted records become `supplier_jq_units`.

At [asateel_poc.py:2171](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2171), any nonempty `supplier_jq_units` list becomes the authoritative `output_units`. Each unit’s amount is copied at lines 2173–2188.

Consequences:

- Central gets its legitimate row plus the footer row.
- Eastern’s legitimate bare-JQ row is rejected at lines 1707–1708, leaving only the footer unit.

At [asateel_poc.py:2557](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2557), `line_amount` is written directly to Oracle `*Amount`.

### D. Why the DC is `03-20100-...---00000...`

The footer has no valid agency, cost center, or division mapping. It follows the non-Warehouse branch because `is_warehouse_cc` is false.

At [asateel_poc.py:1241](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1241):

- Company defaults to `03`.
- Location is unconditionally the general default `20100`.
- Account defaults to `61500027`.
- Missing Cost Center and DIV produce adjacent empty segments: `---`.
- Solution and Agency default to `00000`.
- Project/Intercompany/Future default to `00000-00-000000`.

That produces exactly:

```text
03-20100-61500027---00000-00000-00000-00-000000
```

The `20100` default did not create the bad row; it only explains the bad row’s visible DC once the footer leaked.

### E. Production writer does not stop it

[pipelines/asateel.py:436](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:436) calls `build_rows`, then validates and writes the workbook.

The existing validation calculates per-invoice allocation mismatches, but they become catch/summary records rather than a pre-write failure. The DC assertion only verifies that standalone Agency matches DC segment 7; both are `00000` here, so it passes.

## 3. Regression history

| Date | Commit | Relevance |
|---|---|---|
| 2026-07-13 | `e833ef3f89a3202354d391cbab14cc038ca8b05a` | Supplier-authoritative parsing/fill-down structure. Did not accept blank-JQ rows because `supplier_jq_units_for_invoice` required a canonical `JQ-...`. |
| 2026-07-21 | `ec683755771098552135eb6a64f28e63f126805d` | Removed artificial single-line-to-multi-signal expansion. Not causal. |
| 2026-07-21 | `4e808b736b7d13ab7cb5597855ff8ee06296cc6b` | Added Warehouse DC pin. Not causal; legitimate Warehouse rows should use this path. |
| **2026-07-27** | **`9eb290efaa03ce2afe3d2a469acd49f9794ba319`** | **Regression introduced.** Blank-JQ rows were admitted if Amount plus any one allocation-text field was present. `Grand Total` in Division satisfies that test. Also introduced `supplier_blank_jq_unit`. |

Commit timestamp: **2026-07-27 09:38:44 UTC**.

This matches the runbook’s “Blank-JQ supplier lines are NOT dropped” locked-logic change. The intent—preserve legitimate blank-JQ Warehouse rows—was correct, but the footer exclusion does not implement the runbook’s stated requirement of a “usable allocation block.”

The SO_Detail v2 agency changes and cache in the same commit are not directly causal. The `03-20100` location behavior is older and merely exposes that the bad record took the generic non-Warehouse path.

## 4. Minimal proposed fix — not applied

The smallest robust correction is in `supplier_jq_units_for_invoice`, [asateel_poc.py:1709](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1709).

Replace the permissive “any raw allocation-looking text” condition with a check for a genuinely resolved allocation block. For example, require:

- a numeric Amount;
- a resolved Cost Center; and
- a resolved DIV code.

Conceptually:

```python
if not source_jq and not (
    rec.get("amount") is not None
    and _clean(rec.get("cost_center"))
    and _clean(rec.get("division_code"))
):
    continue
```

Why this is preferable to checking for the literal phrase `Grand Total`:

- It rejects totals, signatures, and other footer variants.
- It preserves legitimate blank-JQ Warehouse rows because they resolve to Warehouse CC and a valid DIV.
- It matches the runbook’s “usable allocation block” language.
- It is resilient to translated or differently labeled total rows.

A complementary early parser guard around lines 1635–1693 could explicitly exclude recognized summary/footer rows, but that should be defense-in-depth rather than the only fix.

Eastern’s bare-JQ `14730` should be reviewed separately. The minimal total-leak fix will prevent the `34400` footer row, but with current strict malformed-JQ logic the legitimate invoice `04505` allocation may still be absent. That is a distinct input/JQ-normalization issue.

## 5. Regression tests and golden-gate assertions

Add a focused fixture containing:

- One normal blank-JQ Warehouse row.
- One nonblank JQ allocation row.
- A blank-invoice `Grand Total` row containing a cached formula Amount.
- Signature/template rows after it.

Required assertions:

1. The legitimate blank-JQ Warehouse row is retained.
2. The `Grand Total` row is absent from `supplier_jq_units_for_invoice`.
3. No output row originates from a source row whose only allocation-like text is a summary label.
4. For every invoice:

   ```text
   sum(output *Amount) == reconciled/header subtotal
   ```

   within the established tolerance.

5. No nonzero item row may have both Cost Center and DIV blank.
6. Reject or flag this malformed allocation shape:

   ```text
   03-20100-<account>---00000-00000-...
   ```

7. A batch-level gate should fail before `write_excel` if any invoice has an allocation mismatch, unless the mismatch is an explicitly approved exception.
8. Golden fixtures should include a real `Grand Total` footer. The current golden workbook evidently did not expose this footer shape strongly enough to fail after the July 27 rebaseline.

The strongest financial control is the per-invoice subtotal invariant; checking only whether one Amount equals the batch grand total is a useful heuristic but not sufficient.

## 6. Risk to other outputs

Risk applies to outputs generated on or after commit `9eb290ef` when the Expenses Format has:

- blank-JQ legitimate rows, and
- a total/footer row carrying a cached Amount plus any nonempty Agency/CC/Division/Solution cell.

A scan of Oracle workbooks found the two confirmed recent failures:

- Central row 31: `52200`, malformed all-zero DC.
- Eastern row 27: `34400`, malformed all-zero DC.

The other **August 4** outputs generated before Central—Western 9, Central 18, and Projects 18—did not contain that exact malformed DC signature in the quick scan.

Some older outputs contain `03-20100-61500027---00000-...` rows, but most are not last-row grand totals and may instead be genuine unresolved allocations. They should be reviewed, not automatically classified as this regression. Notable files flagged by the coarse DC heuristic include Western 8, Projects 14/16, and Admin 8.

Recommended fleet-wide check:

- Flag any last output row with the malformed DC.
- Flag any row whose Amount equals the supplier sheet’s cached grand total.
- Flag any row whose Amount equals the sum of all other output Amounts.
- Compare per-invoice `sum(*Amount)` to header subtotal.
- Compare total output Amount to the source allocation-line total excluding footer rows.
- Trace suspicious rows back to `_supplier_match.row`; reject rows whose source has no invoice/description/JQ and no resolved CC/DIV allocation.

Central satisfies the strongest duplicate condition exactly: leaked Amount `52,200` equals the sum of all legitimate rows. Eastern is detectable through source-grand-total equality and the malformed final-row DC, even though its legitimate final `2,300` row was replaced rather than duplicated.
