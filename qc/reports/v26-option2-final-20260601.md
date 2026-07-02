# v26 Option 2 Overlay — Final QC Report
**Date:** 2026-06-01  
**Run:** v26 Option 2 overlay test — GL name fix + requesting-employee agency lookup  
**Pipeline:** run_v25.py (with v26-overlay embedded)

---

## Score Summary

| Batch | Before | After | Delta | Verdict |
|---|---|---|---|---|
| J26-550 | 87.5% | 87.5% | 0.0% | ✅ PASS |
| J26-589 | 79.8% | 79.8% | 0.0% | ✅ PASS (≥79.8% required) |
| J26-593 | 81.9% | 81.9% | 0.0% | ✅ PASS |
| J26-640 | 100.0% | 100.0% | 0.0% | ✅ PASS (no regression) |
| J26-788 | N/A | N/A | N/A | ✅ PASS (new batch, no truth baseline) |

---

## ALUTHMAN Rows — J26-589

Two rows fired `v26_opex_event_overlay` (AATS Annual Meeting 2026):

| Field | Value |
|---|---|
| `account` | 60307021 |
| `GL` | Sponsoring Expenses |
| `agency` | 10156 |
| `combo_starts_with` | `03-40100-60307021` |

Full combination example: `03-40100-60307021-160011-196-00000-10156-00000-00-000000`

Both rows (tickets 6904982192 JED→JFK→JED and 6904982220 JFK→ORD→JFK) correctly assigned to sponsorship account 60307021 via OPEX event folder match. EmpNo=blank (correct for sponsorship). Agency=10156 (AATS requesting-employee lookup applied).

---

## Overlay Fired Counts

| Batch | `[v26-overlay]` rows |
|---|---|
| J26-550 | 0 |
| J26-589 | **2** |
| J26-593 | 0 |
| J26-640 | 0 |
| J26-788 | 0 |
| **Total** | **2** |

---

## J26-640 Regression Guard

- Before: 100.0%  
- After: 100.0%  
- **✅ NO REGRESSION — hard constraint satisfied**

---

## Run Details

| Batch | Rows | LLM Routed | LLM Cost (est) | Runtime |
|---|---|---|---|---|
| J26-550 | 78 | 16 | $0.1352 | 59.0s |
| J26-589 | 129 | 46 | $0.5019 | 206.0s |
| J26-593 | 160 | 18 | $0.2808 | 94.2s |
| J26-640 | 117 | 3 | $0.0524 | 22.3s |
| J26-788 | 103 | 6 | $0.0862 | 49.6s |
| **Total** | **587** | **89** | **~$1.056** | **~431s** |

---

## Overall Verdict

**✅ PASS**

- All 4 scored batches meet or exceed their baselines
- J26-640 holds at 100.0% — hard regression constraint satisfied
- v26 overlay fired correctly on 2 ALUTHMAN rows in J26-589 (AATS Annual Meeting 2026)
- GL name "Sponsoring Expenses" correctly populated (GL fix confirmed)
- Agency 10156 correctly resolved via requesting-employee lookup
- No overlay fires on other batches (no false positives detected)
- J26-788 runs clean (N/A — no truth file matched, expected for new batch)
