Implemented routing/safety changes only. No deployment performed.

Key changes:

- `Sheet1` now contains only confidently supported rows in line mode.
- Added an `Exceptions` sheet and mirrored exception records in reconciliation JSON.
- Surfaced statuses: `matched`, `unmatched_sales`, `unmatched_pod`, `excluded_nonchargeback_line`, and `trx_fallback`.
- Added strict default behavior: fallback-required runs exit non-zero.
- Added `--allow-fallback` to complete with fallback rows clearly labeled in `Exceptions`.
- Freight/delivery lines are excluded without invalidating strong matches.
- Matcher scoring and catalog mapping were not changed.
- Default TRX mode remains unchanged at 90 rows.

Cached Wave 2 smoke:

- Supported rows: 36
- Exception records: 71
  - `unmatched_sales`: 40
  - `unmatched_pod`: 15
  - `trx_fallback`: 14 Sales rows
  - `excluded_nonchargeback_line`: 2
- Reviewed exception Sales rows across the 14 fallback-required TRXs: 50
- Clerk-parity union: 36 supported + 50 reviewed = 86
- Focal TRX `2600015875`: all 6 expected rows remain supported.
- Strict mode: exit 1, naming exactly 14 fallback-required TRXs.
- `--allow-fallback`: exit 0, exceptions remain labeled and outside the claimable sheet.

Tests:

- Solventum suite: 21 passed
- Full suite: 134 passed, 5 known unrelated failures
- `py_compile` and `git diff --check`: passed

Files touched:

- [scripts/solventum_chargeback.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/solventum_chargeback.py:573)
- [tests/test_solventum_chargeback_line.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_solventum_chargeback_line.py:183)

Diff summary for the working tree shows the pipeline as `823 insertions, 51 deletions`; that includes pre-existing uncommitted Solventum implementation. The test file was already untracked when this task began, so Git does not provide a standalone stat for it. No other files were edited by this task.
