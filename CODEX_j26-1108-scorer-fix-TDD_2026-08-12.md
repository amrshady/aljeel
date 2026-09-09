Implemented the scorer-only TDD fix. No deployment, artifact regeneration, pipeline edits, truth edits, or golden JSON changes occurred.

### Step 1 — failing tests first

Added [test_score_against_truth_sponsorship_fallback.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_score_against_truth_sponsorship_fallback.py).

Initial result:

```text
FFF                                                                      [100%]

1) Serial spelling variant:
   assert len(pairing.pairs) == 1
   AssertionError: assert 2 == 1

   Produced an unmatched sponsorship truth and an incorrect
   travel|26-998 pipeline orphan.

2) N:1 sponsorship fallback:
   assert scored["sponsorship"]["n"] == 3
   AssertionError: assert 0 == 3

3) Spacer-column discovery:
   ValueError: Unexpected j26-1108 column indices:
   {'amount': (13, 14), 'emp_no': (16, 17)}

3 failed in 0.41s
```

These failures reproduced the requested defects.

### Step 2 — scorer changes

Changed only:

- [score_against_truth.py](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py)
- [jawal_j26_1108_golden_check.py](/home/clawdbot/.openclaw/workspace/aljeel/qc/jawal_j26_1108_golden_check.py)
- New test module above

Key changes:

- Pipeline sponsorship classification now uses parsed account `60307021`, independently of truth-key membership.
- Event serials compare punctuation/spacing-insensitively, so `HF2026-28`, `HF-2026-28`, and `HF 2026 28` normalize consistently.
- Exact sponsorship pairing remains first.
- Unmatched sponsorship rows fall back deterministically to `26-NNN`/ticket identifiers.
- Invoice reference and normalized description disambiguate identifiers with multiple candidate groups.
- Unresolved ambiguity is rejected and exposed through `ambiguous_group_details`.
- N:1 employee-allocation multiplicity is preserved.
- `discover_columns()` remains normalized-header-driven with required-header, ambiguity, worksheet, and header-row validation, but no longer asserts fixed positions.
- Coverage now uses `logical_virtual_evaluated + unmatched_truth_physical_rows`, rather than adding logical-group count.

`git diff --check` passed.

### Step 3 — verification

New tests:

```text
....                                                                     [100%]
4 passed in 0.41s
```

Compilation also passed for both modified scorer files.

The older adjacent test module has one pre-existing stale assertion expecting `columns["distribution"]`; the scorer already returns `columns["combo"]`. I did not alter that test because the rename is explicitly a pending baseline/schema update.

### Read-only J26-1108 gate output

```text
+ primary artifact semantic gate: batches/jawal-J26-1108/output/Spreadsheet-J26-1108-FILLED-v30.xlsx
J26-1108 GOLDEN DRIFT
structure.truth_sponsorship_rows: required=19 actual=33
structure.truth_sponsorship_employee_coverage: required=19 actual=33
account_breakout.: expected={"evaluated": 25, "full5": 7, "full5_emp": 4} actual=null
account_breakout.60301003.evaluated: expected=53 actual=57
account_breakout.60301003.full5: expected=53 actual=44
account_breakout.60301003.full5_emp: expected=28 actual=23
account_breakout.60301004.evaluated: expected=3 actual=8
account_breakout.60301004.full5: expected=3 actual=7
account_breakout.60301004.full5_emp: expected=3 actual=7
account_breakout.60307021.evaluated: expected=19 actual=31
account_breakout.60307021.full5: expected=19 actual=30
account_breakout.60307021.full5_emp: expected=16 actual=30
account_breakout.60308009: expected=null actual={"evaluated": 2, "full5": 0, "full5_emp": 0}
all_5: expected=83 actual=82
all_5_plus_employee: expected=52 actual=61
end_to_end.full5: expected=83 actual=82
end_to_end.full5_emp: expected=52 actual=61
logical_virtual_evaluated: expected=102 actual=100
off_by_1.account: expected=1 actual=3
off_by_1.agency: expected=null actual=2
off_by_1.emp_no: expected=31 actual=21
pairing_integrity.ambiguous_group_details: expected=null actual=[]
pairing_integrity.amount_sum_mismatches: expected=0 actual=6
pairing_integrity.direct_1_to_1_pairs: expected=76 actual=65
pairing_integrity.extra_employees: expected=0 actual=2
pairing_integrity.multiplicity_groups.1:1: expected=79 actual=77
pairing_integrity.pairing_methods.direct: expected=75 actual=64
pairing_integrity.pairing_methods.missing-employee: expected=3 actual=1
pairing_integrity.pairing_methods.shared-pipeline: expected=7 actual=4
pairing_integrity.pairing_methods.stable-identifier: expected=null actual=12
pairing_integrity.pairing_methods.virtual-employee: expected=16 actual=18
pairing_integrity.unmatched_truth_physical_rows: expected=null actual=2
pairing_integrity.virtual_sponsorship_allocations: expected=16 actual=32
per_field.account.match: expected=83 actual=92
per_field.account.mismatch: expected=19 actual=8
per_field.agency.match: expected=84 actual=85
per_field.agency.mismatch: expected=18 actual=15
per_field.cc.match: expected=84 actual=92
per_field.cc.mismatch: expected=18 actual=8
per_field.div.match: expected=84 actual=92
per_field.div.mismatch: expected=18 actual=8
per_field.emp_no.match: expected=69 actual=68
per_field.emp_no.mismatch: expected=33 actual=32
per_field.solution.match: expected=84 actual=96
per_field.solution.mismatch: expected=18 actual=4
pipeline_only_logical_groups: expected=[] actual=["travel|4860576027", "travel|4860576079"]
pipeline_sha256: expected="fce2ac2a23edc0d8f350a3fafe89de2490845f54fe6f6c0e7f1b938ede38c182" actual="04ce0fa94d0f74e904b18712cc96f01a867e2c773f0f53ecd1f8e5589dba124f"
sponsorship.all_5: expected=19 actual=30
sponsorship.all_5_plus_employee: expected=16 actual=30
sponsorship.evaluated: expected=19 actual=31
sponsorship.per_field.account.match: expected=19 actual=31
sponsorship.per_field.agency.match: expected=19 actual=30
sponsorship.per_field.agency.mismatch: expected=0 actual=1
sponsorship.per_field.cc.match: expected=19 actual=30
sponsorship.per_field.cc.mismatch: expected=0 actual=1
sponsorship.per_field.div.match: expected=19 actual=30
sponsorship.per_field.div.mismatch: expected=0 actual=1
sponsorship.per_field.emp_no.match: expected=16 actual=30
sponsorship.per_field.emp_no.mismatch: expected=3 actual=1
sponsorship.per_field.solution.match: expected=19 actual=30
sponsorship.per_field.solution.mismatch: expected=0 actual=1
structure.pipeline_columns.combo: expected=null actual=14
structure.pipeline_columns.distribution: expected=14 actual=null
structure.truth_columns.combo: expected=null actual=15
structure.truth_columns.distribution: expected=15 actual=null
structure.truth_sponsorship_employee_coverage: expected=19 actual=33
structure.truth_sponsorship_rows: expected=19 actual=33
travel.all_5: expected=64 actual=52
travel.all_5_plus_employee: expected=36 actual=31
travel.evaluated: expected=83 actual=69
travel.per_field.account.match: expected=64 actual=61
travel.per_field.account.mismatch: expected=19 actual=8
travel.per_field.agency.match: expected=65 actual=55
travel.per_field.agency.mismatch: expected=18 actual=14
travel.per_field.cc.match: expected=65 actual=62
travel.per_field.cc.mismatch: expected=18 actual=7
travel.per_field.div.match: expected=65 actual=62
travel.per_field.div.mismatch: expected=18 actual=7
travel.per_field.emp_no.match: expected=53 actual=38
travel.per_field.emp_no.mismatch: expected=30 actual=31
travel.per_field.solution.match: expected=65 actual=66
travel.per_field.solution.mismatch: expected=18 actual=3
truth_only_logical_groups: expected=[] actual=["sponsorship|crm202642|alsobeihy rawa ms jed ist beg ist jed 4860576079|crm-2026-42", "sponsorship|na|alhussein mosaad mr ruh tuu ruh 4860576027|hf-2026-28"]
```

### Three-way categorization

Resolved scorer drift:

- The false `truth rows silently skipped` error is gone.
- Coverage is now honest: `100 evaluated + 2 unmatched physical truth rows = 102`.
- The ten bogus `travel|26-NNN` sponsorship orphans are gone.
- Twelve rows were recovered through `stable-identifier` pairing.
- `26-998` allocation multiplicity is preserved.
- No ambiguous groups exist in the current artifact.

Pending re-baseline/schema items:

- `distribution` → `combo`.
- Truth sponsorship and employee coverage `19` → `33`.
- New pairing diagnostic fields and corrected aggregate denominators.
- Artifact hash change remains review-required.

Genuine pipeline mismatches still visible:

- Tickets `4860576027` and `4860576079` remain paired across sponsorship-truth/travel-pipeline orphan lists because their pipeline account is not `60307021`—the intended honest signal for truth rows 28 and 60.
- Truth row 104 remains paired and mismatches CC, division, solution, agency, and employee.
- Both `60308009` truth rows remain visible with zero full-5 matches.
- The CE Description/OPEX-prefix inconsistency remains untouched; the existing scorer tolerance continues to permit pairing.

No expected JSON or workbook artifact was modified.

[status: done rc=0]
