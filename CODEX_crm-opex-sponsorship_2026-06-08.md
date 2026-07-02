Implemented in the requested two source files:

- [scripts/qc_catches_within_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/qc_catches_within_batch.py): added generic shared OPEX folder detection before `NO_FOLDER`, plus suppression of `ROUND_AMOUNT` for rows classified via shared OPEX.
- [scripts/process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py): consumes `SHARED_OPEX_SPONSORSHIP`, sets `Evidence Folder Status = SHARED_OPEX`, account `60307021`, blank `emp_no`, amber fill, and audit trail.

Validation:
- `python3 -m py_compile scripts/qc_catches_within_batch.py && python3 -m py_compile scripts/process_batch.py` passed.
- `python3 scripts/run_v16.py J26-788 --input-suffix v15.12` completed, but it does not regenerate QC catches or the process-batch debug columns; it copied the existing v15.12 cascade state. It also made 4 model-routed calls despite the “cached outputs” expectation.
- To validate the actual changed consumer, I ran:
  `python3 scripts/process_batch.py --batch batches/jawal-J26-788 --raw-dir batches/jawal-J26-788/raw --suffix v15.12-shared-opex`

Row 10 / ticket `6905428854` after process validation:
- `Evidence Folder Status`: `SHARED_OPEX`
- `account`: `60307021`
- `emp_no`: blank (`None` in openpyxl)
- `QC Catches`: `SHARED_OPEX_SPONSORSHIP(INFO)`
- No `NO_FOLDER(HIGH)`
- No `ROUND_AMOUNT`
- `shared_folder_path`: `.../raw/02may/CRM-2026-27 Approvals`

Before/after catch state:
- Before stale catch JSON: `NO_FOLDER(HIGH)` for `6905428854`
- After validation: `SHARED_OPEX_SPONSORSHIP(INFO)` for `6905428854`
- Genuine missing folders still remain: `NO_FOLDER count = 19`
- Per-ticket sibling examples `6905428852` and `6905428853` have no new catches.

Full task diff, source hunks:

```diff
--- scripts/qc_catches_within_batch.py
+++ scripts/qc_catches_within_batch.py
@@
 def _ticket_folder_exists(raw_dir: Path | None, ticket_no: str) -> bool:
@@
     return False
 
+def _find_shared_opex_folder(date_dir: Path, ticket_no: str, passenger_name: str) -> Path | None:
+    if not date_dir or not date_dir.is_dir():
+        return None
+    ticket_str = str(ticket_no or "").strip()
+    name_parts = [
+        p.strip().lower()
+        for p in re.split(r"[/\s]+", passenger_name or "")
+        if len(p.strip()) >= 3
+    ]
+    try:
+        siblings = list(date_dir.iterdir())
+    except Exception:
+        return None
+    for sibling in siblings:
+        if not sibling.is_dir():
+            continue
+        if re.fullmatch(r"\d{10}", sibling.name):
+            continue
+        try:
+            files = list(sibling.iterdir())
+        except Exception:
+            continue
+        file_names_lower = [f.name.lower() for f in files if f.is_file()]
+        has_opex = any(fn.startswith("opex-") and fn.endswith(".pdf") for fn in file_names_lower)
+        if not has_opex:
+            continue
+        references_ticket = bool(ticket_str) and any(ticket_str in fn for fn in file_names_lower)
+        references_passenger = any(part in fn for part in name_parts for fn in file_names_lower)
+        if references_ticket or references_passenger:
+            return sibling
+    return None
+
+def _find_shared_opex_folder_in_batch(raw_dir, ticket_no, passenger_name):
+    if not raw_dir or not raw_dir.is_dir():
+        return None, None
+    try:
+        date_dirs = list(raw_dir.iterdir())
+    except Exception:
+        return None, None
+    for date_dir in date_dirs:
+        if date_dir.is_dir():
+            found = _find_shared_opex_folder(date_dir, ticket_no, passenger_name)
+            if found:
+                return date_dir, found
+    return None, None
+
 def _no_folder(lines: list[BatchLine], raw_dir: Path | None) -> list[dict]:
@@
         v = line.amount or 0
+        date_dir, shared_folder = _find_shared_opex_folder_in_batch(
+            raw_dir, line.ticket_no, line.passenger_name
+        )
+        if shared_folder:
+            catches.append({
+                "category": "SHARED_OPEX_SPONSORSHIP",
+                "severity": "INFO",
+                "ticket_no": line.ticket_no,
+                "passenger": line.passenger_name,
+                "account": line.account,
+                "value_at_risk_sar": v,
+                "sl_nos": [line.sl_no],
+                "approval_evidence": "SHARED_OPEX_FOLDER",
+                "date_dir": str(date_dir) if date_dir else "",
+                "shared_folder_path": str(shared_folder),
+                "detail": f"Ticket {line.ticket_no} ({line.passenger_name}, SAR {v:,.2f}) has no per-ticket folder, but shared OPEX sponsorship evidence was found at {shared_folder}.",
+            })
+            continue
         catches.append({
             "category": "NO_FOLDER",
@@
     no_folder_sl_nos = {
         sl_no
         for catch in no_folder_catches
         for sl_no in catch.get("sl_nos", [])
     }
+    shared_opex_sl_nos = {
+        sl_no
+        for catch in no_folder_catches
+        if catch.get("category") == "SHARED_OPEX_SPONSORSHIP"
+        for sl_no in catch.get("sl_nos", [])
+    }
@@
-    all_catches.extend(_round_amount(batch_lines))
+    round_amount_lines = [line for line in batch_lines if line.sl_no not in shared_opex_sl_nos]
+    all_catches.extend(_round_amount(round_amount_lines))
```

```diff
--- scripts/process_batch.py
+++ scripts/process_batch.py
@@
     if "EMAIL_CORRUPT_OR_EMPTY" in all_flags:
         return "The approval email (.msg) file is empty (0 KB) or corrupt. Please obtain a valid email copy from the traveler/manager."
+
+    if "SHARED_OPEX_SPONSORSHIP" in all_flags:
+        return "Shared OPEX sponsorship evidence exists in the date folder. Use that folder as the approval evidence for this ticket."
@@
     for catch in within_batch_catches + cross_batch_catches:
         for sn in catch.get("sl_nos", []):
             if sn is not None:
                 line_catches[sn].append(catch)
 
+    for r in results:
+        catches_for_line = line_catches.get(r.sl_no, [])
+        shared_opex = next((c for c in catches_for_line if c.get("category") == "SHARED_OPEX_SPONSORSHIP"), None)
+        if not shared_opex:
+            continue
+        r.account = "60307021"
+        r.emp_no = ""
+        r.combo = build_combo(r.company, r.location, r.account, r.cost_center, r.div, r.solution, r.agency, r.project, r.intercompany, r.future1)
+        method = str(getattr(r, "_agent_method", "") or "")
+        if "+shared_opex_sponsorship" not in method:
+            setattr(r, "_agent_method", method + "+shared_opex_sponsorship")
+        detail = f"shared_opex_sponsorship: {shared_opex.get('shared_folder_path', '')}"
+        r.account_rule = f"{r.account_rule} | {detail}" if r.account_rule else detail
+
@@
         is_corrupt_or_empty_file = False
+        is_shared_opex = False
@@
         if "EMAIL_CORRUPT_OR_EMPTY" in all_line_flag_codes:
             is_corrupt_or_empty_file = True
+        if "SHARED_OPEX_SPONSORSHIP" in all_line_flag_codes:
+            is_shared_opex = True
 
-        evidence_folder_status = "MISSING" if is_no_folder else "OK"
+        evidence_folder_status = "SHARED_OPEX" if is_shared_opex else ("MISSING" if is_no_folder else "OK")
@@
                 if val == "MISSING":
                     cell.fill = RED_FILL
+                elif val == "SHARED_OPEX":
+                    cell.fill = AMBER_FILL
                 elif val == "OK":
                     cell.fill = GREEN_FILL
```

[status: done rc=0]
