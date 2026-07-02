Done. I did not deploy and did not run `python3 scripts/run_v30.py J26-954` or any batch.

**v30 Sponsorship Path**
- Imports from v16: [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:97) lines `97-120`
- Local v16 imports inside `process_row_v30`: lines `1350-1358`
- Call-1 classification/shared OPEX correction: `process_row_v30`, lines `1377-1487`
- Sponsorship master shortcut: `process_row_v30`, lines `1526-1566`
- Full LLM path and `enforce_sponsorship_rules`: `process_row_v30`, lines `1587-1642`
- 26-NNN forced sponsorship override: `process_row_v30`, lines `1685-1698`
- Final sponsorship segment pass: `apply_sponsorship_event_segments`, lines `1074-1173`
- Final pass call site before XLSX write: lines `4377-4385`

**Unified Diff**
```diff
--- scripts/run_v30.py.bak-pre-v30-sponsorship-wire-20260629T074412Z	2026-06-29 07:44:12.636510558 +0000
+++ scripts/run_v30.py	2026-06-29 07:44:46.628865722 +0000
@@ -108,6 +108,8 @@
     _norm_master_code,
     resolve_from_master,
     resolve_sponsorship_from_master,
+    resolve_sponsorship_codes_from_agency,
+    _apply_sponsorship_agency_codes,
     full_resolve_row,
     _build_classify_hint,
     enforce_sponsorship_rules,
@@ -1087,6 +1089,41 @@
         if str(row.get("account", "") or "").strip() != "60307021":
             continue
 
+        # Labadi sponsorship agency rule: when Call 1 extracted an agency from
+        # the OPEX form, ignore form Division/Solution and employee-home/event
+        # segments. Apply the single consistent Manpower code set for that
+        # agency uniformly to every sponsorship output row, including split rows.
+        form_agency = str(row.get("_sponsorship_agency_from_form", "") or "").strip()
+        if form_agency:
+            agency_codes, agency_status = resolve_sponsorship_codes_from_agency(
+                form_agency, manpower
+            )
+            if agency_codes:
+                changes = 0
+                for key in ("account", "cost_center", "div", "solution", "agency"):
+                    if str(row.get(key, "") or "").strip() != str(agency_codes.get(key, "") or "").strip():
+                        row[key] = agency_codes.get(key, "")
+                        changes += 1
+                row["_sponsorship_agency_status"] = agency_status
+                row["_sponsorship_agency_codes_applied"] = True
+                if changes and row.get("_agent_method", "cascade") == "cascade":
+                    row["_agent_method"] = "hybrid_overlay"
+                if changes:
+                    applied += 1
+                print(
+                    f"[sponsor-agency-codes] row {i+1}: agency {form_agency!r} "
+                    "resolved from Manpower; event/home segments bypassed",
+                    flush=True,
+                )
+                continue
+            row["_sponsorship_agency_status"] = agency_status
+            if agency_status.startswith("AGENCY_CODES_INCONSISTENT"):
+                print(
+                    f"[warn] row {i+1}: {agency_status}; falling back to existing "
+                    "v30 sponsorship segment behavior",
+                    flush=True,
+                )
+
         cascade_row = cascade_rows[i]
         folder = _sponsorship_event_folder_for_row(
             row, cascade_row, raw_root, all_folders, reverse_index
@@ -1315,6 +1352,7 @@
     from run_v16 import (
         classify_row, full_resolve_row,
         resolve_from_master, resolve_sponsorship_from_master,
+        _apply_sponsorship_agency_codes,
         apply_overlays_v16, enforce_sponsorship_rules,
         _clean_passenger, _norm_master_code,
     )
@@ -1431,6 +1469,7 @@
         "row_type":             classify.get("row_type", ""),
         "employee_no_in_doc":   classify.get("employee_no_in_doc", ""),
         "requesting_emp_no":    classify.get("requesting_emp_no", ""),
+        "sponsorship_agency_from_form": classify.get("sponsorship_agency_from_form", ""),
         "opex_code":            classify.get("opex_code", ""),
         "classification_basis": str(classify.get("classification_basis", "") or "")[:200],
         "evidence_folder":      classify.get("_folder", ""),
@@ -1445,6 +1484,7 @@
     row_type       = classify.get("row_type", "unclear")
     emp_no_hint    = classify.get("employee_no_in_doc", "").strip()
     requesting_no  = classify.get("requesting_emp_no", "").strip()
+    form_agency    = str(classify.get("sponsorship_agency_from_form", "") or "").strip()
 
     # v19 Fix 2b: downgrade "employee" with no evidence files + surname not in master
     if row_type == "employee" and not emp_no_hint:
@@ -1490,9 +1530,13 @@
         and requesting_no in manpower
         and not verified_emp_locked
     ):
-        rec = resolve_sponsorship_from_master(requesting_no, manpower, lookups)
+        rec = resolve_sponsorship_from_master(
+            requesting_no, manpower, lookups, form_agency=form_agency
+        )
         if rec:
             final = enforce_sponsorship_rules(rec, classify, cascade_row)
+            if form_agency:
+                final["_sponsorship_agency_from_form"] = form_agency
             final["_agent_method"]  = "v16_sponsorship_master"
             # Stamp requestor emp_no on shortcut rows (Labadi Rule 1 — always populated)
             if str(final.get("emp_no", "") or "").strip() in ("", "0", "0000000"):
@@ -1653,6 +1697,12 @@
         # Employee confirmed — preserve travel account, note the guard fired
         final["_agent_method"] = final.get("_agent_method", "") + "+26nnn_employee_guard"
 
+    if form_agency and str(final.get("account", "") or "").strip() == "60307021":
+        final["_sponsorship_agency_from_form"] = form_agency
+        final, agency_status = _apply_sponsorship_agency_codes(final, classify, manpower)
+        if agency_status:
+            final["_sponsorship_agency_status"] = agency_status
+
     final["_classify"]      = row_type
     final["_route_reason"]  = route_reason
     final["_llm_in_tokens"] = classify.get("_llm_in_tokens", 0) + llm.get("_llm_in_tokens", 0)
```

**Files Touched**
- Edited: [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py)
- Backup kept: `scripts/run_v30.py.bak-pre-v30-sponsorship-wire-20260629T074412Z`
- `py_compile` artifact updated: `scripts/__pycache__/run_v30.cpython-312.pyc`

**Verification**
- Ran: `python3 -m py_compile scripts/run_v30.py`
- Result: passed.

The rule now fires from `run_v30.py` main execution in two places: the sponsorship master shortcut now passes `form_agency` into `resolve_sponsorship_from_master(...)`, and the late `apply_sponsorship_event_segments()` pass applies agency-derived manpower codes before event/home segment logic for sponsorship rows carrying `_sponsorship_agency_from_form`. If the agency lookup is inconsistent, it logs the status and falls back to existing v30 behavior without guessing. Amount splitting was not changed.
