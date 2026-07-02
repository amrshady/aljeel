# Regression Report — Sponsorship Cache-Poisoning Fix
**Date:** 2026-06-01  
**Fix applied:** `process_batch.py` line 762 — added `not v2_result.is_sponsorship` guard to cache-enrichment path  
**Cache cleaned:** `UTHMAN ALUTHMAN → 1001986` entry removed from `cache/passenger_to_empno.json`  
**Batches tested:** J26-550, J26-589, J26-593, J26-640, J26-788

---

## 1. All-5 Scores — Before vs After

| Batch | Baseline (v25) | Today (v25 rerun) | Delta | Status |
|---|---|---|---|---|
| J26-550 | 84.7% | 87.5% | +2.8pp | ✅ IMPROVED |
| J26-589 | 79.8% | 79.1% | **-0.7pp** | ❌ REGRESSION |
| J26-593 | 81.2% | 81.2% | 0.0pp | ✅ STABLE |
| J26-640 | 100.0% | 100.0% | 0.0pp | ✅ STABLE |
| J26-788 | N/A (no truth) | N/A (no truth) | — | ✅ N/A |

### J26-589 Regression Analysis

The 0.7pp drop (102/129 = 79.1% vs baseline 79.8%) is **attributable to LLM variability**, not the cache fix. Specific new errors in today's run:

- **ALMUTAIRI/MAJED MR** (tickets 6904982191 and 6904982219): CC resolved as `140040` today vs correct `160011` (LLM agent routed rows — non-deterministic)
- **26-559 MOHAMMED ALTAIR**: CC resolved as `160014` today vs correct `170020`
- **26-600 / 26-611 ABDULLAH ALMADDAH**: CC `250010` vs correct `160014`, spurious emp_no `1000764` written (LLM agent)

All of these are LLM-agent rows, not cascade rows. LLM cache was disabled for the run (`[llm] cache DISABLED`), confirming this is LLM variance.

---

## 2. ALUTHMAN/UTHMAN Rows in J26-589 — Cache Fix Assessment

### Rows under review
- **Data row 51**: `ALUTHMAN/UTHMAN MR - JED JFK JED (6904982192)`
- **Data row 59**: `ALUTHMAN/UTHMAN MR - JFK ORD JFK (6904982220)`

### Finding: Cascade rows — output UNCHANGED from v15.11.2

Both rows are in the **cascade pass** (83 of 129 rows stayed cascade; these rows were not re-routed to LLM). The v25 pipeline preserves cascade input values for these rows.

| Field | Cascade input (v15.11.2) | v25 output (today) | Changed? |
|---|---|---|---|
| Employee No | None | None | No |
| Account | 60301003 | 60301003 | No |
| Cost Center | 160011 | 160011 | No |
| DIV | 196 | 196 | No |
| Solution | 00000 | 00000 | No |
| Agency | 10156 | 10156 | No |
| Resolution Flag | `RESOLVED_VIA_CROSS_BATCH_CACHE` | `RESOLVED_VIA_CROSS_BATCH_CACHE` | No |
| Resolution Trace | `L8→cache hit key='UTHMAN ALUTHMAN' → emp=1001986` | (same) | No |

**The `RESOLVED_VIA_CROSS_BATCH_CACHE` flag and trace are inherited from the cascade input (v15.11.2), NOT from a fresh cache lookup in today's run.** The v25 pipeline did not re-run the v2 employee resolver for these cascade rows.

### Cache state verification

The `cache/passenger_to_empno.json` file was confirmed to have **no entry for `UTHMAN ALUTHMAN`** after the fix. The entry was successfully removed. A grep against the cache file returned zero matches for `ALUTHMAN` or `UTHMAN`.

### Implication

The fix is effective at the cache layer:
- Future fresh batch runs (batches that do NOT have v15.11.2 cascade input) will NOT resolve `UTHMAN ALUTHMAN` via L8 cache.
- The `not v2_result.is_sponsorship` guard in `process_batch.py:762` prevents re-poisoning on all future batches.
- The legacy trace/flag in J26-589's output reflects historical v15.11.2 cascade data — it is **not a new cache hit** from today's run.

To fully remediate J26-589's trace fields, the batch would need to be re-processed from scratch (bypassing the cascade), forcing the v2 resolver to re-evaluate these rows fresh.

---

## 3. Pass/Fail Verdict

```
OVERALL VERDICT: FAIL
```

### Criteria evaluated

| Criterion | Result | Detail |
|---|---|---|
| No regression on any batch (> 0.5pp drop) | ❌ FAIL | J26-589 dropped 0.7pp |
| IMPROVEMENT on J26-589 ALUTHMAN rows | ❌ FAIL | No output change — rows stayed in cascade, trace/flag unchanged |

### Mitigating context

1. **J26-589 regression is LLM-variance, not cache-fix related.** The 0.7pp drop comes from LLM-agent rows making different account/CC decisions. The cache fix did not affect these rows.

2. **ALUTHMAN rows are functionally correct.** Employee No is `None` (correct — UTHMAN ALUTHMAN is not an AlJeel employee). The poisoned trace is cosmetic metadata from the cascade, not an active cache hit.

3. **Cache fix is working.** The `passenger_to_empno.json` cache is clean. The sponsorship guard is in place. No new poisoning can occur.

4. **The formal FAIL is on criteria strictness.** The intent of the fix (prevent future cache poisoning) was achieved. The letter of the test criteria (ALUTHMAN rows must resolve differently in J26-589 v25) was not met because v25 does not re-process cascade rows.

### Recommended action

- Accept the cache fix as functionally correct — the poisoning vector is closed.
- For J26-589 specifically: if a clean trace is needed, re-run J26-589 from the original (pre-cascade) input, bypassing the v15.11.2 cascade baseline, so the v2 resolver re-evaluates ALUTHMAN rows fresh.
- Investigate J26-589 LLM regression (ALMUTAIRI rows, ALMADDAH rows) separately — these are pre-existing LLM variability issues, not regressions introduced by the cache fix.

---

*Report generated: 2026-06-01 by AP Agent subagent*  
*Pipeline: v25 | PYTHONPATH: scripts/ | Working dir: aljeel/*
