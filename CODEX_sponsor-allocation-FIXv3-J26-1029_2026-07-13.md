Implemented and verified locally. No deploy, commit, or push.

### Result

The regenerated [Spreadsheet-J26-1029-FILLED-v30-SPLIT.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-1029/output/Spreadsheet-J26-1029-FILLED-v30-SPLIT.xlsx) now has:

- MOVIVA/SIS-15: `1001422 / 1002169 / 1001530`, each exactly `24,000`
- Segments: account `60307021`, CC `160011`, DIV `130` (SIS), Agency `10043` (ERBE)
- Six MOVIVA parent expenses produced 18 split rows, all carrying the exact trio and amounts.
- SIS-14 uses its own form: the same employees at exactly `10,000` each, Agency `10041` (Fujifilm)—never MOVIVA’s 24,000/ERBE allocation.
- All MOVIVA descriptions and OPEX serials are stamped `SIS-15-2026`.
- The mixed-event hotel row remains blank and review-flagged instead of receiving either event allocation.

The literal SIS-15 ALSHAHRANI travel rows remain unchanged:

- `18,000`: account `60301003`, employee `1000986`
- `6,500`: account `60301003`, employee `1000986`

All 75 employee-travel rows retained identical employee, amount, account, CC, DIV, Solution, and Agency values versus the automatic pre-run backup.

### CRM/EP verification

- CRM-2026-31: `1001762 / 48,500`
- CRM-2026-32: `1001762 / 46,500`
- CRM-2026-38: `1001762 / 150,500`
- EP-2026-19: `1000433 / 17,000`
- EP-2026-20: `1000433 / 45,000`

Every matching expense row uses its own form’s exact amount.

### Review flags

Thirteen sponsorship rows lack a readable allocation table and therefore have blank Employee No plus `SPONSORSHIP_ALLOCATION_TABLE_REVIEW`:

- LAB: output rows 76–78 and 81–84
- CE: rows 112–115 and 150
- Mixed SIS-14/SIS-15 hotel row: row 129

`SPONSORSHIP_REF_FOLDER_MISMATCH` appears on 34 split rows where the invoice ref conflicts with the evidence folder.

The lookup master resolves ERBE=`10043` and SIS=`130`, but contains no deterministic exact mapping for solution label `GI`. It was not guessed as Imaging; affected rows carry `SPONSORSHIP_SOLUTION_LABEL_REVIEW(GI)`. Workbook normalization emits `00000`.

### Diff

Source changes:

- [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:679)
- [run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:615)
- [split_multi_emp.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:166)
- [full_evidence_agent_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:564)
- [test_sponsor_allocation_rules.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:1)

Tracked diff: 532 insertions, 143 deletions. New regression suite: 259 lines.

Key changes include recursive folder-owned OPEX discovery, exact tuple persistence, prefix-safe fallback, ambiguity rejection, stale-allocation protection, exact form-segment preservation, and removal of sponsorship Employee No blanking invariants.

### Verification

- Sponsorship regressions: **17 passed**
- Compilation: passed
- `git diff --check`: passed
- Normal v30 run: **129 rows**, completed
- SPLIT: **129 input → 153 output rows**
- Unexpected allocated sponsorship amounts: **0**
- Employee-travel core differences: **0 of 75**
- No deployment, commit, or push performed.
