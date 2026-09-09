The J26-1140 output materially differs from the clerk’s final Oracle upload. The Golden Gate/scorer needs tuning: its semantic comparisons are useful, but column discovery is not genuinely batch-agnostic and the fixed J26-1108 fixture cannot detect new-batch drift by itself.

No committed files were modified.

### Scorer diagnosis

`discover_columns()` successfully discovers the J26-1140 clerk columns by normalized header name:

- `Description` → 11
- `*Amount` → 14
- `Employee No` → 17
- `Distribution Combination[..]` → 15
- Segment fields → 18–28

The scorer then rejects those valid results because it applies a J26-1108-specific positional assertion:

```python
expected = {
    "j26-1108": {
        "description": 11,
        "amount": 13,
        "emp_no": 18 if cols["emp_no"] == 18 else 16,
    },
}.get(profile)
```

The clerk workbook has a blank column 12 after `Description`, shifting `*Type`, `*Amount`, and `Employee No`. `_load_rows()` itself is already correctly name-driven through `_cell(values, layout.columns, name)`; the positional check is the only blocker.

Sheet selection is also correct: because there is no `Details` sheet, the active `Sheet1` is used, not the `Sheet2` tax-invoice tab.

### Minimal proposed diff

Remove only the contradictory positional assertion and retain the existing required-header and ambiguity checks:

```diff
--- a/qc/score_against_truth.py
+++ b/qc/score_against_truth.py
@@ -171,13 +171,6 @@ def discover_columns(path: Path) -> WorkbookLayout:
         raise ValueError(f"Expected one scoring header in {path}, discovered {len(candidates)}")
     ws, header_row, cols = candidates[0]
     profile = "j26-1108" if header_row == 3 and "invoice_ref" in cols and "description" in cols else "j26-640"
-    expected = {
-        "j26-1108": {"description": 11, "amount": 13, "emp_no": 18 if cols["emp_no"] == 18 else 16},
-    }.get(profile)
-    if expected:
-        mismatched = {key: (expected[key], cols.get(key)) for key in expected if cols.get(key) != expected[key]}
-        if mismatched:
-            raise ValueError(f"Unexpected {profile} column indices in {path}: {mismatched}")
     return WorkbookLayout(path, ws.title, header_row, cols, profile)
```

I applied this only to `/tmp/score_against_truth_j261140.py`. On the J26-1108 fixture, the original and patched scorers produced exactly equal score dictionaries, so this change does not alter existing J26-1108 scoring semantics.

The currently committed J26-1108 gate was not green before this proposed change: it reports substantial artifact/expected-snapshot drift, including a pipeline SHA mismatch. That existing baseline issue is independent of the spacer-column fix.

### J26-1140 score

All rates use the 65 clerk invoice rows as denominator.

| Field | Match | Mismatch | Rate |
|---|---:|---:|---:|
| account | 58 | 7 | 89.2% |
| cc | 51 | 14 | 78.5% |
| div | 51 | 14 | 78.5% |
| solution | 59 | 6 | 90.8% |
| agency | 49 | 16 | 75.4% |
| emp_no | 44 | 21 | 67.7% |
| All five segments | 48 | 17 | 73.8% |
| All five + employee | 36 | 29 | 55.4% |

Breakdown:

| Type | Evaluated | All five | All five + employee |
|---|---:|---:|---:|
| Sponsorship | 10 | 5/10 (50.0%) | 5/10 (50.0%) |
| Travel | 55 | 43/55 (78.2%) | 31/55 (56.4%) |

Sponsorship employee pairing also reports 4 missing and 4 extra employee allocations.

### Row-count alignment

- Pipeline worksheet: 69 Excel rows total = 3 header rows + 66 data rows.
- Clerk `Sheet1`: 68 Excel rows total = 3 header rows + 65 invoice-number/data rows.
- Paired/evaluated: 65 clerk rows.
- Extra pipeline row: Excel row 40, ticket `4860966773`, `AYESH/ZAKARIA ENG`, amount `0.00`.
- No clerk-only logical groups.
- The extra pipeline row causes later paired Excel row numbers to be offset by one.

### Specific differing rows

Notation is `truth → pipeline`; `T/P` are clerk/pipeline Excel row numbers.

- T13/P13 `4860901785`: emp_no `1000124 → blank`
- T14/P14 `4860901790`: emp_no `1000526 → 1001089`
- T20/P20 `26-1049`: cc `160014 → 999999`; div `170 → 0`; solution `10017 → 0`; agency `10072 → 0`
- T21/P21 `26-1051`: cc `160014 → 250010`; div `170 → 120`; solution `10050 → 0`; agency `10072 → 10206`; emp_no `1000820 → 1001008`
- T25/P25 `4860966722`: cc `250010 → 999999`; div `120 → 0`; agency `10206 → 0`
- T27/P27 `4860966728`: cc `0 → 999999`; div `192 → 0`; emp_no `1002576 → blank`
- T28/P28 `4860966729`: cc `0 → 999999`; div `192 → 888`; agency `0 → 88888`; emp_no `1002576 → blank`
- T29/P29 `4860966730`: cc `0 → 999999`; div `192 → 888`; agency `0 → 88888`; emp_no `1002576 → blank`
- T30/P30 `4860966755`: emp_no `1001288 → 1002435`
- T31/P31 `4860966756`: emp_no `1001288 → 1002435`
- T32/P32 `4860966757`: emp_no `1001256 → 1002294`
- T35/P35 `26-1065`: cc `160011 → 250010`; div `196 → 120`; agency `10239 → 10206`; emp_no `1002620 → 1001008`
- T37/P37 `4860966770`: account `60308009 → 60301003`; cc `160014 → 999999`; div `170 → 0`; solution `10050 → 0`; agency `10072 → 0`
- T38/P38 `4860966771`: emp_no `1000348 → 1000388`
- T45/P46 `4860966797`: emp_no `1002391 → 1000480`
- T46/P47 `4861013053`: emp_no `1002098 → 1000480`
- T47/P48 `4861013054`: emp_no `1002391 → 1000450`
- T48/P49 `4861013055`: emp_no `1002391 → 1000450`
- T49/P50 `4861013058`: account `60308007 → 60301003`; cc `140040 → 999999`; div `190 → 0`; agency `10200 → 0`; emp_no `1002694 → blank`
- T51/P52 `4861013085`: agency `10038 → 10156`
- T52/P53 `4861013086`: agency `10039 → 10156`
- T53/P54 `4861013087`: agency `10039 → 10156`
- T54/P55 `4861013088`: emp_no `1002144 → 1000975`
- T56/P57 `26-1073`: account `11014111 → 60307021`; cc `0 → 160012`; div `0 → 194`; agency `0 → 10153`
- T59/P60 `4861013115`: account `21070229 → 60301003`; cc `160030 → 999999`; div `190 → 0`; agency `10200 → 0`
- T60/P61 `4861013130`: emp_no `1002391 → 1002405`
- T61/P62 `26-1075`: account `60307021 → 60301003`; cc `160014 → 250010`; div `170 → 120`; solution `10017 → 0`; agency `10072 → 10206`; emp_no `1001762 → 1001008`
- T62/P63 `26-1076`: account `60307021 → 60301003`; cc `160014 → 250010`; div `170 → 120`; solution `10017 → 0`; agency `10072 → 10206`; emp_no `1001959 → 1001008`
- T66/P67 `26-1082`: account `60307021 → 60301003`; cc `160014 → 250010`; div `170 → 120`; solution `10017 → 0`; agency `10072 → 10206`; emp_no `1000640 → 1001008`

### Assessment and recommendation

The Golden Gate needs tuning.

The J26-1108 gate is effective as a frozen regression test for one reviewed artifact and scorer behavior. It is not sufficient to catch J26-1140-style operational drift because:

- It assumes particular column positions even though loading is otherwise header-name based.
- It validates a fixed historical pipeline artifact rather than freshly generated output.
- It cannot reveal drift unique to a later batch until that batch receives reviewed truth and is explicitly scored.
- Its current baseline is already failing due to unrelated committed-artifact drift.

Recommended changes:

1. Apply the minimal removal above.
2. Keep required-header, duplicate-header, sheet, and header-row validation.
3. Add a structural test fixture containing the spacer column and assert that `amount=14`, `emp_no=17` is accepted and loaded correctly.
4. Retain the existing no-spacer J26-1108 fixture and assert identical scoring results.
5. Add explicit invoice-row count and unmatched-row thresholds to batch gates.
6. Separate:
   - scorer unit/fixture regression,
   - frozen artifact integrity,
   - fresh batch-vs-clerk acceptance scoring.
7. Add acceptance thresholds by travel and sponsorship; the J26-1140 sponsorship result of 50% all-five should independently fail even if the aggregate rate were acceptable.

Bottom line: J26-1140 represents real pipeline drift, not a scorer-only false alarm. The scorer must first tolerate the legitimate clerk template, after which the result clearly indicates the pipeline/Golden Gate rules need tuning—especially sponsorship resolution, cost-center/division/agency fallback behavior, and employee matching.
