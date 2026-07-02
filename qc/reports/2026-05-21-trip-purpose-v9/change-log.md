# Trip Purpose Classifier — Change Log (v8 → v9)

**Date:** 2026-05-21

**Agent:** Trip Purpose Classifier v1 (deterministic regex, zero LLM)


## J26-640

- Total lines: 117
- Lines with account flip: **68**
- Total SAR flipped: **SAR 120,365.02**
- Total batch SAR: SAR 290,435.00
- Flip rate: 58.1%

### Account Distribution (v8 → v9)

| Account | v8 Lines | v9 Lines | Delta |
|---------|----------|----------|-------|
| 11034013 | 0 | 68 | +68 |
| 21070229 | 2 | 1 | -1 |
| 60301003 | 60 | 14 | -46 |
| 60301004 | 19 | 2 | -17 |
| 60307021 | 35 | 32 | -3 |
| 60308009 | 1 | 0 | -1 |

### Flip Directions

| From → To | Count | SAR |
|-----------|-------|-----|
| 60301003 -> 11034013 | 46 | SAR 84,030.03 |
| 60301004 -> 11034013 | 17 | SAR 21,124.99 |
| 60307021 -> 11034013 | 3 | SAR 9,400.00 |
| 21070229 -> 11034013 | 1 | SAR 3,660.00 |
| 60308009 -> 11034013 | 1 | SAR 2,150.00 |

## J26-788

- Total lines: 103
- Lines with account flip: **76**
- Total SAR flipped: **SAR 91,230.99**
- Total batch SAR: SAR 140,328.99
- Flip rate: 73.8%

### Account Distribution (v8 → v9)

| Account | v8 Lines | v9 Lines | Delta |
|---------|----------|----------|-------|
| 11034013 | 0 | 76 | +76 |
| 60301003 | 90 | 17 | -73 |
| 60301004 | 5 | 2 | -3 |
| 60307021 | 8 | 8 | 0 |

### Flip Directions

| From → To | Count | SAR |
|-----------|-------|-----|
| 60301003 -> 11034013 | 73 | SAR 82,000.99 |
| 60301004 -> 11034013 | 3 | SAR 9,230.00 |


## Combined Impact

- **Total lines flipped: 144 / 220**
- **Total SAR impact: SAR 211,596.01**
- Primary flip: `60301003` (Travel Expense) → `11034013` (Personal Recharge)