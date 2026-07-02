# Per-Batch Comparison: J26-640 vs J26-788

| Metric | J26-640 | J26-788 |
|--------|---------|---------|
| Period | 24-30 Apr 2026 | 01-07 May 2026 |
| Total lines | 117 | 103 |
| Clean | 0 | 0 |
| Hard failures | 0 | 0 |
| Soft flags | 117 | 103 |
| emp_no_direct | 6 | 99 |
| name_fuzzy | 39 | 0 |
| not_found | 72 | 2 |
| Email forms found | 43 | 55 |
| EMPLOYEE_NOT_IN_MASTER | 72 | 2 |
| MANPOWER_DIV_NOT_IN_MASTER | 19 | 60 |
| FORM_TRIP_VALUE_DIFFERS | 40 | 54 |
| SPONSORSHIP_DETECTED | 5 | 8 |

## Key Structural Differences

1. **Employee resolution:** J26-788 had pre-filled emp numbers (96% direct match). J26-640 relies on name fuzzy matching (only 33% matched)
2. **Email validation:** J26-640 has 43 email forms found (37%), J26-788 has 55 (53%). The difference is partly due to folder naming conventions
3. **Account distribution:** Both batches dominated by 60301003 (Travel Tickets). J26-640 has more 60301004 (Travel Cost G&A) lines
