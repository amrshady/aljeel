Implemented the sponsorship-only fix in [scripts/split_multi_emp.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py). No deploy and no batch run. `python3 -m py_compile scripts/split_multi_emp.py` passed.

**Trace**
- Event/sponsorship detection is `_is_event_sponsorship_row()` at [line 163](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:163), including `account == "60307021"`.
- Parent event segments are now read before insertion at [line 251](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:251).
- Insert/copy still happens at [line 258](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:258).
- Employee, `*Amount`, and header-level `*Invoice Amount` handling remains at [line 262](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:262).
- Sponsorship rows restore parent Account/CC/DIV/Solution/Agency segment cells at [line 270](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:270).
- `EMP_NOT_IN_MANPOWER` flag behavior is preserved at [line 274](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:274).
- Normal non-sponsorship Manpower re-derivation remains guarded by `if not preserve_event_segments` at [line 289](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:289).
- Distribution Combination / GL Description rebuild remains at [line 305](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:305).

**Unified Diff**
```diff
--- scripts/split_multi_emp.py.bak-pre-sponsorship-preserve-20260629T075016Z	2026-06-29 07:50:29.783706485 +0000
+++ scripts/split_multi_emp.py	2026-06-29 07:51:22.502969659 +0000
@@ -4,7 +4,8 @@
 Rows whose Employee No column holds multiple comma-separated employee numbers
 (e.g. "1000477,1002037" on Euro Anesthesia rows) are split into one row per
 employee in a NEW output file. The cost is divided equally and all GL segments
-are re-derived from each employee's Manpower record. The original v30 file is
+are re-derived from each employee's Manpower record, except event sponsorship
+rows where v30's parent event segments are preserved. The original v30 file is
 left untouched.
 
 Usage:
@@ -52,6 +53,18 @@
     "Agent Flags": ["Agent Flags"],
 }
 
+EVENT_SEGMENTS_TO_PRESERVE = (
+    "Account",
+    "Cost Center",
+    "Cost Center Name",
+    "DIV",
+    "DIV Name",
+    "Solution",
+    "Solution Name",
+    "Agency",
+    "Agency Name",
+)
+
 
 # ---------- master data loaders (same pattern as full_evidence_agent_v30) ----------
 def load_manpower(lookups_path: str) -> dict:
@@ -236,6 +249,11 @@
         amount_shares = split_amount(amount, n) if amount is not None else None
         # inv_shares removed — *Invoice Amount is copied as-is (not divided)
         preserve_event_segments = _is_event_sponsorship_row(ws, r, col)
+        parent_event_segments = {
+            key: ws.cell(row=r, column=col[key]).value
+            for key in EVENT_SEGMENTS_TO_PRESERVE
+            if preserve_event_segments and key in col
+        }
 
         ws.insert_rows(r + 1, n - 1)
         for k in range(1, n):
@@ -249,6 +267,10 @@
             if inv_amount is not None and "*Invoice Amount" in col:
                 ws.cell(row=row_i, column=col["*Invoice Amount"], value=inv_amount)
 
+            if preserve_event_segments:
+                for key, value in parent_event_segments.items():
+                    ws.cell(row=row_i, column=col[key], value=value)
+
             rec = manpower.get(emp)
             if rec is None:
                 # Unknown employee: keep original segments, flag the row.
@@ -258,31 +280,18 @@
                     flags_cell.value = (existing + " | EMP_NOT_IN_MANPOWER") if existing else "EMP_NOT_IN_MANPOWER"
                 continue
 
-            # Re-derive personal segments from Manpower; Account/Project/IC/Future1 stay.
-            # OPEX sponsorship splits preserve the event agency when present;
-            # other segments continue through the normal Manpower fallback unless
-            # the upstream row left them absent.
+            # Normal travel splits re-derive personal segments from Manpower;
+            # event sponsorship splits keep the v30 parent row's event segments.
             def set_col(key, value):
                 if key in col and value:
                     ws.cell(row=row_i, column=col[key], value=value)
 
-            solution = _norm_master_code(rec["solution"], "solution") or "00000"
-            if not solution.isdigit():
-                original_solution = (seg(ws.cell(row=row_i, column=col["Solution"]).value) if "Solution" in col else "")
-                solution = original_solution if original_solution.isdigit() else "00000"
-            solution = solution.zfill(5)
-            if preserve_event_segments:
-                set_col("Location", rec["location"])
-                set_col("Cost Center", rec["cost_center"])
-                set_col("Cost Center Name", rec["cc_name"])
-                set_col("DIV", rec["div_code"])
-                set_col("DIV Name", rec["div_name"])
-                set_col("Solution", solution)
-                set_col("Solution Name", solution_names.get(solution, ""))
-                if not _cell_text(ws, row_i, col, "Agency"):
-                    set_col("Agency", rec["agency_code"])
-                    set_col("Agency Name", rec["agency_name"])
-            else:
+            if not preserve_event_segments:
+                solution = _norm_master_code(rec["solution"], "solution") or "00000"
+                if not solution.isdigit():
+                    original_solution = (seg(ws.cell(row=row_i, column=col["Solution"]).value) if "Solution" in col else "")
+                    solution = original_solution if original_solution.isdigit() else "00000"
+                solution = solution.zfill(5)
                 set_col("Location", rec["location"])
                 set_col("Cost Center", rec["cost_center"])
                 set_col("Cost Center Name", rec["cc_name"])
```

**Files Touched**
- [scripts/split_multi_emp.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py)
- [scripts/split_multi_emp.py.bak-pre-sponsorship-preserve-20260629T075016Z](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py.bak-pre-sponsorship-preserve-20260629T075016Z)
- `scripts/__pycache__/split_multi_emp.cpython-312.pyc` from `py_compile`

By code path, a Fujifilm sponsorship parent row with account `60307021`, CC `160011`, DIV `196`, agency `10041` will now split into N children preserving those parent segment values identically; only `*Amount` is split per child, while `*Invoice Amount` stays header-level. Normal travel splits are unchanged because their Manpower re-derivation remains in the non-sponsorship branch only.
