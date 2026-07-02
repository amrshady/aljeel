Implemented and verified v5.

Changed [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py) only for Part A: `Additional Information` now emits `empno.JQ`, trimming both pieces and falling back to a single available value when needed.

Generated outputs:
- v5 workbook: [asateel-poc-oracle-CENTRAL-full-v5-2026-06-20.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-oracle-CENTRAL-full-v5-2026-06-20.xlsx)
- v5 trace: [asateel-poc-trace-CENTRAL-full-v5-2026-06-20.json](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-trace-CENTRAL-full-v5-2026-06-20.json)
- side-by-side script: [build_sidebyside_v5.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/build_sidebyside_v5.py)
- side-by-side workbook: [asateel-sidebyside-v5-2026-06-20.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-sidebyside-v5-2026-06-20.xlsx)
- compare report: [COMPARE-REPORT-v5-2026-06-20.md](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/COMPARE-REPORT-v5-2026-06-20.md)

Key verification:
- `03041`: ours matches Finance as `1001017.JQ-26111081`, `1000699.JQ-26110785`
- `03317`: ours matches Finance as `1001687.JQ-26112318`, `1002030.JQ-26113970`, `1002031.JQ-26113215`
- New Additional Info match rate: `121/157 = 77.1%`
- Agency/CC/DIV/Solution/full-combo unchanged from v4: yes
- Location verified correctly over all generated rows: `208/208`
- Side-by-side data rows: `157`; Differences Only data rows: `49`; Summary rows: `15`

No deploy performed. I did not edit `pipelines/`, `scripts/`, or deployed code.
