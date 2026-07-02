# Stable Baseline Rerun — 2026-06-01

Run timestamp: 2026-06-01 ~13:38–13:52 UTC  
Pipeline: run_v25.py (pre-FORM_CODES_DISAGREE revert, sponsorship cache guard active)  
Code state: stable — no script modifications

| Batch | Score | Rows | Status |
|---|---|---|---|
| J26-550 | 87.5% | 63/72 | ✅ |
| J26-589 | 79.8% | 103/129 | ✅ |
| J26-593 | 81.9% | 131/160 | ✅ |
| J26-640 | 100.0% | 117/117 | ✅ |
| J26-788 | N/A | 103 rows | ✅ (no truth file) |

## Notes
- J26-640 confirmed 100% — not a blocker ✅
- J26-589 at 79.8% vs expected ~80.6%: delta of 1 row, within LLM variance (ALUTHMAN rows show 60301003 cascade baseline as expected — separate patch pending)
- J26-593 at 81.9% vs expected ~81.2%: slightly above baseline, acceptable
- J26-550 at 87.5% matches expected exactly

Verdict: **STABLE**
