Implemented the corrected allocation-table behavior, but J26-1029 does not fully satisfy the requested acceptance criteria because the batch has no SIS-15 sponsorship parent row.

Changes made:

- Removed all sponsorship Employee No blanking invariants.
- `resolve_sponsorship_from_master()` now retains the provisional requester until allocation extraction.
- Parses complete `(employee_no, name, exact amount)` tuples.
- Persists tuples in `OPEX Allocation Details` for the separate SPLIT process.
- SPLIT uses exact form amounts, never equal division for sponsorship.
- Preserves event CC/DIV/Solution/Agency on split rows.
- Missing/incomplete allocation tables produce blank Employee No plus a human-review flag.
- Preserved recursive OPEX discovery and SIS serial recognition.
- Prevented short label `GI` from being guessed as `Imaging`.
- Restored non-sponsorship rows that temporarily received sponsorship allocation metadata.
- Fixed an `openpyxl` row-loss issue caused by zero-row insertion for single-employee allocations.

Files changed:

- [run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py)
- [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py)
- [split_multi_emp.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py)
- [full_evidence_agent_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py)
- [test_sponsor_allocation_rules.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py)

Tracked sponsorship diff: 311 insertions, 131 deletions, plus the new 181-line regression file. Unrelated workspace changes were preserved.

Verification:

- Regression tests: **18 passed**
- Compilation: passed
- `git diff --check`: passed
- Final SPLIT: **129 input rows → 155 output rows**
- Sponsorship allocation parents validated: **33**
- Exact tuple mismatches: **0**
- Sponsorship output: 71 rows; 59 allocated, 12 review-flagged
- CRM/EP forms use exact form amounts and employees, including CRM amounts 48,500 / 46,500 / 150,500 and EP amounts 17,000 / 45,000.
- No equal division occurred for sponsorship rows.

SIS-15 finding:

- The MOVIVA PDF extractor correctly returns:

  - `1001422 / Wasseem Mustafa / 24,000`
  - `1002169 / Abdallah Amoudi / 24,000`
  - `1001530 / Belal Ahmed / 24,000`

- Deterministic segment resolution gives CC `160011`, DIV `130` (SIS), Agency `10043` (ERBE), with Solution `GI` unresolved directly and therefore filled only through the consistent ERBE master fallback as `00000`.
- However, J26-1029 contains only two SIS-15 accounting rows. Both settle as employee travel under `1000986`, amounts `18,000` and `6,500`, account `60301003`. There is no SIS-15 sponsorship parent row to transform into the requested three rows.
- Consequently, acceptance item (a) is **not present in the regenerated workbook**, although the real PDF extraction and exact three-row splitter fixture pass.

Human-review rows in the final SPLIT workbook:

- LAB-16-2026: rows 76–78 and 81–84.
- CE-20-2026 / parsed serial CE-202-26: rows 112–115 and 152.

These have blank Employee No and `SPONSORSHIP_ALLOCATION_*_REVIEW` flags.

Non-sponsorship comparison found one unrelated rerun drift: source row 59 changed account/solution during the fresh LLM run. All other non-sponsorship core allocations matched the pre-change v30 workbook.

No deploy, commit, or push was performed.
