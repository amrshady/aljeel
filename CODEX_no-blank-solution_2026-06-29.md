Implemented in edit mode only. No deploy, no batch run.

**Trace**
- `scripts/run_hybrid_v15_12.py`: `write_v15_12_xlsx()` wrote segment overrides with `val if val != "" else None`, so blank `Solution` could become an empty Excel cell even though the combo builder zero-pads.
- `scripts/split_multi_emp.py`: Stage 5 split copied/preserved parent segment cells raw, then rebuilt `Distribution Combination` and `GL Description` from those raw cells.
- `scripts/run_v30.py`: later post-write mutations could leave segment cells/combo inconsistent; added a final segment display normalizer after booking-group mutations and before final GL description sync.

**Files Touched**
- `scripts/run_hybrid_v15_12.py`
- `scripts/run_v30.py`
- `scripts/split_multi_emp.py`

Backups created:
- `scripts/run_hybrid_v15_12.py.bak-pre-no-blank-solution-20260629T090421Z`
- `scripts/run_v30.py.bak-pre-no-blank-solution-20260629T090421Z`
- `scripts/split_multi_emp.py.bak-pre-no-blank-solution-20260629T090421Z`

`py_compile` passed for all three edited files.

**Confirmation**
The ALEM/AHMED `1001811` / `60308009` case, and any other populated row with a valid combo whose `Solution` cell is blank/`None`/`nan`, will now write `00000`. Cost Center/DIV/Agency blanks are normalized to `000000`/`000`/`00000` on the same segment-only basis. Project/Intercompany/Future are untouched. Fully empty spacer/total rows are not populated because the final v30 pass only touches rows with an existing valid 10-segment combo, and Stage 5 only normalizes rows it is actively splitting.

**Unified Diff**
```diff
--- scripts/run_hybrid_v15_12.py.bak-pre-no-blank-solution-20260629T090421Z
+++ scripts/run_hybrid_v15_12.py
@@ -69,6 +69,28 @@
         print(f"[backup] {path.name} -> {bak.name}", flush=True)
 
+SEGMENT_WIDTHS = {
+    "cost_center": 6,
+    "div": 3,
+    "solution": 5,
+    "agency": 5,
+}
+
+def normalize_output_segment(value, width: int) -> str:
+    text = str(value or "").strip()
+    if not text or text.lower() in {"none", "nan", "null"}:
+        return "0" * width
+    if re.fullmatch(r"\d+\.0", text):
+        text = text[:-2]
+    return text.zfill(width) if text.isdigit() and len(text) <= width else text
+
+def normalize_combo_segments(row: dict) -> None:
+    for key, width in SEGMENT_WIDTHS.items():
+        row[key] = normalize_output_segment(row.get(key, ""), width)
+
@@ -204,11 +226,12 @@
             ]:
                 if not hyb.get(key):
                     hyb[key] = cascade_rows[i].get(hdr, "")
+            normalize_combo_segments(hyb)
             for hdr, key in OVERWRITE_KEYS.items():
                 if hdr in col_map:
                     val = hyb.get(key, "")
                     if val is not None:
-                        ws.cell(row=excel_row, column=col_map[hdr]).value = val if val != "" else None
+                        ws.cell(row=excel_row, column=col_map[hdr]).value = val
```

```diff
--- scripts/run_v30.py.bak-pre-no-blank-solution-20260629T090421Z
+++ scripts/run_v30.py
@@ -3259,6 +3259,92 @@
     return updated
 
+FINAL_NUMERIC_SEGMENT_WIDTHS = {"Cost Center": 6, "DIV": 3, "Solution": 5, "Agency": 5}
+FINAL_NUMERIC_SEGMENT_INDEXES = {"Cost Center": 3, "DIV": 4, "Solution": 5, "Agency": 6}
+
+def normalize_final_segment_cells(out_xlsx: Path, header_row: int) -> int:
+    """Zero-pad blank numeric COMBO segment cells on rows with a real combo."""
+    lookup = get_lookup()
+    wb = openpyxl.load_workbook(out_xlsx)
+    ws = wb.active
+    headers = {
+        str(ws.cell(header_row, ci).value or "").strip(): ci
+        for ci in range(1, ws.max_column + 1)
+        if str(ws.cell(header_row, ci).value or "").strip()
+    }
+    combo_col = next((ci for hdr, ci in headers.items() if "distribution combination" in hdr.lower()), None)
+    if not combo_col:
+        wb.close()
+        print("[v30-segment-normalize] WARNING: Distribution Combination column missing", flush=True)
+        return 0
+    gl_desc_col = headers.get("GL Description")
+
+    def _segment(value, width: int) -> str:
+        text = str(value or "").strip()
+        if not text or text.lower() in {"none", "nan", "null"}:
+            return "0" * width
+        if re.fullmatch(r"\d+\.0", text):
+            text = text[:-2]
+        return text.zfill(width) if text.isdigit() and len(text) <= width else text
+
+    normalized = 0
+    for row_idx in range(header_row + 1, ws.max_row + 1):
+        combo = str(ws.cell(row_idx, combo_col).value or "").strip()
+        parts = combo.split("-") if combo else []
+        if len(parts) != 10:
+            continue
+        row_changed = False
+        for hdr, width in FINAL_NUMERIC_SEGMENT_WIDTHS.items():
+            part_idx = FINAL_NUMERIC_SEGMENT_INDEXES[hdr]
+            cell_col = headers.get(hdr)
+            raw = ws.cell(row_idx, cell_col).value if cell_col else ""
+            source = raw if str(raw or "").strip() else parts[part_idx]
+            value = _segment(source, width)
+            if cell_col and ws.cell(row_idx, cell_col).value != value:
+                ws.cell(row_idx, cell_col).value = value
+                row_changed = True
+            if parts[part_idx] != value:
+                parts[part_idx] = value
+                row_changed = True
+        if row_changed:
+            final_combo = "-".join(parts)
+            ws.cell(row_idx, combo_col).value = final_combo
+            if gl_desc_col:
+                ws.cell(row_idx, gl_desc_col).value = build_gl_description(final_combo, lookup)
+            normalized += 1
+    if normalized:
+        wb.save(str(out_xlsx))
+    wb.close()
+    print(f"[v30-segment-normalize] normalized blank/padded CC/DIV/Solution/Agency on {normalized} row(s)", flush=True)
+    return normalized
+
@@ -4789,6 +4875,9 @@
     # ── stage 5: booking-group detection ──────────────────────────────────
     bg_propagated, bg_conflicts = apply_booking_groups_inline_v25(out_xlsx)
 
+    # ── stage 5.4: final numeric segment display normalization ─────────────
+    final_segments_normalized = normalize_final_segment_cells(out_xlsx, hdr_row)
+
     # ── stage 5.5: sync final derived descriptions after all combo mutations ──
     gl_synced = sync_final_gl_descriptions(out_xlsx, cascade_xlsx, hdr_row)
@@ -4898,6 +4987,7 @@
         "pc_family_blanked":          pc_family_blanked,
         "booking_group_propagated":   bg_propagated,
         "booking_group_conflicts":    bg_conflicts,
+        "final_segments_normalized":  final_segments_normalized,
         "gl_descriptions_synced":     gl_synced,
```

```diff
--- scripts/split_multi_emp.py.bak-pre-no-blank-solution-20260629T090421Z
+++ scripts/split_multi_emp.py
@@ -15,6 +15,7 @@
 import sys
 from copy import copy
 from pathlib import Path
+import re
@@ -27,6 +28,12 @@
 COMBO_SEGMENTS = ["Company", "Location", "Account", "Cost Center", "DIV",
                   "Solution", "Agency", "Project", "Intercompany", "Future 1"]
+NUMERIC_SEGMENT_WIDTHS = {"Cost Center": 6, "DIV": 3, "Solution": 5, "Agency": 5}
@@ -189,6 +196,29 @@
 def seg(value) -> str:
     return str(value).strip() if value is not None else ""
 
+def normalize_output_segment(value, width: int) -> str:
+    text = seg(value)
+    if not text or text.lower() in {"none", "nan", "null"}:
+        return "0" * width
+    if re.fullmatch(r"\d+\.0", text):
+        text = text[:-2]
+    return text.zfill(width) if text.isdigit() and len(text) <= width else text
+
+def normalize_row_segments(ws, row_i: int, col: dict) -> dict:
+    normalized = {}
+    for header, width in NUMERIC_SEGMENT_WIDTHS.items():
+        if header not in col:
+            continue
+        value = normalize_output_segment(ws.cell(row=row_i, column=col[header]).value, width)
+        ws.cell(row=row_i, column=col[header], value=value)
+        normalized[header] = value
+    return normalized
+
@@ -293,15 +323,16 @@
                 solution = solution.zfill(5)
                 set_col("Location", rec["location"])
-                set_col("Cost Center", rec["cost_center"])
+                set_col("Cost Center", normalize_output_segment(rec["cost_center"], 6))
                 set_col("Cost Center Name", rec["cc_name"])
-                set_col("DIV", rec["div_code"])
+                set_col("DIV", normalize_output_segment(rec["div_code"], 3))
                 set_col("DIV Name", rec["div_name"])
                 set_col("Solution", solution)
                 set_col("Solution Name", solution_names.get(solution, ""))
-                set_col("Agency", rec["agency_code"])
+                set_col("Agency", normalize_output_segment(rec["agency_code"], 5))
                 set_col("Agency Name", rec["agency_name"])
 
+            normalize_row_segments(ws, row_i, col)
             combo = "-".join(seg(ws.cell(row=row_i, column=col[name]).value) if name in col else ""
                              for name in COMBO_SEGMENTS)
```
