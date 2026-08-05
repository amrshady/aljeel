Root cause confirmed for both symptoms. No files were edited, no deployment occurred, and the frozen baseline was untouched.

## Findings

### 1. Why AF says “Contribution”

`build_gl_description()` is behaving as written. It does not read the existing Excel value in column X and does not contain a hardcoded “Contribution” fallback.

The path is:

1. `sync_final_gl_descriptions()` reads the final Distribution Combination.
2. `build_gl_description()` calls `lookup.expand_combo(final_combo)`.
3. `expand_combo()` extracts DIV segment `170`.
4. `CodeNameLookup` loads the DIV table from `qc/master-data/Aljeel_Lookups-v2.xlsx`.
5. That table explicitly contains:

```text
DIV 170 → Contribution
DIV 888 → G&A
```

Relevant code:

- [cost_center_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:496)
- [code_name_lookup.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/code_name_lookup.py:72)
- [code_name_lookup.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/code_name_lookup.py:168)
- [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4356)

Therefore:

```text
...-170010-170-00000-00000-...
               ^^^
               DIV lookup → "Contribution"
```

The label is not independently wrong. It accurately describes the wrong final DIV.

For rows 28/29, the authoritative cascade breakdown is:

```text
CC=999999 DIV=888 Sol=00000 Ag=88888
```

That expands to:

```text
Accrued Employee Annual Tickets · — · G&A · General · G&A · 00000 · 00 · 000000
```

It does not say “Contribution.”

### 2. Why rows 28/29 lost `888/88888`

`process_batch.py` correctly applies the annual-ticket rollup:

```text
DIV=888
Solution=00000
Agency=88888
```

Relevant code:

- [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:2489)

But run_v30’s LLM overlay later writes host/shared-evidence allocations onto these rows. The late Trip Account Override pass is meant to reassert the authoritative override, but it only checks the account:

```python
if old_acct == ovr:
    continue
```

Relevant code:

- [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5791)

Because both values are already `21070229`, the pass exits without restoring the cascade’s authoritative `CC/DIV/Solution/Agency`. Thus `170010/170/00000/00000` survives even though the cascade breakdown says `999999/888/00000/88888`.

### 3. Row 27 account bleed

There are two consecutive contamination mechanisms.

First, the core resolver correctly produces:

```text
60301003
L9_external_travel: not in Manpower, no OPEX ref
```

This is independently corroborated by `catches-within-batch.json`, which records ticket `4860966728` with account `60301003`.

Then run_v30 routes the unresolved row through the full-evidence LLM. Its trace shows that the LLM inspected the host PDF containing Mouna Makhlouf plus the two Merheb children and the “Family Tickets” email. It inferred personal/family travel and overwrote all financial fields with:

```text
account=21070229
CC=170010 DIV=170 Agency=00000
```

The unconditional merge occurs here:

- [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5317)

Second, booking-group propagation groups tickets 6728–6730 solely because they are consecutive and share the same route. Because any member is CHD, `_is_family_group()` treats the entire three-row group as family, even though MAKHLOUF and MERHEB are different surnames:

- [run_v17.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v17.py:217)
- [run_v17.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v17.py:354)

There is another bug in the same pass: the code says the `21070229` resolution is elected as the PC anchor, but `_pick_anchor()` is called afterward without honoring that selected key. It prefers the non-dependent adult row—Mouna—and propagates her `170010/170` allocation to both children:

- [run_v17.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v17.py:421)
- [run_v17.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v17.py:445)

The bundled PDF flag is therefore relevant, but not as a direct row-27 inheritance operation:

- Rows 28/29 are pointed to row 27’s shared PDF.
- The shared PDF causes the LLM’s family inference.
- The booking-group pass then treats all three consecutive tickets as one family.
- Stage 3k bundled inheritance is not the primary account overwrite here because rows 28/29 already possess authoritative trip overrides.

## Confirmed intended result

Under the current deterministic finance rules:

| Excel row | Account | CC | DIV | Agency | Expected AF |
|---|---:|---:|---:|---:|---|
| 27 | `60301003` | `999999` | `000` | `00000` | `Travel Tickets Expense · — · General · General · General · 00000 · 00 · 000000` |
| 28 | `21070229` | `999999` | `888` | `88888` | `Accrued Employee Annual Tickets · — · G&A · General · G&A · 00000 · 00 · 000000` |
| 29 | `21070229` | `999999` | `888` | `88888` | Same as row 28 |

Thus row 27 should return to external travel. Rows 28/29 should retain `21070229`; their family-cluster override is explicit and intentional, but their annual-ticket segments must be restored.

## Proposed review-only diff

The minimal fix has three guards:

1. Preserve the deterministic L9 external allocation when an unsupported LLM result tries to turn a non-dependent, unresolved external traveler with no employee or trip override into annual travel.
2. When an authoritative `21070229` Trip Account Override exists, restore its cascade segments even if the account already matches.
3. Prevent PC booking propagation across an unrelated adult surname, and actually use the elected PC anchor.

```diff
diff --git a/scripts/run_v30.py b/scripts/run_v30.py
--- a/scripts/run_v30.py
+++ b/scripts/run_v30.py
@@ -5317,6 +5317,18 @@
                 method = res.get("_agent_method", "cascade_fallback")
                 hybrid_rows[idx]["_agent_method"] = method
+                cascade_row = cascade_rows[idx]
+                preserve_external_allocation = (
+                    str(cascade_row.get("Resolution Layer", "") or "").strip()
+                    == "not_resolved"
+                    and str(cascade_row.get("Agent Account Rule", "") or "")
+                    .startswith("L9_external_travel:")
+                    and not is_dependent(
+                        str(cascade_row.get("Description", "") or "")
+                    )
+                    and str(res.get("account", "") or "").strip() == "21070229"
+                    and not str(res.get("emp_no", "") or "").strip()
+                    and not str(cascade_row.get("Trip Account Override", "") or "").strip()
+                )
                 if (
                     "cascade_fallback" not in method
                     and not (
@@ -5327,7 +5339,10 @@
                     if row_verified_emp_locked(hybrid_rows[idx]):
                         protected = ("emp_no", "account", "cost_center", "div", "solution", "agency")
+                    elif preserve_external_allocation:
+                        protected = ("emp_no", "account", "cost_center", "div", "solution", "agency")
+                        _append_hybrid_flag(hybrid_rows[idx], "LLM_ANNUAL_OVERRIDE_REJECTED_L9")
                     else:
                         protected = ()
                     for key in ("emp_no", "account", "cost_center", "div", "solution", "agency"):
                         if key in protected:
                             continue
@@ -5805,10 +5820,25 @@
         if conf < 0.7:
             continue
         old_acct = str(hybrid_rows[i].get("account", "") or "").strip()
-        if old_acct == ovr:
-            continue
         hybrid_rows[i]["account"] = ovr
+
+        # A matching account is not sufficient: an LLM/shared-PDF overlay may
+        # have replaced the authoritative account-specific segments. Restore
+        # the cascade segments whenever the cascade owns this same override.
+        segments_restored = False
+        if (
+            ovr == "21070229"
+            and str(c.get("Account", "") or "").strip() == ovr
+        ):
+            for key, header in (
+                ("cost_center", "Cost Center"),
+                ("div", "DIV"),
+                ("solution", "Solution"),
+                ("agency", "Agency"),
+            ):
+                value = str(c.get(header, "") or "").strip()
+                if value and str(hybrid_rows[i].get(key, "") or "").strip() != value:
+                    hybrid_rows[i][key] = value
+                    segments_restored = True
+
+        if old_acct == ovr and not segments_restored:
+            continue
         # Cascade-method rows are skipped by write_v15_12_xlsx — promote so
         # the new account (and a rebuilt combo) actually reach the sheet.
         if hybrid_rows[i].get("_agent_method", "cascade") == "cascade":
             hybrid_rows[i]["_agent_method"] = "hybrid_overlay"
diff --git a/scripts/run_v17.py b/scripts/run_v17.py
--- a/scripts/run_v17.py
+++ b/scripts/run_v17.py
@@ -319,6 +319,24 @@
 SURNAME_RE = re.compile(r'^([A-Z][A-Z\s]+)/')
 
 
+def _passenger_surname(row: dict) -> str:
+    match = SURNAME_RE.match(str(row.get("Description", "") or "").upper())
+    return match.group(1).strip() if match else ""
+
+
+def _rows_family_related(left: dict, right: dict) -> bool:
+    left_surname = _passenger_surname(left)
+    right_surname = _passenger_surname(right)
+    if left_surname and left_surname == right_surname:
+        return True
+    left_emp = str(left.get("Employee No", "") or "").strip()
+    right_emp = str(right.get("Employee No", "") or "").strip()
+    return bool(
+        left_emp
+        and left_emp not in ("0", "None")
+        and left_emp == right_emp
+    )
+
+
 def _group_has_dependent(group_indices: list[int], rows: list[dict]) -> bool:
@@ -408,6 +426,7 @@
             continue
         group_pc_wins = False
+        forced_anchor_idx = None
         resolved_keys: dict[str, list[int]] = {}
@@ -428,6 +447,7 @@
                 pc_combo, pc_emp = pc_key.split("||")
                 resolved_keys = {pc_key: resolved_keys[pc_key]}
+                forced_anchor_idx = resolved_keys[pc_key][0]
                 group_pc_wins = True
@@ -443,7 +463,10 @@
 
         # ── pick anchor ────────────────────────────────────────────────────
-        anchor_idx = _pick_anchor(group_indices, rows)
+        anchor_idx = (
+            forced_anchor_idx
+            if forced_anchor_idx is not None
+            else _pick_anchor(group_indices, rows)
+        )
         if anchor_idx is None:
             continue
@@ -472,6 +495,15 @@
             row   = rows[i]
             desc  = str(row.get("Description", "") or "")
             combo = str(row.get(combo_col, "") or "")
             is_dep = is_dependent(desc)
+
+            # Consecutive tickets on one route are not sufficient proof that
+            # an unrelated adult belongs to a CHD passenger's family.
+            if (
+                group_pc_wins
+                and not is_dep
+                and not _rows_family_related(row, rows[anchor_idx])
+            ):
+                continue
+
             was_resolved = is_resolved(combo)
```

## Regression risk

The segment-restoration change is low risk: it only applies where the cascade itself has the same high-confidence `21070229` override.

The booking-group change is also narrow: dependent rows still inherit normally, as do adults sharing a surname or nonblank employee number. It only stops propagation onto an adult for whom the group has no family-link evidence beyond ticket proximity and route.

The L9 preservation guard has the greatest policy risk. It could preserve `60301003` for a genuine adult annual traveler who is absent from Manpower and has no deterministic Trip Account Override. That is why it is limited to non-dependent rows, blank LLM employee, `not_resolved`, and the explicit deterministic `L9_external_travel` rule. This should receive a focused fixture before acceptance.

J26-640 must be regenerated and compared with [golden_field_diff.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/golden_field_diff.py:1). Required acceptance checks:

- J26-1140 rows 27–29 match the table above.
- J26-640 golden field diff remains zero.
- Existing same-surname and shared-employee family groups still propagate.
- A synthetic consecutive-ticket group containing one unrelated adult plus CHD passengers does not overwrite the adult.
- AF is always regenerated from the corrected final combo; no special-case AF text should be added.
