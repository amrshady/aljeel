# v25 Locked Scores — All Batches
**Run date:** Fri 2026-05-29 UTC  
**Pipeline:** `scripts/run_v25.py` (no cache, fully fresh LLM)  
**Scoring:** Aljeel truth sheets only (`batches/jawal-J26-XXX/J26-XXX.xlsx`)

---

## Score Summary

| Batch | Period | Total Rows | Correct (All-5) | All-5 % | Account % | CC % | Agency % |
|---|---|---:|---:|---:|---:|---:|---:|
| J26-640 | Apr 24–30 | 117 | 117 | **100.0%** ✅ | 100.0% | 100.0% | 100.0% |
| J26-550 | Apr 1–7 | 72 | 63 | **87.5%** | 95.8% | 95.8% | 95.8% |
| J26-589 | Apr 8–15 | 129 | 103 | **79.8%** | 96.9% | 93.8% | 90.7% |
| J26-593 | Apr 16–23 | 160 | 131 | **81.9%** | 96.2% | 86.2% | 83.1% |
| J26-788 | — | 103 | N/A | **N/A** | — | — | — |

---

## Totals (4 scored batches)

- **Total scored rows:** 478
- **Total correct rows (all-5 exact):** 414
- **Overall all-5 exact:** 414/478 = **86.6%**
- **Overall account%:** ~97.3% weighted avg
- **Overall CC%:** ~92.8% weighted avg
- **Overall agency%:** ~91.4% weighted avg

---

## Per-Batch Detail

### J26-640 (Golden batch — 100%)
- All-5: 117/117 = **100.0%**
- Account: 100.0% | CC: 100.0% | DIV: 100.0% | Solution: 100.0% | Agency: 100.0%
- emp_no: 11.1% (expected — sponsorship rows intentionally blank)
- LLM cost: ~$0.052 | Runtime: 19.8s | 3 rows LLM routed

### J26-550 (Apr 1–7 batch)
- All-5: 63/72 = **87.5%**
- Account: 95.8% (3 mismatches) | CC: 95.8% (3 mismatches) | Agency: 95.8% (3 mismatches)
- Paired rows: 72 (6 extra pipeline rows not in truth — family dependents)
- Key mismatches: ALEJO/JOE MARIE (PC exit visa), ALTAIR/MOHAMMED (transit route), BIN MUDHIAN (unknown GL 60308009)
- LLM cost: ~$0.136 | Runtime: 54.5s | 16 rows LLM routed
- Family Fix A/B/C verified: HUSSEIN/TALIA, HUSSEIN/YOUSSEF, SALEM/EFFAT → correct ✅

### J26-589 (Apr 8–15 batch)
- All-5: 103/129 = **79.8%**
- Account: 96.9% (4 mismatches) | CC: 93.8% (8 mismatches) | Agency: 90.7% (12 mismatches)
- Key mismatches: ALUTHMAN sponsorship missed (2 rows), ALMADDAH CC/Agency (EHRA stale master), ALMUTAIRI stale master (CC/Agency off)
- 26NNN unclear rows: 8 flagged correctly unresolvable
- LLM cost: ~$0.503 | Runtime: 192.6s | 46 rows LLM routed (largest batch)
- Fraud catches: 4 (PASSENGER_AMOUNT_PATTERN)

### J26-593 (Apr 16–23 batch)
- All-5: 131/160 = **81.9%**
- Account: 96.2% (6 mismatches) | CC: 86.2% (22 mismatches) | Agency: 83.1% (27 mismatches)
- Key mismatches: ALQARNI/HALAWANI/DAGRIRI not in master (DMS 2026/Prague Rhythm), ABDELMAQSOUD over-classified as PC (2 rows), multiple stale master CC/agency issues
- Travel rows 100%: 14/14 perfect
- LLM cost: ~$0.280 | Runtime: 94.0s | 18 rows LLM routed
- Fraud catches: 3 (PASSENGER_AMOUNT_PATTERN)

### J26-788 (No truth sheet — unscored)
- No Aljeel truth sheet available
- 103 rows processed | 6 LLM-routed | PC applied: 2 rows | PC-family blanked: 2
- SALEH/FARAH + SALEH/EKREMA family folder fix (Fix A/B) applied
- LLM cost: ~$0.085 | Runtime: 41.7s
- Fraud catches: 2 (PASSENGER_AMOUNT_PATTERN)

---

## Version Notes

v25 fixes over v24:
- **Fix A**: Adjacent-ticket folder expansion (±5 for "family" folders)
- **Fix B**: `process_row_v25` overrides classify's folder when better family folder found
- **Fix C**: `apply_pc_family_emp_no_rule` — PC-family dependents get emp_no blanked
- Combo fix: `DISTRIBUTION_KEY` corrected in `run_hybrid_v15_12.py`
- `_pc_resynced` flag restored in `apply_booking_groups_inline_v25`
- Stage 3c guard: skip when `hybrid_acct == "60307021"`
- Name-match: first+last BOTH required (prevents ALMADDAH false match on ABDULLAH)

---

## Dashboard
- Deployed: https://6076d468.aljeel-ap-finance.pages.dev
- Canonical: https://finance.aljeel.accordpartners.ai
- Deploy date: Fri 2026-05-29 UTC
