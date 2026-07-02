Implemented in edit mode only. No deploy and no batch run.

**Trace**
- Existing OPEX agency parse path remains [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:714): `_parse_opex_event_segments()` calls `parse_opex_pdf()` and reads `parsed["form_agency"]`, with the existing text fallback.
- New feed point is [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:779): `_feed_sponsorship_agency_from_opex()` fills `classify["sponsorship_agency_from_form"]` only when Call-1 left it empty.
- Wired before:
  - master shortcut trace/form agency capture at [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1494)
  - OPEX emp override path at [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1618)
  - final agency apply path at [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1736)
  - workbook sponsorship segment pass at [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1114)

**Row 16 Finding**
For `J26-954` row 16 folder:

`batches/jawal-J26-954/16-23jun/21jun/Re payment form for conference on July 1-2/OPEX-SIS-15-2026-J-2026-122.pdf`

`parse_opex_pdf()` returned `None` in this environment for the uncached single PDF, but the existing v30 event parser fallback produced:

```json
{
  "div": "130",
  "agency": "10043",
  "solution": "10002",
  "cost_center_ref": "",
  "cost_center": "",
  "source": "OPEX-SIS-15-2026-J-2026-122.pdf"
}
```

The new feed sets:

```json
{
  "sponsorship_agency_from_form": "10043",
  "_sponsorship_agency_from_form_source": "OPEX-SIS-15-2026-J-2026-122.pdf"
}
```

`resolve_sponsorship_codes_from_agency("10043", manpower)` resolves exactly:

```json
{
  "account": "60307021",
  "cost_center": "160011",
  "div": "196",
  "solution": "00000",
  "agency": "10043"
}
```

Also confirmed `10041` resolves exactly to the Fujifilm manpower set.

**Unified Diff**
```diff
--- scripts/run_v16.py.bak-pre-opex-agency-feed-20260629T083434Z	2026-06-29 08:34:34.463705822 +0000
+++ scripts/run_v16.py	2026-06-29 08:34:54.251537128 +0000
@@ -549,7 +549,7 @@
         agency_name = str(rec.get("agency_name", "") or "").strip()
         code_key = _norm_agency_text(agency_code)
         name_key = _norm_agency_text(agency_name)
-        if agency_key == code_key or agency_key == name_key or agency_key in name_key:
+        if agency_key == code_key or agency_key == name_key:
             matches.append(rec)
 
     if not matches:
```

```diff
--- scripts/run_v30.py.bak-pre-opex-agency-feed-20260629T083434Z	2026-06-29 08:34:34.433704561 +0000
+++ scripts/run_v30.py	2026-06-29 08:35:14.822400471 +0000
@@ -776,6 +776,28 @@
     return event
 
 
+def _feed_sponsorship_agency_from_opex(
+    classify: dict,
+    cascade_row: dict,
+) -> dict:
+    """Populate Call-1 sponsorship agency from the already used OPEX form parse."""
+    if str(classify.get("sponsorship_agency_from_form", "") or "").strip():
+        return {}
+
+    folder_str = (
+        classify.get("_folder")
+        or classify.get("folder")
+        or str((classify.get("_evidence") or {}).get("folder", "") or "")
+    )
+    folder = Path(folder_str) if folder_str else None
+    event = _parse_opex_event_segments(folder, cascade_row)
+    form_agency = str(event.get("agency", "") or "").strip()
+    if form_agency:
+        classify["sponsorship_agency_from_form"] = form_agency
+        classify["_sponsorship_agency_from_form_source"] = event.get("source", "")
+    return event
+
+
 def _normalise_label(value: str) -> str:
     return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())
 
@@ -1089,10 +1111,22 @@
         if str(row.get("account", "") or "").strip() != "60307021":
             continue
 
-        # Labadi sponsorship agency rule: when Call 1 extracted an agency from
-        # the OPEX form, ignore form Division/Solution and employee-home/event
-        # segments. Apply the single consistent Manpower code set for that
+        cascade_row = cascade_rows[i]
+        folder = _sponsorship_event_folder_for_row(
+            row, cascade_row, raw_root, all_folders, reverse_index
+        )
+        event = _parse_opex_event_segments(folder, cascade_row)
+
+        # Labadi sponsorship agency rule: when Call 1 or the OPEX form parser
+        # provides an agency, ignore form Division/Solution and employee-home/
+        # event segments. Apply the single consistent Manpower code set for that
         # agency uniformly to every sponsorship output row, including split rows.
+        if (
+            not str(row.get("_sponsorship_agency_from_form", "") or "").strip()
+            and event.get("agency")
+        ):
+            row["_sponsorship_agency_from_form"] = event.get("agency", "")
+            row["_sponsorship_agency_from_form_source"] = event.get("source", "")
         form_agency = str(row.get("_sponsorship_agency_from_form", "") or "").strip()
         if form_agency:
             agency_codes, agency_status = resolve_sponsorship_codes_from_agency(
@@ -1124,11 +1158,6 @@
                     flush=True,
                 )
 
-        cascade_row = cascade_rows[i]
-        folder = _sponsorship_event_folder_for_row(
-            row, cascade_row, raw_root, all_folders, reverse_index
-        )
-        event = _parse_opex_event_segments(folder, cascade_row)
         manpower_home = _manpower_home_segments(row, manpower)
 
         changes = 0
@@ -1462,6 +1491,9 @@
                 flush=True,
             )
 
+    if classify.get("row_type") == "sponsorship":
+        _feed_sponsorship_agency_from_opex(classify, cascade_row)
+
     trace["call1"] = {
         "model":                classify.get("_llm_model", ""),
         "from_cache":           classify.get("_from_cache", False),
@@ -1583,6 +1615,10 @@
         print(f"[v30-opex-override] Found explicit emp_no {extracted_opex_emp} in OPEX PDF for {ticket}. Forcing into classification hint.", flush=True)
         classify["requesting_emp_no"] = extracted_opex_emp
         classify["row_type"] = "sponsorship"
+        _feed_sponsorship_agency_from_opex(classify, cascade_row)
+        form_agency = str(classify.get("sponsorship_agency_from_form", "") or "").strip()
+        requesting_no = str(classify.get("requesting_emp_no", "") or "").strip()
+        row_type = classify.get("row_type", row_type)
         route_reason = "SPONSORING_EMPNO_REVIEW"
 
     t2 = _t.time()
@@ -1697,6 +1733,13 @@
         # Employee confirmed — preserve travel account, note the guard fired
         final["_agent_method"] = final.get("_agent_method", "") + "+26nnn_employee_guard"
 
+    if (
+        not form_agency
+        and str(final.get("account", "") or "").strip() == "60307021"
+    ):
+        _feed_sponsorship_agency_from_opex(classify, cascade_row)
+        form_agency = str(classify.get("sponsorship_agency_from_form", "") or "").strip()
+
     if form_agency and str(final.get("account", "") or "").strip() == "60307021":
         final["_sponsorship_agency_from_form"] = form_agency
         final, agency_status = _apply_sponsorship_agency_codes(final, classify, manpower)
```

**Files Touched**
- `scripts/run_v30.py`
- `scripts/run_v16.py`
- backups:
  - `scripts/run_v30.py.bak-pre-opex-agency-feed-20260629T083434Z`
  - `scripts/run_v16.py.bak-pre-opex-agency-feed-20260629T083434Z`

**Verification**
- `python3 -m py_compile scripts/run_v30.py scripts/run_v16.py` passed.
- Sponsorship rows whose OPEX PDF yields an agency through `_parse_opex_event_segments()` will now carry it into `sponsorship_agency_from_form` / `_sponsorship_agency_from_form` before the Labadi rule runs.
- If the PDF has no agency or parsing fails, the field stays empty and the existing fallback behavior remains.
