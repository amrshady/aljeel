Fixed and verified. No deploy, commit, or push performed.

### Result

- Broken SPLIT total: **SAR 1,814,445.88**
- Regenerated SPLIT total: **SAR 315,320.45**
- Original v30 invoice-line total: **SAR 315,320.45**
- Invoice header: **SAR 325,687.00**

All **129 parent lines** conserve exactly into **153 output rows**.

| Event | Parent lines | Split output |
|---|---:|---:|
| SIS-15-2026 | 8,385.00 | 8,385.00 |
| SIS-14-2026 | 21,150.00 | 21,150.00 |
| EP-2026-20 | 61,589.57 | 61,589.57 |
| CRM-2026-38 | 29,600.00 | 29,600.00 |

Spot checks:

- SIS-15 line `4,250.00` → `1,416.66 + 1,416.67 + 1,416.67`
- EP line `12,000.00` → `12,000.00` for its single form employee
- CRM line `14,800.00` → `14,800.00` for its single form employee

### Attribution and regressions

- SIS-14/SIS-15 retain employee order: `1001422, 1002169, 1001530`
- EP-2026-20 retains `1000433`
- CRM-2026-38 retains `1001762`
- Event GL segments match their parent rows.
- All 13 sponsorship lines without a valid table remain blank and review-flagged.
- Existing mismatch, ambiguity, and GI review flags remain present.
- All 84 non-sponsorship rows are cell-for-cell unchanged. This batch contains no multi-employee travel parent rows.

### Diff

- [split_multi_emp.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:167)
  - Form amounts are now ratios only.
  - Added proportional and no-amount even allocation.
  - First child absorbs rounding remainder.
  - Child amounts exactly conserve the invoice line.
- [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1600)
  - Supports employee-only OPEX tables with no explicit amounts.
  - Preserves existing discovery, matching, and review behavior.
- [test_sponsor_allocation_rules.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:188)
  - Replaced raw-form-amount assertion.
  - Added equal-ratio, proportional-ratio, no-amount, rounding, and conservation coverage.
- Regenerated [Spreadsheet-J26-1029-FILLED-v30-SPLIT.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-1029/output/Spreadsheet-J26-1029-FILLED-v30-SPLIT.xlsx)

### Verification

- Focused regression suite: **29 passed**
- Python compilation: passed
- `git diff --check`: passed
- Repository-wide suite: **70 passed, 1 unrelated failure** in `TestTier3Hierarchy.test_multiple_same_agency` (`ALLOCATION_TARGET_MISSING` versus expected `MULTI_ALLOCATION_PENDING_REVIEW`).
