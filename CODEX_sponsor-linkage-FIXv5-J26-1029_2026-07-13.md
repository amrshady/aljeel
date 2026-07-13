Implemented and verified. No deployment, commit, or push performed.

### Result

Regenerated workbook: [Spreadsheet-J26-1029-FILLED-v30-SPLIT.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-1029/output/Spreadsheet-J26-1029-FILLED-v30-SPLIT.xlsx)

- Grand `*Amount`: **315,320.45**
- Remaining blank sponsorship rows: **0**
- Sponsorship parents allocated: **46**
- SPLIT: **129 parents → 190 rows**, 26 multi-employee parents

| Event | Original invoice lines | Split children | Employees |
|---|---:|---:|---|
| SIS-14 | 22,650.00 | 22,650.00 | 1001422, 1002169, 1001530 |
| CE-20-2026 | 19,000.00 | 19,000.00 | 1002075, 1001986 |
| LAB-16 | 11,373.94 | 11,373.94 | 1000862, 1002144, 1001059, 1000414, 1001256 |

Ticket `4860205136`, amount 950, now splits exactly:

- 1001422: 316.66
- 1002169: 316.67
- 1001530: 316.67
- Total: **950.00**

CE uses the required 75:25 ratio:

- 2,000 lines → 1,500 + 500
- 3,000 line → 2,250 + 750
- 10,000 line → 7,500 + 2,500

LAB uses five-way even allocation:

- 1,721.74 → 344.34 + four × 344.35
- Each 1,608.70 line → five × 321.74

Final target segments safely reflect the form evidence:

- CE: `160011 / 196 / 00000 / 10100`, with `SPONSORSHIP_SOLUTION_LABEL_REVIEW(IC)`
- LAB: `160012 / 000 / 00000 / 10111`, with review flags for Division `IVD` and Solution `IDS`
- No unsafe CE agency OCR guess remains.

### Changes

Files changed by this fix:

- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py)
- [tests/test_sponsor_allocation_rules.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py)
- Regenerated v30 and v30-SPLIT workbooks/output artifacts

Core changes:

- Canonical, case-insensitive event matching for year/order/hyphen variance, missing year, missing dash, and filename suffixes.
- Prefix-safe keys ensure SIS-14 never matches SIS-15.
- Event-form index and per-event allocation cache: every line in a resolved event receives the same form table.
- Duplicate form copies are tried until a readable allocation table is found.
- OCR fallback for scanned CE/LAB tables, with master-backed employee-name resolution.
- OCR amounts are used only when internally conserved; otherwise employee lists use even ratios.
- Exact/token-safe segment label matching prevents substring guesses such as `Vision` from `Division`.

### Regression checks

- Sponsorship/structural/travel tests: **33 passed**
- Final focused sponsorship suite: **25 passed**
- Python compilation: passed
- `git diff --check`: passed
- Employee-travel allocation multiset: unchanged versus the pre-fix workbook, excluding the intentionally relinked 950 SIS-14 sponsorship line.
- No remaining true no-form blank list: **empty**.

The worktree already contained earlier uncommitted sponsorship changes in other source files; they were preserved.
