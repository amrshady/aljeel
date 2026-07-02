Implemented the 5 refinements in [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py). I did not touch `pipelines/`, `scripts/`, or deployed portal code, and did not deploy.

Full CENTRAL run completed with:

```bash
python3 asateel-sample/asateel_poc.py --folder CENTRAL --full --out-suffix CENTRAL-full-v2
```

Key results:
- 03317 captured all 3 lines:
  - 550.00, `م/ المراكز الاولية`, Fujifilm, `1001687 | JQ-26112318`
  - 200.00, `م/ الوطنية للرعاية`, Solventum via supplier fill, `1002030 | JQ-26113970`
  - 200.00, `م/ دلة`, Fluke, `1002031 | JQ-26113215`
- Multi-line invoices: `56`
- Total distribution rows: `208`
- GREEN/YELLOW/RED: `150/58/0`
- Brand remap hits: `3M->Solvento=3`, `Biofire->BMX=1`, `Biomerieux->BMX=1`
- Supplier Expenses Format matches: `154/208`
- Supplier allocations filled/corroborated: `27/4`
- Additional Info emp_no+JQ coverage: `147/208`
- Location `20100`: `208/208`
- A..AF header still matches Jawal reference exactly.
- Sum col E dedup invoice totals: `145,739.50`
- Sum col M excl-VAT amounts: `126,730.02`; VAT-inclusive check is within rounding (`126,730.02 * 1.15 = 145,739.52`).

Outputs:
- [asateel-poc-oracle-CENTRAL-full-v2-2026-06-20.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-oracle-CENTRAL-full-v2-2026-06-20.xlsx)
- [asateel-poc-trace-CENTRAL-full-v2-2026-06-20.json](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-trace-CENTRAL-full-v2-2026-06-20.json)
