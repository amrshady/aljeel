Implemented `NO_FOLDER(HIGH)` in [qc_catches_within_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/qc_catches_within_batch.py). No source changes were made to `process_batch.py`; existing consumer wiring already picks up `NO_FOLDER` from `line_catches`.

**Diff**
```diff
--- /tmp/qc_catches_within_batch.py.before_no_folder
+++ scripts/qc_catches_within_batch.py
@@ -5,6 +5,7 @@
 Categories:
   DUP_ROUTE_STRICT  — same pax + same actual route + same service date (excl EMD pairs, cost-center splits)
                       STRICT: same route + same service date; SOFT: same route + diff dates within ±7 days
+  NO_FOLDER         — ticket has no evidence folder under the raw evidence root
   VAT_MISMATCH      — 15% VAT on Sponsoring or 0% on domestic Travel
   NO_APPROVAL       — line without approval evidence (multi-source: Fusion form, msg body, voucher, CHD)
@@ -258,9 +259,50 @@
 # ---------------------------------------------------------------------------
-# NO_APPROVAL — multi-source approval detector (v15.11)
+# NO_FOLDER / NO_APPROVAL — evidence folder and approval detectors (v15.11)
 # ---------------------------------------------------------------------------
 
+def _ticket_folder_exists(raw_dir: Path | None, ticket_no: str) -> bool:
+    """Return True if any folder named exactly ticket_no exists under raw_dir."""
+    ticket_str = str(ticket_no or "").strip()
+    if not raw_dir or not ticket_str:
+        return True
+
+    try:
+        for root, dirs, files in os.walk(raw_dir):
+            if os.path.basename(root) == ticket_str:
+                return True
+    except Exception:
+        return True
+    return False
+
+
+def _no_folder(lines: list[BatchLine], raw_dir: Path | None) -> list[dict]:
+    """Ticket with no per-ticket evidence folder under the raw evidence root."""
+    catches = []
+    for line in lines:
+        if not line.ticket_no:
+            continue
+        if _ticket_folder_exists(raw_dir, line.ticket_no):
+            continue
+
+        v = line.amount or 0
+        catches.append({
+            "category": "NO_FOLDER",
+            "severity": "HIGH",
+            "ticket_no": line.ticket_no,
+            "passenger": line.passenger_name,
+            "account": line.account,
+            "value_at_risk_sar": v,
+            "sl_nos": [line.sl_no],
+            "approval_evidence": "NO_FOLDER_MISSING",
+            "detail": (
+                f"Ticket {line.ticket_no} ({line.passenger_name}, SAR {v:,.2f}, "
+                f"account {line.account}) — no evidence folder found under raw evidence root."
+            ),
+        })
+    return catches
+
@@ -566,7 +608,19 @@
     all_catches = []
     all_catches.extend(_dup_route_strict(batch_lines))
     # VAT mismatch needs raw tax column data — skipping in this version
-    all_catches.extend(_no_approval(batch_lines, raw_dir))
+    no_folder_catches = _no_folder(batch_lines, raw_dir)
+    all_catches.extend(no_folder_catches)
+
+    no_folder_sl_nos = {
+        sl_no
+        for catch in no_folder_catches
+        for sl_no in catch.get("sl_nos", [])
+    }
+    approval_lines = [
+        line for line in batch_lines
+        if line.sl_no not in no_folder_sl_nos
+    ]
+    all_catches.extend(_no_approval(approval_lines, raw_dir))
```

**Verification**
- `python3 -m py_compile scripts/qc_catches_within_batch.py` passed.
- `python3 -m py_compile scripts/process_batch.py` passed.
- `python3 scripts/run_v16.py J26-788 --input-suffix v15.12` completed, but it still routed 4 rows through `v16_llm_agent` despite the cached input suffix; estimated cost shown by the script was `$0.0465`.
- Fresh `process_batch.py` verification output: `Spreadsheet-J26-788-FILLED-v15.11.2-no-folder-test.xlsx`.

**Row 10 Before/After**
- Before, `Spreadsheet-J26-788-FILLED-v15.11.2.xlsx`:
  - `Evidence Folder Status`: `OK`
  - `Approval Email Status`: `MISSING`
  - `QC Catches`: `NO_APPROVAL(MEDIUM); ROUND_AMOUNT(MEDIUM)`
- After, `Spreadsheet-J26-788-FILLED-v15.11.2-no-folder-test.xlsx`:
  - `Evidence Folder Status`: `MISSING`
  - `Approval Email Status`: `FORM_MISSING`
  - `QC Catches`: `NO_FOLDER(HIGH); ROUND_AMOUNT(MEDIUM)`

Other `NO_FOLDER` fires in the fresh process-batch run: `21` total, including row 10.

[status: done rc=0]
