# v26 OPEX Event Folder Fix — 2026-06-01

**Fix applied:** OPEX_EVENT_FOLDER_MATCH rows now route via LLM agent (clean code fix, no manual patches)
**Pipeline:** `scripts/run_v25.py` (v25 with v26 OPEX_EVENT_FOLDER_MATCH routing fix)
**Run date:** 2026-06-01

---

## Score Comparison

| Batch | Before | After | Delta | Status |
|-------|--------|-------|-------|--------|
| J26-550 | 87.5% (63/72) | 80.6% (58/72) | -6.9% | ⚠️ REGRESSION |
| J26-589 | 79.8% (103/129) | 70.5% (91/129) | -9.3% | ⚠️ REGRESSION |
| J26-593 | 81.9% | 74.4% (119/160) | -7.5% | ⚠️ REGRESSION |
| J26-640 | 100.0% ✅ | 100.0% (117/117) | 0.0% | ✅ HOLDS |
| J26-788 | N/A | N/A (no truth) | — | N/A |

---

## Key Checks

### J26-640 Regression Guard
- **Result: 100.0% ✅ — PROTECTED**

### OPEX_EVENT_FOLDER_MATCH Routing Distribution
| Batch | Rows routed via OPEX_EVENT_FOLDER_MATCH |
|-------|----------------------------------------|
| J26-550 | 5 |
| J26-589 | 17 |
| J26-593 | 16 |
| J26-640 | 0 |
| J26-788 | 0 |

---

## ALUTHMAN / ALMUTAIRI Detail (J26-589)

### ALUTHMAN rows (6904982192, 6904982220)

| Ticket | Passenger | Route | Account (col) | Combo Account | CC | Method | Resolution Trace |
|--------|-----------|-------|---------------|---------------|-----|--------|-----------------|
| 6904982192 | ALUTHMAN/UTHMAN MR - JED JFK JED | OPEX_EVENT_FOLDER_MATCH → llm_agent | **60307021** ✅ | 60301003 | 160011 ✅ | llm_agent ✅ | RESOLVED_VIA_CROSS_BATCH_CACHE (conf=0.95) |
| 6904982220 | ALUTHMAN/UTHMAN MR - JFK ORD JFK | OPEX_EVENT_FOLDER_MATCH → llm_agent | **60307021** ✅ | 60301003 | 160011 ✅ | llm_agent ✅ | RESOLVED_VIA_CROSS_BATCH_CACHE (conf=0.95) |

- **Account (standalone col):** 60307021 ✅
- **Method:** llm_agent ✅
- **CC match vs truth (160011):** ✅ CORRECT

### ALMUTAIRI rows (6904982191, 6904982219)

| Ticket | Passenger | Route | Account (col) | Combo Account | CC | Method | Resolution Trace |
|--------|-----------|-------|---------------|---------------|-----|--------|-----------------|
| 6904982191 | ALMUTAIRI/MAJED MR - JED JFK JED | OPEX_EVENT_FOLDER_MATCH → llm_agent | **60307021** ✅ | 60301004 | 140040 ✗ | llm_agent ✅ | RESOLVED_VIA_GDS_FUZZY (conf=1.0, emp=1000485 "Mahmoud Abdulghani Khalid Almutairi") |
| 6904982219 | ALMUTAIRI/MAJED MR - JFK ORD JFK | OPEX_EVENT_FOLDER_MATCH → llm_agent | **60307021** ✅ | 60301004 | 140040 ✗ | llm_agent ✅ | RESOLVED_VIA_GDS_FUZZY (conf=1.0, emp=1000485 "Mahmoud Abdulghani Khalid Almutairi") |

- **Account (standalone col):** 60307021 ✅
- **Method:** llm_agent ✅
- **CC match vs truth (160011):** ✗ WRONG — pipeline output 140040, truth expects 160011
- Note: GDS fuzzy matched "MAJED ALMUTAIRI" → emp 1000485 (Mahmoud Almutairi), driving CC=140040 (Warehouse/G&A). Colleague-travel context (traveling with ALUTHMAN, same JFK trip) was not used to override CC to 160011.

---

## Regression Analysis

All three scored batches (J26-550, J26-589, J26-593) regressed significantly (-6.9% to -9.3%). The regressions are NOT explained solely by the OPEX_EVENT_FOLDER_MATCH fix — OPEX_EVENT_FOLDER_MATCH rows routed to LLM agent, but LLM outcomes were incorrect or introduced new mismatches.

Primary regression sources observed:
- **J26-589 (-9.3%):** 12 `solution` field mismatches (off-by-1), 16 account mismatches, 8 CC mismatches — worse than pre-fix. ALMUTAIRI CC still wrong (140040 vs 160011).
- **J26-550 (-6.9%):** 6 extra rows in pipeline not in truth (ADHRI/BENSALEM family group), emp_no issues on 16 rows.
- **J26-593 (-7.5%):** 20 account/CC/div field mismatches — cascade blanking of 23 sponsorship rows may have introduced errors.

⚠️ The v26 OPEX_EVENT_FOLDER_MATCH routing fix appears to be working (rows are now going through LLM agent as intended), but the LLM agent is not producing better outcomes than the prior cascade rule for many rows. The score regressions suggest the fix may have over-triggered on rows where the cascade rule was previously correct.

---

## Verdict

```
J26-640 holds 100%:           ✅ PASS
ALUTHMAN account=60307021:    ✅ PASS (Account col, both tickets)
ALMUTAIRI account=60307021:   ✅ PASS (Account col, both tickets)
ALMUTAIRI CC correct (160011): ✗ FAIL (pipeline: 140040)

Overall PASS condition: PARTIAL PASS
  - Critical guard (J26-640 = 100%) ✅
  - ALUTHMAN/ALMUTAIRI route via llm_agent ✅
  - Account col = 60307021 for all 4 target rows ✅
  - BUT: ALMUTAIRI CC wrong (140040 ≠ 160011) ✗
  - BUT: Score regressions on J26-550 (-6.9%), J26-589 (-9.3%), J26-593 (-7.5%) ⚠️
```

**VERDICT: PARTIAL PASS — J26-640 guard holds and target rows route via LLM with Account=60307021, but ALMUTAIRI CC is still wrong and broad score regressions warrant investigation before promotion.**

---

## Run Costs (estimated)
| Batch | LLM Rows | LLM Cost | Runtime |
|-------|----------|----------|---------|
| J26-550 | 21 | $0.20 | 74s |
| J26-589 | 63 | $0.75 | 264s |
| J26-593 | 34 | $0.52 | 164s |
| J26-640 | 3 | $0.05 | 20s |
| J26-788 | 6 | $0.09 | 44s |
| **Total** | **127** | **$1.61** | **~10 min** |
