Implemented and verified locally. No deploy, commit, or push occurred.

### Diff and files touched

Tracked diff:

```text
scripts/full_evidence_agent_v30.py |   3 +-
scripts/run_v16.py                 |  49 ++++-----
scripts/run_v30.py                 | 197 ++++++++++++++++++++-----------------
scripts/split_multi_emp.py         |   9 ++
4 files changed, 143 insertions(+), 115 deletions(-)
```

Added 264-line regression suite:

- [full_evidence_agent_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:564)
- [run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:617)
- [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:965)
- [split_multi_emp.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:268)
- [test_sponsor_allocation_rules.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:1)

All 10 requested changes are covered, including private exact-amount allocation metadata, recursive OPEX discovery, field-level fallback flags, SIS serials, final pre-write hardening, and defensive SPLIT behavior.

### J26-1029 verification

Regenerated through the normal v30/SPLIT path:

- [v30 workbook](/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-1029/output/Spreadsheet-J26-1029-FILLED-v30.xlsx)
- [v30 SPLIT workbook](/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-1029/output/Spreadsheet-J26-1029-FILLED-v30-SPLIT.xlsx)

| Metric | Before | After |
|---|---:|---:|
| Account `60307021` rows | 44 | 44 |
| Nonblank sponsorship Employee No | 33 | **0** |

Allocation results:

| Event | Before Agency / Solution | After |
|---|---|---|
| SIS-14-2026/27/28 | `10041 / 00000` | `10041 / 10002` from form |
| CRM-2026-31/32/38 | `10072 / 10017` | Preserved |
| EP-2026-20/change | `10072 / 10064` | Preserved |

The batch is not globally collapsed: SIS, CRM, and EP retain their respective allocation combinations. The multi-agency single-event regression fixture also confirms different lines retain different agencies/solutions when the form supplies them.

True SIS-15 employee-travel rows 84–85 remained unchanged. Across 82 employee-attributed non-sponsorship rows, 81 retained identical Oracle core fields. Row 59 changed from account/solution `21070229/00000` to `60301003/10017` during regeneration; Employee No and agency stayed `1001762/10072`. This row should be reviewed before release.

### Tests and QC

- Sponsor regressions: **12 passed**
- Python compilation: passed
- `git diff --check`: passed
- Unsplit sponsorship QC: **129 rows, 44 sponsorship, 0 nonblank Employee No**
- SPLIT sponsorship QC: **129 rows, 44 sponsorship, 0 nonblank Employee No**
- Jawal golden gate ran but failed on pre-existing J26-788 artifact drift; it does not exercise the current live J26-1029 pipeline.

### Human review flags

- Cost Center fallback review: rows 23–27, 42, 45, 47, 54, 55, 60, 65–68, 107, 112, 113, 115, 116.
- Cost Center/DIV/Solution fallback review: rows 92–95, 128.
- Agency-derived deterministic fallbacks are separately flagged on rows 15–18, 38–41, 43, 56–58, 61–64, 109, 127, 132.
- Existing unrelated QC item: row 121 Location `40100` differs from Distribution Combination location `10100`.
- Review regenerated employee-travel row 59 as noted above.

Existing unrelated workspace changes were preserved.
