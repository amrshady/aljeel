```diff
diff --git a/scripts/run_v30.py b/scripts/run_v30.py
--- a/scripts/run_v30.py
+++ b/scripts/run_v30.py
@@ -2853,6 +2853,7 @@ INVOICE_REF_EMP_FILENAME_FLAG = "INVOICE_REF_EMP_FILENAME_MATCH"
 INVOICE_REF_FUZZY_FLAG = "REF_FUZZY"
 REFNO_FALLBACK_FLAG = "REFNO_FALLBACK"
 EMP_FILENAME_FALLBACK_FLAG = "EMP_FILENAME_FALLBACK"
+EMP_NOT_IN_MASTER_FLAG = "EMP_NOT_IN_MASTER"
 EVIDENCE_TRIP_IDENTITY_MISMATCH = "EVIDENCE_TRIP_IDENTITY_MISMATCH"
 EVIDENCE_SAME_EMPLOYEE_MULTIPLE_TRIPS = "EVIDENCE_SAME_EMPLOYEE_MULTIPLE_TRIPS"
 ZERO_AMOUNT_REISSUE_INHERITED = "ZERO_AMOUNT_REISSUE_INHERITED"
@@ -3286,6 +3287,21 @@ def _append_hybrid_flag(row: dict, flag: str) -> None:
         row["_flags"] = (str(row.get("_flags", "") or "") + " " + flag).strip()
 
 
+def blank_jawal_emp_not_in_master(hybrid_rows: list[dict], manpower: dict) -> int:
+    """Blank only settled employee numbers that do not resolve in Manpower."""
+    blanked = 0
+    for row in hybrid_rows:
+        emp_no = str(row.get("emp_no", "") or "").strip()
+        if not emp_no or _emp_resolves_in_manpower(emp_no, manpower):
+            continue
+        row["emp_no"] = ""
+        _append_hybrid_flag(row, EMP_NOT_IN_MASTER_FLAG)
+        if row.get("_agent_method", "cascade") == "cascade":
+            row["_agent_method"] = "hybrid_overlay"
+        blanked += 1
+    return blanked
+
+
 def _append_row_flag(row: dict, key: str, flag: str) -> None:
     existing = str(row.get(key, "") or "").strip()
     if flag not in existing.split():
@@ -6250,6 +6266,13 @@ def main():
     ancillary_inherited = inherit_ancillary_event_allocations(hybrid_rows, cascade_rows)
     print(f"[ancillary-event] {ancillary_inherited} missing ancillary row(s) inherited event allocation", flush=True)
 
+    if batch_dir.name.casefold().startswith("jawal-"):
+        emp_not_in_master = blank_jawal_emp_not_in_master(hybrid_rows, manpower)
+        print(
+            f"[jawal-emp-master] {emp_not_in_master} out-of-master emp_no value(s) blanked",
+            flush=True,
+        )
+
     for h in hybrid_rows:
         m = h.get("_agent_method", "")
```

Touched:

- Module constants: line 2856, adds `EMP_NOT_IN_MASTER_FLAG`.
- New `blank_jawal_emp_not_in_master()`: lines 3289–3301.
- `main()`: lines 6253–6258, after the final employee-writing allocation stages and before XLSX writing.
- Existing finalization path identified: `process_row_v25()`, `stamp_verified_emp_locks()`, `stamp_missing_evidence_gate()` (`REFNO_FALLBACK` / `EMP_FILENAME_FALLBACK`), and `main()`’s final overlays.

J26-1108 impact: rows 7, 57, and 97 will have `emp_no=""` when their settled identity is `1002686` or `1002566`, with `EMP_NOT_IN_MASTER` appended to QC flags. Every emp_no resolving in the 662-entry Manpower master returns before mutation, so no in-master row—including stale-master rows selecting a different in-master employee—is affected.
