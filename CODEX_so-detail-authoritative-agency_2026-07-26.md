Implemented the SO_Detail-authoritative agency change without deploying.

Key results:

- SO_Detail now supplies Agency through canonical JQ for every Asateel batch.
- Standalone Agency and Distribution Combination segment 7 are rebuilt together.
- Missing, blank/`00000`, or conflicting agencies produce `AGENCY_UNRESOLVED`, no supplier fallback, and a fully RED workbook row.
- One SO_Detail index now supplies both Agency and SPERSON.
- CC, DIV, Solution, employee/remap, BMX P&T gate, and split logic remain unchanged.
- Hard segment-7 invariant passes for all 185 rows.
- Golden checks and fixtures were not modified.

Golden comparison:

- Rows: 185 → 185
- Reconciliation: 92/0 → 92/0
- Statuses: 3/182/0 → 0/129/56 GREEN/YELLOW/RED
- `HOME_AGENCY_DISCREPANCY`: 34 → 30
- Agency values changed: 63
  - 10 changed to valid SO_Detail agencies
  - 53 changed to `00000` because SO_Detail was unresolved
- Rows flagged RED: 56
- Non-agency field changes: 0

`python3 qc/asateel_golden_check.py` ran completely but returned `GOLDEN DRIFT` because the existing baseline expects no RED rows. It requires human re-blessing by Ahmed if these authoritative results are accepted.

Files:

- [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1272)
- [asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:220)
- [Implementation report](/home/clawdbot/.openclaw/workspace/aljeel/REPORT_so-detail-authoritative-agency_2026-07-26.md:1)

Focused legacy project tests have four expected failures because they still assert supplier/project agency fallback without supplying SO_Detail. A fifth failure comes from the pre-existing modified Labadi lookup. No deployment was performed.

[status: done rc=0]
