# J26-640 Golden Fixture Regression Check (2026-05-21)

## Result: PASS

The email validator additions (A1-A5) do NOT change any Distribution Combination output.
The validator only ADDS columns — it never modifies the combo.

### Match Summary
| Metric | Value |
|--------|-------|
| Total lines | 117 |
| Exact match | 111 |
| Location-only drift | 6 |
| Drift rate | 5.1% |

### Drift Details (pre-existing, unchanged from v5/v6)

All 6 drifts are Location segment only (40100/20100 → 10100). These are pre-existing
from the Manpower data and were documented in the v5-rulebook run.

| Row | Passenger | Expected Loc | Derived Loc | Other segments |
|-----|-----------|-------------|-------------|----------------|
| 23 | ALHAZZAA/KADI MS | 40100 | 10100 | Match |
| 45 | MAHMOUD/BELAL MR | 40100 | 10100 | Match |
| 67 | ABU DOGHMEH/SULTAN MR | 20100 | 10100 | Match |
| 68 | AMER/MOSTAFA MR | 20100 | 10100 | Match |
| 84 | HASHAD/TAREK MR | 40100 | 10100 | Match |
| 101 | ELSHAMALY/MAHMOUD MOFEED MR | 20100 | 10100 | Match |

### Verification Method
- Ran `python3 scripts/validate_golden.py` after all validator changes
- Script compares derived combo vs golden fixture for all 117 lines
- No new drifts introduced by the email validator step
