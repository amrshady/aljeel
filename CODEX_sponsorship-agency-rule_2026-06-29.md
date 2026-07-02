Implemented in `scripts/run_v16.py` only. No deploy, no batch run. Verification was limited to `python3 -m py_compile scripts/run_v16.py`.

**Old Sponsorship Path**
Call chain before edit:

1. [pipelines/jawal.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/jawal.py:60) `load_details()` lines 60-97 reads invoice detail fields including `solution_name` and `agency_name`.
2. [pipelines/jawal.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/jawal.py:209) `scan_folders()` lines 209-285 classifies folder artifacts, including OPEX PDFs.
3. [cost_center_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:337) `_is_sponsorship()` lines 337-342 detects sponsorship/OPEX text.
4. [cost_center_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:379) `classify_account()` lines 379-450 assigns sponsorship account `60307021`.
5. [cost_center_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:545) `resolve_line()` lines 545-607 assigns OPEX-prefix-derived sponsor segments for non-master passengers.
6. [employee_resolver_v2.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:1094) `_layer9_sponsorship()` lines 1094-1173 auto-routes unresolved external/OPEX rows as sponsorship.
7. [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1093) `process_batch()` lines 1093-1099 applies L9 sponsorship account.
8. [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1198) lines 1198-1219 override sponsorship segments from OPEX ref key.
9. [run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:409) `classify_row()` lines 409-485 classifies row as `sponsorship`.
10. [run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:515) old `resolve_sponsorship_from_master()` lines 515-531 used the requesting employee’s home Manpower CC/DIV/Solution/Agency.
11. [run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:832) `process_row()` lines 924-939 shortcut-resolved sponsorship rows through that requestor-home lookup.
12. Split mechanics are already upstream/downstream row mechanics; current code preserves invoice row amounts and only changes segment fields. I did not change amount splitting.

**Unified Diff**
```diff
--- scripts/run_v16.py.bak-pre-sponsorship-agency-rule-20260629T072512Z
+++ scripts/run_v16.py
@@ -383,6 +383,7 @@
   "employee_no_in_doc": "<7-digit Aljeel emp_no if found in email/approval, else empty string>",
   "employee_name_in_doc": "<passenger/employee name as it appears in docs, else empty>",
   "requesting_emp_no": "<6-7 digit emp_no of Aljeel requestor from OPEX form, else empty>",
+  "sponsorship_agency_from_form": "<agency/vendor exactly from the OPEX form if sponsorship, e.g. Fujifilm; else empty>",
   "opex_code": "<OPEX code like HF-2026-15 or J-2026-83, else empty>",
   "classification_basis": "<one sentence: which file/phrase drove the decision>"
 }}
@@ -465,6 +466,7 @@
         "employee_no_in_doc":   str(j.get("employee_no_in_doc", "") or "").strip(),
         "employee_name_in_doc": str(j.get("employee_name_in_doc", "") or "").strip(),
         "requesting_emp_no":    str(j.get("requesting_emp_no", "") or "").strip(),
+        "sponsorship_agency_from_form": str(j.get("sponsorship_agency_from_form", "") or "").strip(),
         "opex_code":            str(j.get("opex_code", "") or "").strip(),
         "classification_basis": str(j.get("classification_basis", "") or "").strip(),
@@ -512,11 +514,113 @@
-def resolve_sponsorship_from_master(requesting_emp_no: str, manpower: dict, lookups: dict) -> dict | None:
-    """Resolve sponsorship row from requesting employee's master record."""
+def _norm_agency_text(value: str) -> str:
+    return re.sub(r"[^A-Z0-9]+", "", str(value or "").upper())
+
+def _norm_segment(value: str, width: int) -> str:
+    text = str(value or "").strip()
+    if not text or text.lower() == "nan":
+        return "0".zfill(width)
+    try:
+        text = str(int(float(text)))
+    except (TypeError, ValueError):
+        pass
+    return text.zfill(width) if text.isdigit() else text
+
+def resolve_sponsorship_codes_from_agency(form_agency: str, manpower: dict) -> tuple[dict | None, str]:
+    """Return the single consistent Manpower code set for an OPEX-form agency."""
+    raw_agency = str(form_agency or "").strip()
+    if not raw_agency:
+        return None, "AGENCY_FROM_FORM_MISSING"
+    agency_key = _norm_agency_text(raw_agency)
+    matches = []
+    for rec in manpower.values():
+        agency_code = _norm_segment(rec.get("agency_code", ""), 5)
+        agency_name = str(rec.get("agency_name", "") or "").strip()
+        if agency_key == _norm_agency_text(agency_code) or agency_key == _norm_agency_text(agency_name) or agency_key in _norm_agency_text(agency_name):
+            matches.append(rec)
+    if not matches:
+        return None, f"AGENCY_FROM_FORM_NOT_IN_MANPOWER({raw_agency})"
+    code_sets = {}
+    for rec in matches:
+        key = (
+            _norm_segment(rec.get("cost_center", ""), 6),
+            _norm_segment(rec.get("div_code", ""), 3),
+            _norm_master_code(_norm_segment(rec.get("solution", ""), 5), "solution"),
+            _norm_segment(rec.get("agency_code", ""), 5),
+        )
+        code_sets.setdefault(key, 0)
+        code_sets[key] += 1
+    if len(code_sets) != 1:
+        variants = [{"cost_center": cc, "div": div, "solution": sol, "agency": agency, "rows": count}
+                    for (cc, div, sol, agency), count in sorted(code_sets.items())]
+        return None, f"AGENCY_CODES_INCONSISTENT({raw_agency}): {variants}"
+    (cost_center, div, solution, agency), row_count = next(iter(code_sets.items()))
+    return {"account": "60307021", "cost_center": cost_center, "div": div,
+            "solution": solution, "agency": agency, "confidence": "high",
+            "reasoning": f"Sponsorship; agency {raw_agency!r} from OPEX form matched {row_count} Manpower row(s); applied the consistent agency code set. Ignored form Division/Solution/Amount for code assignment."}, "sponsorship_agency_manpower"
+
+def _apply_sponsorship_agency_codes(final: dict, classify: dict, manpower: dict) -> tuple[dict, str | None]:
+    if classify.get("row_type") != "sponsorship" and str(final.get("account", "")).strip() != "60307021":
+        return final, None
+    agency_codes, status = resolve_sponsorship_codes_from_agency(classify.get("sponsorship_agency_from_form", ""), manpower)
+    if not agency_codes:
+        if status.startswith("AGENCY_CODES_INCONSISTENT"):
+            print(f"[warn] {status}; falling back to existing sponsorship behavior", flush=True)
+        final["reasoning"] = f"{final.get('reasoning', '')} | sponsorship agency-manpower fallback: {status}".strip(" |")
+        return final, status
+    final.update(agency_codes)
+    return final, status
+
+def resolve_sponsorship_from_master(requesting_emp_no: str, manpower: dict, lookups: dict, form_agency: str = "") -> dict | None:
+    """Resolve sponsorship row from OPEX-form agency, falling back to requestor home record."""
```
Diff continues in same file to wire the helper into the master shortcut, Call 2 overlay path, trace, and forced `26-NNN` sponsorship path.

**Files Touched**
- `scripts/run_v16.py`
- `scripts/run_v16.py.bak-pre-sponsorship-agency-rule-20260629T072512Z`
- `scripts/__pycache__/run_v16.cpython-312.pyc` was refreshed by `py_compile` verification.

**Assumptions / Edge Cases**
- Manpower is read from `fea.load_manpower()` in `scripts/full_evidence_agent.py`, sheet `Manpower`, fields `agency_code`, `agency_name`, `cost_center`, `div_code`, `solution`.
- Agency-from-form is now requested from Call 1 as `sponsorship_agency_from_form`; older cached classifications lacking this key fall back to existing behavior.
- If an agency maps to multiple Manpower code sets, runtime logs `AGENCY_CODES_INCONSISTENT(...)` and falls back to the old requestor-home behavior for that row.
- Manpower does not expose a GL account field in this loader, so sponsorship account remains fixed as `60307021`; CC/DIV/Solution/Agency come from agency-filtered Manpower.
