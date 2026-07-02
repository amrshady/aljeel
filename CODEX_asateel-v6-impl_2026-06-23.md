Implemented v6 in the sample only. Not deployed.

**Files touched**
- [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py)
- [build_sidebyside_v6.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/build_sidebyside_v6.py) small wrapper for v6 side-by-side output

**Diff Summary**
- Added `_split_jqs()` and supplier amount apportionment with last-JQ cent remainder.
- Changed `load_expenses_format()` to expand supplier rows into one allocation unit per JQ, carrying `_source_jq_cell`, `_jq_count`, `_jq_index`, `_supplier_row_amount`, supplier row number, and `_amount_basis`.
- Added `supplier_jq_units_for_invoice()` and changed `build_rows()` to emit `split_method=per_jq` supplier JQ rows before falling back to the old PDF-line matcher.
- Supplier allocation now wins over Manpower for agency/division/cost center/cost center name/solution; Manpower is retained as comparison metadata.
- Added debug columns: `Supplier Sheet Agency`, `Manpower Home Agency`, `Home Agency Discrepancy`, `Supplier JQ Count`.
- Added trace fields for parsed JQ, supplier row, JQ index/count, supplier agency, Manpower home agency, and discrepancy flag.
- Entry-sheet validation label is now explicitly non-authoritative legacy comparison.

**Generated Files**
- [asateel-poc-oracle-CENTRAL-full-v6-2026-06-23.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-oracle-CENTRAL-full-v6-2026-06-23.xlsx)
- [asateel-poc-trace-CENTRAL-full-v6-2026-06-23.json](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-trace-CENTRAL-full-v6-2026-06-23.json)
- [asateel-sidebyside-v6-2026-06-23.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-sidebyside-v6-2026-06-23.xlsx)
- [COMPARE-REPORT-v6-2026-06-23.md](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/COMPARE-REPORT-v6-2026-06-23.md)

**Verification**
- Compile passed: `python3 -m py_compile asateel-sample/asateel_poc.py asateel-sample/build_sidebyside_v6.py`
- CENTRAL full rows: `188`
- Status counts: `GREEN=7`, `YELLOW=175`, `RED=6`
- `03072`: `2` rows, both `split_method=per_jq`, `Supplier JQ Count=2`
- `03097`: `4` rows, `JQ-26116785=158.33`, `JQ-26116807=158.34`, last row marked `supplier_row_amount_per_jq_cent_remainder_to_last`
- `03317` Ghadeer Alfaleh / `1001687`: books supplier agency `10041/Fujifilm`, Manpower home agency `10043/Erbe`, `Home Agency Discrepancy=Y`, `Row Status=YELLOW`

[status: done rc=0]
