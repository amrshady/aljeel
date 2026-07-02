1. **Q1 — Exact Trigger Path**

For `"MOSTAFA AMER - Kimpton Vividora Barcelona - 1 NTS. (26-731)"`:

`process_batch.py` does call `_is_sponsorship(description)` in the OPEX-ref override block:

```python
818        is_sponsor, _sp = _is_sponsorship(description)
819        if is_sponsor and not _skip_opex:
820            sponsor_segs = derive_sponsor_segments(description)
821            resolved.account = "60307021"
...
827            resolved.account_rule = f"L1_sponsor_override: opex_key={sponsor_segs['opex_key']}"
```

But `_is_sponsorship()` returns `(False, '')` for these descriptions. I verified directly:

```text
MOSTAFA AMER - Kimpton Vividora Barcelona - 1 NTS. (26-731) => (False, '')
SULTAN ABU DOGHMEH - Kimpton Vividora Barcelona - 1 NTS. (26-733) => (False, '')
```

So `process_batch.py` is not the sponsorship trigger here. The initial cascade account rule in the XLSX is still employee travel:

```text
Agent Account Rule: L8_sm_travel: DIV=194
Employee No: 1002091 / 1000995
```

The bad sponsorship account comes later from `run_v16.py` routing/override.

Call 1 did fire because `_needs_classification()` routed the row as `26NNN_LIKELY_SPONSORSHIP`. From `step-trace-v30.jsonl`, for the four rows:

```text
26-731: route_reason=26NNN_LIKELY_SPONSORSHIP, call1 row_type=unclear
26-732: route_reason=26NNN_LIKELY_SPONSORSHIP, call1 row_type=unclear
26-733: route_reason=26NNN_LIKELY_SPONSORSHIP, call1 row_type=sponsorship
26-734: route_reason=26NNN_LIKELY_SPONSORSHIP, call1 row_type=sponsorship
```

The key code block is:

```python
287    # ── v19 Fix 2a: 26-NNN hotel / accommodation / transfer → likely sponsorship ──
288    # 26-NNN rows are non-ticket items (hotels, transfers, registrations, visas).
289    # When the description contains hospitality keywords, these are almost always
290    # sponsorship charges that should be account=60307021 — not travel.
291    # Route them so the LLM can confirm and assign the correct OPEX allocation.
292    if re.search(r"\b26-\d{3}\b", text) and account in ("60301003", "60301004"):
293        HOSP_KEYWORDS = ("NTS", "HOTEL", "TRANSFER", "REGISTRATION", "VISA",
294                         "AIRLINE TICKET", "ACCOMMODATION", "PICKUP", "DROP")
295        if any(kw in desc.upper() for kw in HOSP_KEYWORDS):
296            return True, "26NNN_LIKELY_SPONSORSHIP"
```

Final account was written as `60307021` by the deterministic forced override:

```python
1033    # ── v21 Fix 2: deterministic 26-NNN sponsorship override ─────────────────
1040    if (route_reason == "26NNN_LIKELY_SPONSORSHIP"
1041            and final.get("account") in ("60301003", "60301004")
1042            and final.get("account") != "21070229"):
1043        final["account"] = "60307021"
1044        final["_agent_method"] = "v16_26nnn_forced_sponsorship"
1045        method = "26nnn_forced_sponsorship"
```

2. **Q2 — The `26-NNN` Pattern Rule**

There is no `26-NNN` sponsorship rule in `cost_center_resolver.py` / the missing `scripts/classify_account.py`. `_is_sponsorship()` only checks OPEX/event patterns:

```python
53    # Sponsorship detection: OPEX forms and event reference codes in description
54    SPONSORSHIP_PATTERNS = [
55        r"OPEX[-\s]",
56        r"CRM-\d{4}-\d+",
57        r"HF-\d{4}-\d+",
...
67        r"Barcelona Registrati",
68    ]
```

The `26-NNN + NTS/HOTEL/etc.` rule is in `run_v16.py`, lines 292-296 above, plus the forced override at lines 1040-1045.

It is effectively unconditional once these are true:

```text
route_reason == 26NNN_LIKELY_SPONSORSHIP
final account is 60301003 or 60301004
final account is not 21070229
```

There is no escape condition like “if `emp_no` found in master, skip”.

3. **Q3 — Why Master Lookup Wasn’t a Guardrail**

Yes, `run_v16.py` has a master shortcut:

```python
900    # ── Master shortcut: employee found in doc AND in master? Skip Call 2 ──
901    if row_type == "employee" and emp_no_hint and emp_no_hint in manpower:
902        rec = resolve_from_master(emp_no_hint, manpower)
903        if rec:
904            final = enforce_sponsorship_rules(rec, classify, cascade_row)
905            final["_agent_method"]  = "v16_master_shortcut"
...
915            return final
```

But it only fires when **Call 1** returns both:

```text
row_type == "employee"
employee_no_in_doc is nonblank and exists in manpower
```

For these rows, Call 1 did not return an employee number:

```text
MOSTAFA rows: row_type=unclear, employee_no_in_doc=""
SULTAN rows: row_type=sponsorship, employee_no_in_doc=""
```

Call 2 later found `emp_no=1002091` / `1000995` and returned `account=60301003`, but the forced `26NNN_LIKELY_SPONSORSHIP` override runs after Call 2 and overwrites it to `60307021`.

Ordering is:

```text
_needs_classification() routes row as 26NNN_LIKELY_SPONSORSHIP
→ Call 1 classify_row()
→ master shortcut only if Call 1 gave employee_no_in_doc
→ Call 2 full_resolve_row()
→ v21 deterministic 26-NNN forced sponsorship override
```

4. **Q4 — `_should_classify()` Gate**

The function is named `_needs_classification()`, not `_should_classify()`, in this file. It does force classification for hotel/NTS/26-NNN rows:

```python
292    if re.search(r"\b26-\d{3}\b", text) and account in ("60301003", "60301004"):
293        HOSP_KEYWORDS = ("NTS", "HOTEL", "TRANSFER", "REGISTRATION", "VISA",
294                         "AIRLINE TICKET", "ACCOMMODATION", "PICKUP", "DROP")
295        if any(kw in desc.upper() for kw in HOSP_KEYWORDS):
296            return True, "26NNN_LIKELY_SPONSORSHIP"
```

This does not technically bypass the master shortcut. The shortcut still exists after Call 1. But because the shortcut depends on Call 1 finding `employee_no_in_doc`, it did not protect these rows. The later employee match from Call 2 was ignored by the deterministic forced sponsorship override.

5. **Q5 — `account_rule` for Rows 60-63**

Running the exact requested portal JSON check gives:

```text
60 60307021 None 1002091 RED
61 60307021 None 1002091 RED
62 60307021 None 1000995 RED
63 60307021 None 1000995 RED
```

The portal JSON does not include `account_rule`; it returns `None`.

The output XLSX does contain `Agent Account Rule`, but it is stale cascade metadata, not the final v16/v30 override rule:

```text
MOSTAFA 26-731: Account=60307021, Agent Account Rule=L8_sm_travel: DIV=194, Agent Method=llm_agent
MOSTAFA 26-732: Account=60307021, Agent Account Rule=L8_sm_travel: DIV=194, Agent Method=llm_agent
SULTAN 26-733: Account=60307021, Agent Account Rule=L8_sm_travel: DIV=194, Agent Method=llm_agent
SULTAN 26-734: Account=60307021, Agent Account Rule=L8_sm_travel: DIV=194, Agent Method=llm_agent
```

The real rule path is visible in `llm_trace` / `step-trace-v30.jsonl`:

```text
route_reason=26NNN_LIKELY_SPONSORSHIP
Call 2 account=60301003
Final account=60307021
```

6. **Q6 — Fix Recommendation**

Minimal fix: add an employee-master guard to the deterministic forced sponsorship override in `scripts/run_v16.py`, inside `process_row()`, around lines 1033-1045.

Current bad condition:

```python
if (route_reason == "26NNN_LIKELY_SPONSORSHIP"
        and final.get("account") in ("60301003", "60301004")
        and final.get("account") != "21070229"):
    final["account"] = "60307021"
```

Recommended guard:

```python
final_emp = str(final.get("emp_no") or "").strip()

if (route_reason == "26NNN_LIKELY_SPONSORSHIP"
        and final.get("account") in ("60301003", "60301004")
        and final.get("account") != "21070229"
        and final_emp not in manpower):
    final["account"] = "60307021"
```

Even safer: if `route_reason == "26NNN_LIKELY_SPONSORSHIP"` and `final_emp in manpower`, explicitly preserve or force `60301003`, because Call 2 has already proven the passenger is an employee.

That is the narrowest fix because it does not require changing `_needs_classification()` signatures or adding passenger-name matching before routing. It simply prevents the final deterministic override from contradicting a successful master employee resolution.

Root cause in one sentence: the `26-NNN + NTS/hotel` heuristic routed the rows as likely sponsorship, and the later forced sponsorship override blindly changed Call 2’s correct employee-travel result `60301003` to `60307021` without checking that the resolved passenger emp_no exists in Manpower.

[status: done rc=0]
