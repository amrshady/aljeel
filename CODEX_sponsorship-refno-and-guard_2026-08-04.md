No files were changed.

## Root cause / proposed diff

### Task A — final-account choke point

`21070229` can currently originate from:

- `cost_center_resolver.py`: annual/personal classification.
- `process_batch.py`: family-cluster promotion and trip-purpose override.
- `run_v30.py`: LLM overlay, PC overlay, family-annual rule, own/sibling/bundled trip inheritance, and late trip-account override.
- `run_v17.py`: booking-group “PC wins” propagation, executed late against the generated workbook.

The last dangerous mutation is booking-group propagation at [run_v30.py:6221](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6221). Therefore the reliable choke point is immediately after it and before segment normalization / GL-description synchronization.

Proposed additive diff in [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py):

```diff
+SPONSORSHIP_ACCOUNT = "60307021"
+ANNUAL_TICKET_ACCOUNT = "21070229"
+SPONSORSHIP_ANNUAL_OVERRIDE_BLOCKED = "SPONSORSHIP_ANNUAL_OVERRIDE_BLOCKED"
+
+def _row_has_sponsorship_evidence(hybrid_row: dict, cascade_row: dict) -> bool:
+    account_values = {
+        str(hybrid_row.get("account", "") or "").strip(),
+        str(cascade_row.get("Account", "") or "").strip(),
+    }
+    if SPONSORSHIP_ACCOUNT in account_values:
+        return True
+
+    evidence = " ".join(str(v or "") for v in (
+        hybrid_row.get("_flags"),
+        hybrid_row.get("_agent_flag_details"),
+        hybrid_row.get("_route_reason"),
+        hybrid_row.get("_classify"),
+        hybrid_row.get("_opex_serial"),
+        cascade_row.get("Agent Flags"),
+        cascade_row.get("OPEX Serial"),
+    )).upper()
+    if "SPONSORSHIP_" in evidence or "SHARED_OPEX_SPONSORSHIP" in evidence:
+        return True
+
+    ref_no = _row_invoice_ref_no(cascade_row)
+    return (
+        _invoice_ref_is_event(ref_no)
+        and (
+            "INVOICE_REF_FOLDER_MATCH" in evidence
+            or "INVOICE_REF_FOLDER" in evidence
+            or "OPEX" in evidence
+        )
+    )
```

Add the final workbook guard near [run_v30.py:6221](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6221):

```diff
     bg_propagated, bg_conflicts = apply_booking_groups_inline_v25(out_xlsx)
+
+    sponsorship_blocks = enforce_final_sponsorship_account_guard(
+        out_xlsx, hybrid_rows, cascade_rows, hdr_row
+    )
```

`enforce_final_sponsorship_account_guard()` should, only when the final workbook account is `21070229` and `_row_has_sponsorship_evidence(...)` is true:

```diff
+    Account = "60307021"
+    Distribution Combination part[2] = "60307021"
+    Employee No = ""
+    append Agent Flags: SPONSORSHIP_ANNUAL_OVERRIDE_BLOCKED
```

This placement catches every upstream route, including the late `run_v17.py` PC-anchor propagation. Subsequent stages only normalize segments and derive descriptions; they do not choose another account.

The guard should also update `hybrid_rows[i]` to account `60307021` and blank `emp_no`, keeping fraud/QC processing consistent with the workbook.

### Task B — Description source

Confirmed:

- Column K initially comes from the vendor/cascade `Description`.
- `_row_invoice_ref_no()` at [run_v30.py:2815](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2815) reads BL-style reference fields.
- `resolve_invoice_ref_folder()` uses that reference for evidence routing.
- `INVOICE_REF_FOLDER_MATCH` records the successful match.
- None of those paths writes the resolved reference back into Description.
- The only late Description rewrite is stage 5.6 at [run_v30.py:6229](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6229), and it reads only `OPEX Serial`.

That explains J26-1140 row 20: BL=`CRM-2026-43`, BM=`N/A`, so the existing stage skips it. Rows 44/45 work because `EP-2026-21` was already embedded in K and also appears in BM.

Replace the narrow stage-5.6 source selection:

```diff
-                _serial = str(
-                    _ws_dp.cell(_r, _cols_dp["OPEX Serial"]).value or ""
-                ).strip()
-                if not _serial or _serial.upper() in ("MISSING", "N/A", "NONE"):
-                    continue
                 _acct = str(
                     _ws_dp.cell(_r, _cols_dp["Account"]).value or ""
                 ).strip()
-                _emp = str(
-                    _ws_dp.cell(_r, _cols_dp["Employee No"]).value or ""
-                ).strip()
-                if not (_acct == "60307021" or _emp == "" or "," in _emp):
-                    continue
+                if _acct != "60307021":
+                    continue
+
+                _ref = str(
+                    _ws_dp.cell(_r, _cols_dp["Invoice Ref No"]).value or ""
+                ).strip()
+                if not _ref or _ref.upper() in ("MISSING", "N/A", "NONE"):
+                    _ref = str(
+                        _ws_dp.cell(_r, _cols_dp["OPEX Serial"]).value or ""
+                    ).strip()
+                if not _ref or _ref.upper() in ("MISSING", "N/A", "NONE"):
+                    continue
+
                 _desc_cell = _ws_dp.cell(_r, _cols_dp["Description"])
                 _desc = str(_desc_cell.value or "")
-                if not _desc or _desc.startswith(_serial):
+                if not _desc:
                     continue
-                _desc_cell.value = f"{_serial}-{_desc}"
+                if re.match(
+                    rf"^\s*{re.escape(_ref)}-",
+                    _desc,
+                    flags=re.IGNORECASE,
+                ):
+                    continue
+                _desc_cell.value = f"{_ref}-{_desc}"
```

Also include `Invoice Ref No` in the stage’s required-column map, while treating it as optional so older golden workbooks without BL remain unchanged.

Expected J26-1140 change:

```diff
- AHMED ALMUHAYFIR - Sofitel Munich Bayerpost - 5 NTS. (26-1049)
+ CRM-2026-43-AHMED ALMUHAYFIR - Sofitel Munich Bayerpost - 5 NTS. (26-1049)
```

The trailing `(26-1049)` is never considered a leading prefix, and the anchored escaped comparison makes the operation idempotent.

## Regression risk

- Non-sponsorship Description rows are protected by exact final account `60307021`; the current blank/multi-employee heuristic should be removed.
- Ordinary `21070229` rows without sponsorship evidence remain unchanged.
- J26-640 currently has 37 sponsorship rows, all already with blank Employee No. Its workbook lacks the newer `Invoice Ref No` column, so the Description pass must fall back safely to its existing OPEX behavior.
- On static inspection, these conditions preserve J26-640 at zero diff. A rerun/diff was not performed because this request explicitly prohibited edit-and-deploy.
- Current J26-1140 has six sponsorship rows with nonblank Employee No, including rows 20, 44, and 45. Enforcing the stated house rule will intentionally blank those values.
