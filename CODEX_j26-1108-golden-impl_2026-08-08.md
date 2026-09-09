Implemented the J26-1108 semantic golden gate on `account-fixes-groupA` without invoking the pipeline, APIs, deployment, or committing changes.

Key results:

- J26-1108: 102 truth rows, 90 pipeline rows, 102 logical evaluations.
- All-five exact: 83/102.
- All-five plus employee: 52/102.
- Sponsorship: 19 rows; 16 employee matches and the expected 3 missing employees.
- No unmatched truth groups, ambiguous groups, extra sponsorship employees, or amount-sum mismatches.
- J26-640 compatibility: all 117 truth rows load and pair.
- J26-788 artifact-summary gate remains intact and passes.

Files touched:

- [qc/score_against_truth.py](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py) — refactored; +647/−455.
- [qc/jawal_j26_1108_golden_check.py](/home/clawdbot/.openclaw/workspace/aljeel/qc/jawal_j26_1108_golden_check.py) — new, 136 lines.
- [qc/jawal_j26_1108_golden_expected.json](/home/clawdbot/.openclaw/workspace/aljeel/qc/jawal_j26_1108_golden_expected.json) — new reviewed snapshot, 79 lines.
- [tests/test_score_against_truth_j26_1108.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_score_against_truth_j26_1108.py) — new, 124 lines and 12 focused tests.
- [PROCESS/run_jawal_batch.sh](/home/clawdbot/.openclaw/workspace/aljeel/PROCESS/run_jawal_batch.sh) — +10/−1; J26-1108 primary, J26-640 secondary, J26-788 retained.

Validation:

- New focused tests: `12 passed`.
- J26-1108 golden gate: passed.
- J26-788 artifact-summary gate: passed.
- Python compilation, JSON validation, shell syntax, and `git diff --check`: passed.
- Broader `tests/`: 84 passed, 3 pre-existing/unrelated failures involving Asateel lookup ordering, Asateel region validation, and a sponsorship PDF fixture.
- `qc/tests` could not collect because its existing import setup cannot locate `cost_center_resolver`.

No user-owned unrelated changes were modified. No commit or deployment was performed.
