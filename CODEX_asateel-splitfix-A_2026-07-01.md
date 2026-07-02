Implemented and did not deploy.

**Files Touched**
- [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:988)
- [pipelines/asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:309)

**Change Summary**
- Split SO_Detail rows now inherit supplier-sheet `Cost Center`, `Cost Name`, `DIV`, `Contribution`, and `Solution`.
- SO_Detail still supplies only per-split `Agency` code/name and `Salesperson`.
- Split rows are no longer forced YELLOW solely because they are split; unresolved agencies/discrepancies still force YELLOW.
- `pipelines/asateel.py` no longer applies SO_Detail by default on the golden no-`--pdf-dir` command; batch-15 still uses SO_Detail because it is explicitly passed.

**Validation**
- Passed: `python3 -m py_compile asateel-sample/asateel_poc.py pipelines/asateel.py`

**Batch-15 Before / After**
Before patch:
- Rows: `106`
- GREEN/YELLOW/RED: `32/62/12`
- Split methods: `per_jq:67`, `per_jq_agency_even:37`, `n/a:2`
- Blank Cost Center rows: `36`

After patch:
- Rows: `106`
- GREEN/YELLOW/RED: `34/60/12`
- Split methods: `per_jq:67`, `per_jq_agency_even:37`, `n/a:2`
- Blank Cost Center rows: `1`

**Concrete Verification**
Invoice `03940`, JQ `JQ-26125743`, split method `per_jq_agency_even`:
- Line `1.1`: agency `10010 Euronda`, salesperson `1000502-Moayyad Shihab`, CC `160013`, DIV `192`, Contribution `Dental & Medical Solutions`, Solution `00000 General`
- Line `1.2`: agency `10162 Dental Farm`, salesperson `1000502-Moayyad Shihab`, CC `160013`, DIV `192`, Contribution `Dental & Medical Solutions`, Solution `00000 General`

All 10 split rows for that JQ now carry the same supplier allocation block while agency differs by SO_Detail.

Remaining blank:
- Only `invoice 03948`, `JQ-26124750`, agency `00000/General`, status `YELLOW`; this is a genuinely unresolved SO_Detail agency case.

**Golden CENTRAL**
Ran exact command: `python3 pipelines/asateel.py --folder CENTRAL --full`

Result:
- Rows: `188`
- Split methods: `per_jq:175`, `even:6`, `per_line:4`, `n/a:3`
- Blank Cost Center rows: `6`
- GREEN/YELLOW/RED: `7/181/0`

The row count, split methods, and blank count match the stated golden shape, but the status mix in this workspace did not match the requested `7/175/6`; it produced no RED rows.
