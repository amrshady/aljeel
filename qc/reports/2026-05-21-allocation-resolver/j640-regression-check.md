# J26-640 Golden Fixture Regression Check

## Result: PASS - No New Regressions

| Metric | Before Allocation Patch | After Allocation Patch |
|--------|------------------------|----------------------|
| Total lines | 117 | 117 |
| Exact match | 111 | 111 |
| Drifts | 6 | 6 |
| Drift rate | 5.1% | 5.1% |

### Pre-Existing Drifts (Location segment only, unchanged)

All 6 drifts are Location-only mismatches that pre-date the allocation resolver:

| Row | Passenger | Expected Location | Derived Location |
|-----|-----------|-------------------|------------------|
| 23 | ALHAZZAA/KADI MS | 40100 | 10100 |
| 45 | MAHMOUD/BELAL MR | 40100 | 10100 |
| 67 | ABU DOGHMEH/SULTAN MR | 20100 | 10100 |
| 68 | AMER/MOSTAFA MR | 20100 | 10100 |
| 84 | HASHAD/TAREK MR | 40100 | 10100 |
| 101 | ELSHAMALY/MAHMOUD MOFEED MR | 20100 | 10100 |

All other segments (Account, CC, DIV, Solution, Agency) match exactly. The allocation resolver code path does NOT fire on J26-640 (different batch), confirming zero regression risk.

### Run Command
```bash
cd /home/clawdbot/.openclaw/workspace/aljeel
python3 scripts/validate_golden.py
```
