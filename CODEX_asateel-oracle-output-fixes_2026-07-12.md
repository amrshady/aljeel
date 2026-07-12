Implemented all five changes in [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py):

- Sequential identifiers per unique invoice; split rows share the identifier.
- Invoice amount and date appear only on the invoice’s first row.
- Invoice dates render as `MM/DD/YYYY` with Excel format `mm/dd/yyyy`.
- Canonical JQs remain unchanged for matching.
- Additional Information uses native `SO_Detail.ORDER_NUMBER` spelling, falling back to the canonical/extracted JQ when unavailable.

Assumption: `SO_Detail.ORDER_NUMBER` is authoritative for JQ display. Verified examples:

- `JQ-260004279` → `260004279`
- `JQ-26110849` → `JQ-26110849`

Validation:

- `git diff --check`: passed
- Python compilation: passed
- Native-JQ assertions: passed
- `python3 qc/asateel_golden_check.py`: **`GOLDEN OK`**
- Diff: 1 tracked file changed, 43 insertions and 6 deletions.

No deployment was performed. Unrelated untracked workspace files were left untouched.
