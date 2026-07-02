Implemented v3 fixes in [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py). No deploy, no changes to `pipelines/`, `scripts/`, or portal code.

Run completed for full CENTRAL using cache.

Outputs:
- [asateel-poc-oracle-CENTRAL-full-v3-2026-06-20.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-oracle-CENTRAL-full-v3-2026-06-20.xlsx)
- [asateel-poc-trace-CENTRAL-full-v3-2026-06-20.json](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-trace-CENTRAL-full-v3-2026-06-20.json)
- [COMPARE-REPORT-v3-2026-06-20.md](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/COMPARE-REPORT-v3-2026-06-20.md)

03317 smoke:
- Line 1: `manpower_empno`, Agency `10043`, CC `160011`, DIV `196`, Solution `10008` MII.
- Line 2: `manpower_empno`, Agency `10202`, CC `160013`, DIV fixed to `192`, Solution `10054`.
- Line 3: `manpower_empno`, Agency `10156`, CC `160011`, DIV `196`, Solution `10054`.

Exact v2-style re-score vs finance answer key, matched lines `157`:
- Agency: `123/157 = 78.3%`, v2 `64.3%`, delta `+14.0 pp`
- CC: `148/157 = 94.3%`, v2 `68.2%`, delta `+26.1 pp`
- DIV: `148/157 = 94.3%`, v2 `54.1%`, delta `+40.2 pp`
- Full combo: `110/157 = 70.1%`, v2 `7.0%`, delta `+63.1 pp`
- Amount: `36/157 = 22.9%`, v2 `22.9%`, delta `+0.0 pp`

Other checks:
- Allocation source distribution across all 208 POC rows: `brand=50`, `manpower_empno=147`, `salesperson=7`, `supplier_expenses_format=4`.
- Per-source matched-line hit rates are in the compare report; `manpower_empno` scored CC/DIV `96.6%`.
- `Need to allocate` / charge-to RED rows: `13`.
- Solution resolved: `149/208 = 71.6%`; answer-key Solution hit: `138/157 = 87.9%`.
- Location `20100`: `208/208 = 100%`.
- Header A..AF: intact, no diffs against Jawal reference.
