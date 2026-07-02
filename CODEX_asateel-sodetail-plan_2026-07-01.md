Read-only pass complete. I did not edit or deploy.

**Key Findings**
Current authoritative path is in [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1117): supplier Expenses Format overrides PDF/Manpower, and supplier-vs-Manpower discrepancy is flagged YELLOW.

SO_Detail workbook probe:
- `Sheet1`, header row 5, data from row 6.
- Columns match requirement.
- `11138` JQ rows, `9552` unique JQs.
- `1192` duplicate JQs.
- Some duplicates conflict on `CAT_AGENCY`, `CAT_AGENCY_DESC`, or `ORGANIZATION_CODE`, so loader must keep deterministic first-row behavior and flag conflicts.

**Implementation Plan**
1. Add default path near constants:
```python
DEFAULT_SO_DETAIL_XLSX = ROOT / "reference" / "SO_Detail_Labadi_1_R21_AA.xlsx"
```

2. Add JQ canonicalization helper around current `_split_jqs` area:
```python
def _canonical_jq(raw: Any) -> str:
    text = _clean(raw).upper()
    m = re.search(r"\bJQ\s*-\s*(\d+)\b", text)
    if not m:
        return ""
    return f"JQ-{m.group(1).zfill(8)}"
```
Then update `_split_jqs`, `_extract_pdf_jqs`, `load_expenses_format`, and `supplier_jq_units_for_invoice` to use `_canonical_jq()` instead of raw uppercase.

3. Add SO_Detail loader after `load_expenses_format()` or before it:
```python
def load_so_detail(path: Path) -> dict[str, dict[str, Any]]:
    ...
```
Behavior:
- Open `Sheet1`, `min_row=6`.
- Header row fixed at 5, but use column names for validation.
- Strip whitespace from `ORDER_NUMBER`.
- Canonicalize JQ to `JQ-NNNNNNNN`.
- Normalize `CAT_AGENCY` with `_code(value, 5)`.
- Capture:
  - `jq`
  - `cat_agency_code`
  - `cat_agency_desc`
  - `sperson`
  - `organization_code`
  - `row`
  - `duplicate_rows`
  - `duplicate_conflict`
  - `duplicate_note`
- Dedupe by JQ:
  - first workbook row wins.
  - if later duplicate has different code/desc/SPERSON/org, set `_so_detail_duplicate_conflict = "Y"` and note all rows.
  - if duplicate is identical, trace only, no review flag unless desired.

4. Add a central-master agency resolver helper around `_supplier_resolve_allocation()`:
```python
def _agency_cluster_for_code(code: Any, display_name: Any, lookups: Lookups) -> dict[str, Any]:
    agency_code = _code(code, 5)
    so_name = _clean(display_name)
    master_name = lookups.agency_name_by_code.get(agency_code, "")
    if not agency_code or agency_code not in lookups.agency_name_by_code:
        return unresolved with status_reason "SO_Detail CAT_AGENCY code not in Agency lookup"

    cluster = (
        lookups.agency_to_cluster.get(master_name.casefold())
        or lookups.agency_to_cluster.get(so_name.casefold())
    )
    if not cluster:
        return resolved agency code/name but missing division/cost center, YELLOW reason

    return allocation dict using:
      agency_code = agency_code
      agency_name = so_name or master_name
      division/cost_center from cluster
      agency_resolve_method = "so_detail_cat_agency_code"
      source = "so_detail"
      confidence = 1.0
```
This satisfies: resolve numeric code against Central master, but keep `CAT_AGENCY_DESC` as output agency name.

5. Change [build_rows()](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1117) signature:
```python
def build_rows(..., supplier_index=None, so_detail_index=None)
```
Then:
- Add trace counts:
```python
"so_detail_loaded_jqs": len(so_detail_index),
```
- For each output unit, determine JQ:
  - supplier JQ if `supplier_match`
  - otherwise first canonical JQ extracted from PDF line/extraction.
- Lookup SO_Detail by JQ before supplier allocation logic.
- If found:
  - `resolved = _agency_cluster_for_code(...)`
  - `supplier_action = "so_detail_override"`
  - `allocation_source = "so_detail"`
  - attach SPERSON to trace/debug.
  - compare SO_Detail code to supplier agency code and Manpower home agency code.
  - if mismatch, keep SO_Detail, append notes, set discrepancy debug column, force YELLOW.
- If JQ exists but not in SO_Detail:
  - append note `"JQ not in SO_Detail export"`
  - force YELLOW.
  - fall back to existing supplier Expenses Format behavior, then Manpower/PDF behavior.
- If no JQ:
  - leave current fallback behavior unchanged.

6. Update discrepancy/debug fields in `row` dict around [asateel_poc.py:1536](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1536):
```python
"_so_detail_agency": so_detail_agency,
"_so_detail_salesperson": so_detail_salesperson,
"_supplier_sheet_agency": supplier_sheet_agency,
"_manpower_home_agency": manpower_home_agency,
"_so_detail_supplier_discrepancy": so_supplier_discrepancy,
"_supplier_home_agency_discrepancy": supplier_home_agency_discrepancy,
```

7. Update `DEBUG_HEADERS` near [asateel_poc.py:72](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:72):
Replace/add:
```python
"SO_Detail Agency",
"SO_Detail Salesperson",
"Supplier Sheet Agency",
"Manpower Home Agency",
"SO_Detail vs Supplier Discrepancy",
```
Keep `"Home Agency Discrepancy"` if you still want Manpower mismatch visibility, or rename semantics carefully.

8. Update `write_excel()` debug map near [asateel_poc.py:1631](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1631):
```python
"SO_Detail Agency": row.get("_so_detail_agency"),
"SO_Detail Salesperson": row.get("_so_detail_salesperson"),
"SO_Detail vs Supplier Discrepancy": row.get("_so_detail_supplier_discrepancy"),
```

9. Add CLI arg near [asateel_poc.py:2093](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2093):
```python
parser.add_argument(
    "--so-detail",
    default=str(DEFAULT_SO_DETAIL_XLSX),
    help="Oracle BI Publisher SO_Detail export used as authoritative JQ agency reference",
)
```

10. Wire main near [asateel_poc.py:2111](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2111):
```python
so_detail_index = load_so_detail(Path(args.so_detail))
rows, trace = build_rows(extracted, lookups, supplier_index, so_detail_index)
trace["so_detail_path"] = str(Path(args.so_detail))
```

11. Update [pipelines/asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:38):
Add:
```python
DEFAULT_SO_DETAIL_XLSX = ROOT / "reference" / "SO_Detail_Labadi_1_R21_AA.xlsx"
```
Add CLI:
```python
parser.add_argument("--so-detail", default=str(DEFAULT_SO_DETAIL_XLSX))
```
Wire:
```python
so_detail_index = engine.load_so_detail(Path(args.so_detail))
rows, trace = engine.build_rows(extracted, lookups, supplier_index, so_detail_index)
```
Include in summary/trace:
```python
"so_detail_path": str(args.so_detail)
```

12. Update production public JSON in `_row_public()`:
Add:
```python
"so_detail_agency": row.get("_so_detail_agency") or "",
"so_detail_salesperson": row.get("_so_detail_salesperson") or "",
"so_detail_vs_supplier_discrepancy": row.get("_so_detail_supplier_discrepancy") or "",
```

**Important Edge Cases**
- Leading-space JQs: solved by `_canonical_jq()`.
- Multi-JQ supplier rows: already expanded per JQ; each expanded JQ will now get independent SO_Detail lookup.
- JQ in PDF but not supplier sheet: SO_Detail still gets checked via `_extract_pdf_jqs()`.
- JQ absent from SO_Detail: fallback supplier then Manpower/PDF, force YELLOW.
- SO_Detail code not in Central master: keep row YELLOW, do not silently replace from supplier/Manpower if SO_Detail exists.
- Duplicate SO_Detail JQ conflicts: first row wins, row YELLOW with duplicate conflict note.
- Entry-1/Entry-2 validation remains untouched and non-authoritative.
