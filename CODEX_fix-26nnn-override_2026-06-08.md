Implemented the guard in [scripts/run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:1033). `manpower` is directly in scope as a `process_row()` parameter.

**Diff**
```diff
@@ -1033,18 +1033,20 @@
     # ── v21 Fix 2: deterministic 26-NNN sponsorship override ─────────────────
-    # When the LLM was routed as 26NNN_LIKELY_SPONSORSHIP (hotel/transfer/
-    # registration) and still returned a travel account, force to sponsorship.
-    # This covers cases where no OPEX evidence was found but the description
-    # keyword alone is sufficient evidence (Belfast hotel, airport transfer, etc.)
-    # Safety: only applies when PC override did NOT already fire (account≠21070229)
-    # and the account is still a travel code.
+    # Guard: if Call 2 resolved a real AlJeel employee, keep 60301003.
+    # Hotel/accommodation for an employee is still travel expense, not sponsoring.
+    _final_emp = str(final.get("emp_no") or "").strip()
     if (route_reason == "26NNN_LIKELY_SPONSORSHIP"
             and final.get("account") in ("60301003", "60301004")
-            and final.get("account") != "21070229"):
+            and final.get("account") != "21070229"
+            and _final_emp not in manpower):
         final["account"] = "60307021"
         final["_agent_method"] = "v16_26nnn_forced_sponsorship"
         method = "26nnn_forced_sponsorship"
+    elif (route_reason == "26NNN_LIKELY_SPONSORSHIP"
+            and _final_emp in manpower):
+        # Employee confirmed — preserve travel account, note the guard fired
+        final["_agent_method"] = final.get("_agent_method", "") + "+26nnn_employee_guard"
```

**Verification**
`python3 -m py_compile scripts/run_v16.py` passed.

Ran the requested command. It produced `Spreadsheet-J26-788-FILLED-v16.xlsx`, but it did **not** route rows 63-66 because the `v15.12` input already has those rows as `60307021/cascade`. So that exact end-to-end command cannot validate this override path for the Barcelona rows.

Using the saved v30 step trace as cached Call 1/Call 2 inputs, with no Gemini calls, the override-path regression is:

| Excel row | Before account | Before emp_no | Before method | After account | After emp_no | After method |
|---:|---|---|---|---|---|---|
| 63 | 60307021 | 1002091 | v16_26nnn_forced_sponsorship | 60301003 | 1002091 | v16_hybrid_overlay+26nnn_employee_guard |
| 64 | 60307021 | 1002091 | v16_26nnn_forced_sponsorship | 60301003 | 1002091 | v16_hybrid_overlay+26nnn_employee_guard |
| 65 | 60307021 | 1000995 | v16_26nnn_forced_sponsorship | 60301003 | 1000995 | v16_hybrid_overlay+26nnn_employee_guard |
| 66 | 60307021 | 1000995 | v16_26nnn_forced_sponsorship | 60301003 | 1000995 | v16_hybrid_overlay+26nnn_employee_guard |

Rows affected by the new guard: **4**.

Spot-check genuine sponsorship rows from the saved trace remained sponsorship:
rows 78 and 79 stayed `60307021` with blank `emp_no`.

Score delta: unavailable. `qc/score_against_truth.py` produced `Paired evaluated: 0` for both `batches/jawal-J26-788/J26-788.xlsx` and `output/J26-788-GROUND-TRUTH.xlsx`, so there was no meaningful score to compare.

[status: done rc=0]
