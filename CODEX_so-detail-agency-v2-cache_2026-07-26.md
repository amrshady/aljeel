Implemented the SO_Detail Agency v2 resolution matrix and SHA-keyed cache without deploying.

Key results:

- Agency resolution: 144 SO_Detail clean, 21 supplier conflict fallbacks, 1 supplier blank fallback, 19 missing-JQ supplier fallbacks marked fully red.
- Agency changed from supplier on 10 rows.
- `HOME_AGENCY_DISCREPANCY`: 34 before, 41 exception catches after.
- All 185 rows satisfy Distribution Combination segment 7 == standalone Agency.
- Cold parse: 12.071s; cached load: 0.240s (~50× faster).
- Corrupt-cache rebuild test passed.
- Standing workbook installed at the configured reference path with SHA-256 `d7fadda090d9f8b4054edc265166a52780afeb927c26c79755d9850c2b6ecf46`.
- CC, DIV, Solution, employee, split, and BMX P&T remap behavior were left unchanged.

Mandatory golden check ran to completion but reported expected drift:

- Before: GREEN/YELLOW/RED `3/182/0`
- After: `0/166/19`
- Rows and reconciliation remain `185` and `92/0`.
- Golden fixtures/checks were not edited. The baseline needs human re-blessing by Ahmed.

Full implementation and before/after details: [REPORT_so-detail-agency-v2-cache_2026-07-26.md](/home/clawdbot/.openclaw/workspace/aljeel/REPORT_so-detail-agency-v2-cache_2026-07-26.md).

[status: done rc=0]
