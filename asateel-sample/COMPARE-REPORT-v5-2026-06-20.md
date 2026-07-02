# Asateel v5 Compare Report - 2026-06-20

Matched by invoice + distribution-line order, with amount within 0.01 as fallback. Amount split remains excluded from scored workbook mismatches per operator.

| Field | v4 hits | v4 rate | v5 hits | v5 rate | Delta hits |
|---|---:|---:|---:|---:|---:|
| Agency | 153/157 | 97.5% | 153/157 | 97.5% | +0 |
| CC | 148/157 | 94.3% | 148/157 | 94.3% | +0 |
| DIV | 148/157 | 94.3% | 148/157 | 94.3% | +0 |
| Solution | 138/157 | 87.9% | 138/157 | 87.9% | +0 |
| Additional Info | 5/157 | 3.2% | 121/157 | 77.1% | +116 |
| Full Combo | 130/157 | 82.8% | 130/157 | 82.8% | +0 |
| Amount | 36/157 | 22.9% | 36/157 | 22.9% | +0 |

- Generated v5 distribution rows: 208. Matched Finance side-by-side rows: 157.
- Location verification from v5 distribution segment[1] / column R equivalent: 208/208 = 100.0%.
- Existing scored fields unchanged from v4: YES.
- Side-by-side workbook: `/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-sidebyside-v5-2026-06-20.xlsx`.
- v5 workbook: `/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-oracle-CENTRAL-full-v5-2026-06-20.xlsx`.
