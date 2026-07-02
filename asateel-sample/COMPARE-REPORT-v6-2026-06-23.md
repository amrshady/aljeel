# Asateel v5 Compare Report - 2026-06-20

Matched by invoice + distribution-line order, with amount within 0.01 as fallback. Amount split remains excluded from scored workbook mismatches per operator.

| Field | v4 hits | v4 rate | v5 hits | v5 rate | Delta hits |
|---|---:|---:|---:|---:|---:|
| Agency | 153/157 | 97.5% | 151/163 | 92.6% | -2 |
| CC | 148/157 | 94.3% | 155/163 | 95.1% | +7 |
| DIV | 148/157 | 94.3% | 155/163 | 95.1% | +7 |
| Solution | 138/157 | 87.9% | 138/163 | 84.7% | +0 |
| Additional Info | 5/157 | 3.2% | 125/163 | 76.7% | +120 |
| Full Combo | 130/157 | 82.8% | 135/163 | 82.8% | +5 |
| Amount | 36/157 | 22.9% | 133/163 | 81.6% | +97 |

- Generated v5 distribution rows: 188. Matched Finance side-by-side rows: 163.
- Location verification from v5 distribution segment[1] / column R equivalent: 188/188 = 100.0%.
- Existing scored fields unchanged from v4: NO.
- Side-by-side workbook: `/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-sidebyside-v6-2026-06-23.xlsx`.
- v5 workbook: `/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-oracle-CENTRAL-full-v6-2026-06-23.xlsx`.
