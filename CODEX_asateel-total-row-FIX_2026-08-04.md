Implemented both fixes in [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1328).

No deployment, Wrangler command, commit, or push was performed. Warm caches were preserved.

## Gate results

- Python compilation: passed
- `git diff --check`: passed
- Golden gate: exit `0`, `GOLDEN OK`
- Golden signature unchanged:
  - 183 rows
  - GREEN 0
  - YELLOW 171
  - RED 12
  - Blank CC 2
  - 92/92 reconciled

Golden gate output verbatim:

```text
+ python3 pipelines/asateel.py --folder CENTRAL --full
/home/clawdbot/.local/lib/python3.12/site-packages/openpyxl/worksheet/_reader.py:329: UserWarning: Data Validation extension is not supported and will be removed
  warn(msg)
[extract 1/92] CENTRAL 03041
[extract 2/92] CENTRAL 03042
[extract 3/92] CENTRAL 03043
[extract 4/92] CENTRAL 03044
[extract 5/92] CENTRAL 03045
[extract 6/92] CENTRAL 03046
[extract 7/92] CENTRAL 03047
[extract 8/92] CENTRAL 03067
[extract 9/92] CENTRAL 03068
[extract 10/92] CENTRAL 03069
[extract 11/92] CENTRAL 03070
[extract 12/92] CENTRAL 03071
[extract 13/92] CENTRAL 03072
[extract 14/92] CENTRAL 03073
[extract 15/92] CENTRAL 03097
[extract 16/92] CENTRAL 03098
[extract 17/92] CENTRAL 03099
[extract 18/92] CENTRAL 03100
[extract 19/92] CENTRAL 03101
[extract 20/92] CENTRAL 03102
[extract 21/92] CENTRAL 03103
[extract 22/92] CENTRAL 03104
[extract 23/92] CENTRAL 03105
[extract 24/92] CENTRAL 03106
[extract 25/92] CENTRAL 03107
[extract 26/92] CENTRAL 03108
[extract 27/92] CENTRAL 03109
[extract 28/92] CENTRAL 03110
[extract 29/92] CENTRAL 03111
[extract 30/92] CENTRAL 03112
[extract 31/92] CENTRAL 03128
[extract 32/92] CENTRAL 03129
[extract 33/92] CENTRAL 03130
[extract 34/92] CENTRAL 03131
[extract 35/92] CENTRAL 03132
[extract 36/92] CENTRAL 03133
[extract 37/92] CENTRAL 03134
[extract 38/92] CENTRAL 03135
[extract 39/92] CENTRAL 03136
[extract 40/92] CENTRAL 03137
[extract 41/92] CENTRAL 03138
[extract 42/92] CENTRAL 03139
[extract 43/92] CENTRAL 03140
[extract 44/92] CENTRAL 03142
[extract 45/92] CENTRAL 03143
[extract 46/92] CENTRAL 03144
[extract 47/92] CENTRAL 03145
[extract 48/92] CENTRAL 03146
[extract 49/92] CENTRAL 03147
[extract 50/92] CENTRAL 03149
[extract 51/92] CENTRAL 03150
[extract 52/92] CENTRAL 03151
[extract 53/92] CENTRAL 03152
[extract 54/92] CENTRAL 03153
[extract 55/92] CENTRAL 03154
[extract 56/92] CENTRAL 03155
[extract 57/92] CENTRAL 03170
[extract 58/92] CENTRAL 03171
[extract 59/92] CENTRAL 03173
[extract 60/92] CENTRAL 03174
[extract 61/92] CENTRAL 03175
[extract 62/92] CENTRAL 03176
[extract 63/92] CENTRAL 03177
[extract 64/92] CENTRAL 03178
[extract 65/92] CENTRAL 03179
[extract 66/92] CENTRAL 03180
[extract 67/92] CENTRAL 03181
[extract 68/92] CENTRAL 03182
[extract 69/92] CENTRAL 03183
[extract 70/92] CENTRAL 03193
[extract 71/92] CENTRAL 03194
[extract 72/92] CENTRAL 03195
[extract 73/92] CENTRAL 03235
[extract 74/92] CENTRAL 03236
[extract 75/92] CENTRAL 03237
[extract 76/92] CENTRAL 03238
[extract 77/92] CENTRAL 03239
[extract 78/92] CENTRAL 03240
[extract 79/92] CENTRAL 03241
[extract 80/92] CENTRAL 03242
[extract 81/92] CENTRAL 03243
[extract 82/92] CENTRAL 03270
[extract 83/92] CENTRAL 03303
[extract 84/92] CENTRAL 03304
[extract 85/92] CENTRAL 03305
[extract 86/92] CENTRAL 03306
[extract 87/92] CENTRAL 03307
[extract 88/92] CENTRAL 03308
[extract 89/92] CENTRAL 03309
[extract 90/92] CENTRAL 03310
[extract 91/92] CENTRAL 03317
[extract 92/92] CENTRAL 03318

ASATEEL PRODUCTION V6 SUMMARY
=============================
Approach: production wrapper delegates to /home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py
Invoices processed: 92
Distribution rows written: 183
GREEN/YELLOW/RED rows: {'RED': 12, 'YELLOW': 171}
Split methods: {'per_jq': 183}
Allocation mode: standard
Reconciled/mismatched invoices: 92/0
Exceptions by category: {'AGENCY_JQ_NOT_IN_SO_DETAIL': 12, 'ALLOCATION_REVIEW': 130, 'HOME_AGENCY_DISCREPANCY': 41, 'SO_DETAIL_SUPPLIER_DISCREPANCY': 10}

OUTPUT FILES
============
Oracle XLSX: /home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-oracle-upload.xlsx
Allocation JSON: /home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-allocation.json
Catch JSON: /home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-catch.json
Summary JSON: /home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-summary.json
Trace JSON: /home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-trace.json
GOLDEN OK
```

## Central verification

Warm-cache summary:

```text
Invoices processed: 27
Distribution rows written: 27
GREEN/YELLOW/RED rows: {'YELLOW': 27}
Split methods: {'per_jq': 27}
Reconciled/mismatched invoices: 27/0
Exceptions by category: {'ALLOCATION_REVIEW': 27}
```

| Invoice | Output Amount | Expected subtotal | Match |
|---|---:|---:|:---:|
| 04019 | 1,800.00 | 1,800.00 | Y |
| 04151 | 1,750.00 | 1,750.00 | Y |
| 04163 | 2,000.00 | 2,000.00 | Y |
| 04244 | 1,650.00 | 1,650.00 | Y |
| 04319 | 2,000.00 | 2,000.00 | Y |
| 04329 | 2,000.00 | 2,000.00 | Y |
| 04330 | 2,000.00 | 2,000.00 | Y |
| 04331 | 2,350.00 | 2,350.00 | Y |
| 04332 | 2,350.00 | 2,350.00 | Y |
| 04333 | 2,000.00 | 2,000.00 | Y |
| 04334 | 2,350.00 | 2,350.00 | Y |
| 04353 | 900.00 | 900.00 | Y |
| 04364 | 1,650.00 | 1,650.00 | Y |
| 04392 | 2,350.00 | 2,350.00 | Y |
| 04408 | 2,000.00 | 2,000.00 | Y |
| 04466 | 1,750.00 | 1,750.00 | Y |
| 04467 | 1,750.00 | 1,750.00 | Y |
| 04468 | 1,750.00 | 1,750.00 | Y |
| 04469 | 1,750.00 | 1,750.00 | Y |
| 04470 | 1,750.00 | 1,750.00 | Y |
| 04471 | 2,350.00 | 2,350.00 | Y |
| 04472 | 1,750.00 | 1,750.00 | Y |
| 04473 | 2,350.00 | 2,350.00 | Y |
| 04474 | 1,750.00 | 1,750.00 | Y |
| 04475 | 2,350.00 | 2,350.00 | Y |
| 04477 | 1,750.00 | 1,750.00 | Y |
| 04478 | 2,000.00 | 2,000.00 | Y |
| **Total** | **52,200.00** | **52,200.00** | **Y** |

Checks:

- Rows with Amount `52,200`: 0
- Footer DC `03-20100-61500027---00000-00000-00000-00-000000`: 0
- Total changed from `104,400.00` to `52,200.00`
- All 27 invoices reconcile

Last-row change:

| State | Invoice | Line | Amount | JQ | DC | Match method |
|---|---|---:|---:|---|---|---|
| Before | 04478 | 2 | 52,200 | blank | `03-20100-61500027---00000-00000-00000-00-000000` | `supplier_blank_jq_unit` |
| After | 04478 | 1 | 2,000 | blank | `03-40100-61500027-140040-190-00000-10200-00000-00-000000` | `supplier_blank_jq_unit` |

## Eastern verification

Warm-cache summary:

```text
Invoices processed: 20
Distribution rows written: 24
GREEN/YELLOW/RED rows: {'RED': 9, 'YELLOW': 15}
Split methods: {'per_jq': 24}
Reconciled/mismatched invoices: 20/0
Exceptions by category: {'AGENCY_JQ_NOT_IN_SO_DETAIL': 9, 'ALLOCATION_REVIEW': 11, 'HOME_AGENCY_DISCREPANCY': 4, 'SO_DETAIL_SUPPLIER_DISCREPANCY': 2}
```

| Invoice | Output Amount | Expected subtotal | Match |
|---|---:|---:|:---:|
| 04015 | 2,300.00 | 2,300.00 | Y |
| 04016 | 2,000.00 | 2,000.00 | Y |
| 04017 | 1,250.00 | 1,250.00 | Y |
| 04018 | 1,250.00 | 1,250.00 | Y |
| 04202 | 1,250.00 | 1,250.00 | Y |
| 04203 | 1,250.00 | 1,250.00 | Y |
| 04227 | 1,250.00 | 1,250.00 | Y |
| 04255 | 1,650.00 | 1,650.00 | Y |
| 04304 | 2,300.00 | 2,300.00 | Y |
| 04324 | 1,100.00 | 1,100.00 | Y |
| 04325 | 1,400.00 | 1,400.00 | Y |
| 04326 | 1,650.00 | 1,650.00 | Y |
| 04327 | 1,250.00 | 1,250.00 | Y |
| 04328 | 1,250.00 | 1,250.00 | Y |
| 04407 | 2,300.00 | 2,300.00 | Y |
| 04433 | 1,000.00 | 1,000.00 | Y |
| 04453 | 2,800.00 | 2,800.00 | Y |
| 04454 | 3,100.00 | 3,100.00 | Y |
| 04476 | 1,750.00 | 1,750.00 | Y |
| 04505 | 2,300.00 | 2,300.00 | Y |
| **Total** | **34,400.00** | **34,400.00** | **Y** |

Checks:

- Rows with Amount `34,400`: 0
- Footer malformed DC rows: 0
- Invoice `04505` now contains Amount `2,300`
- Bare `14730` canonicalized to `JQ-00014730`
- All 20 invoices reconcile

Last-row change:

| State | Invoice | Line | Amount | JQ | DC | Match method |
|---|---|---:|---:|---|---|---|
| Before | 04505 | 1 | 34,400 | blank | `03-20100-61500027---00000-00000-00000-00-000000` | `supplier_blank_jq_unit` |
| After | 04505 | 1 | 2,300 | `JQ-00014730` | `03-40100-61500027-140040-190-00000-10200-00000-00-000000` | `supplier_jq_unit` |

## Full unified diff

```diff
diff --git a/asateel-sample/asateel_poc.py b/asateel-sample/asateel_poc.py
index d832514..e32b898 100644
--- a/asateel-sample/asateel_poc.py
+++ b/asateel-sample/asateel_poc.py
@@ -1332,7 +1332,7 @@ def _canonical_jq(raw: Any, *, allow_bare: bool = True) -> str:
     m = re.search(r"\bJQ\s*-\s*(\d+)(?=\b|_)", text)
     if m:
         return f"JQ-{m.group(1).zfill(8)}"
-    if allow_bare and re.fullmatch(r"\d+", text):
+    if allow_bare and re.fullmatch(r"\d{1,8}", text):
         return f"JQ-{text.zfill(8)}"
     return ""
 
@@ -1352,7 +1352,7 @@ def _split_jqs(raw: Any, *, allow_bare: bool = True) -> list[str]:
         if jq not in seen:
             seen.add(jq)
             out.append(jq)
-    if allow_bare and not out and re.fullmatch(r"\d+", text):
+    if allow_bare and not out and re.fullmatch(r"\d{1,8}", text):
         out.append(f"JQ-{text.zfill(8)}")
     return out
 
@@ -1644,7 +1644,7 @@ def load_expenses_format(path: Path, lookups: Lookups) -> dict[str, list[dict[st
         if not row_inv:
             continue
         jq = _clean(cell(vals, "jq"))
-        parsed_jqs = _split_jqs(jq, allow_bare=False)
+        parsed_jqs = _split_jqs(jq)
         employee_name = _clean(cell(vals, "employee_name"))
         agency = _clean(cell(vals, "agency"))
         division = _clean(cell(vals, "division"))
@@ -1664,6 +1664,7 @@ def load_expenses_format(path: Path, lookups: Lookups) -> dict[str, list[dict[st
         rec_base = {
             "row": ridx,
             "invoice_no": row_inv,
+            "_invoice_is_rowlocal": bool(header_inv or description_inv),
             "description": description,
             "jq": jq,
             "_source_jq_cell": jq,
@@ -1682,7 +1683,7 @@ def load_expenses_format(path: Path, lookups: Lookups) -> dict[str, list[dict[st
         rec_base["solution_code"] = solution_code
         rec_base["solution_name"] = solution_name
         rec_base["solution_note"] = solution_note
-        jqs = parsed_jqs or ([_canonical_jq(jq, allow_bare=False)] if _canonical_jq(jq, allow_bare=False) else [jq])
+        jqs = parsed_jqs or ([_canonical_jq(jq)] if _canonical_jq(jq) else [jq])
         for jq_index, jq_token in enumerate(jqs, start=1):
             rec = dict(rec_base)
             rec["jq"] = jq_token
@@ -1698,21 +1699,15 @@ def load_expenses_format(path: Path, lookups: Lookups) -> dict[str, list[dict[st
 def supplier_jq_units_for_invoice(invoice_no: Any, supplier_index: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
     units = []
     for rec in supplier_index.get(_code(invoice_no, 5), []):
-        jq = _canonical_jq(rec.get("jq"), allow_bare=False)
+        jq = _canonical_jq(rec.get("jq"))
         source_jq = _clean(rec.get("_source_jq_cell"))
         # A supplier row with a genuinely blank JQ is still an allocation unit.
         # Warehouse rows legitimately have no JQ, so dropping them here loses
         # supplier amount/segments before the Warehouse pin can be applied.
         # Keep rejecting nonblank malformed JQs to preserve existing validation.
-        if source_jq and not jq.startswith("JQ-"):
+        if source_jq and not jq:
             continue
-        if not source_jq and not (
-            rec.get("amount") is not None
-            and any(
-                _clean(rec.get(field))
-                for field in ("agency", "cost_center", "division", "solution")
-            )
-        ):
+        if rec.get("amount") is None or not (jq or rec.get("_invoice_is_rowlocal")):
             # Header fill-down also associates template/signature/total rows
             # with an invoice. They are not supplier allocation lines.
             continue
```

## Residual risks

- The predicate intentionally trusts an explicit row-local invoice token even if allocation fields are unresolved. This is required to preserve legitimate incomplete rows and matches the approved golden-safety recommendation.
- Bare numeric JQs are limited to 1–8 digits. Bare 9+ digit values remain malformed and rejected.
- `JQ-00014730` is absent from the current SO_Detail export, so invoice `04505` correctly remains RED with `supplier_fallback_jq_missing`; its financial allocation is nevertheless retained and reconciled.
- Generated review outputs were inspected from `matched/` and temporary copies; tracked batch artifacts and golden baselines were not modified.
