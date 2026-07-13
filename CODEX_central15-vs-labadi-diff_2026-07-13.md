# Central-15 Oracle upload reconciliation

## Headline

- Finance truth allocation lines: **112** (Entry-1 + Entry-2)
- Our allocation lines: **112**
- Matched lines: **112**
- Unmatched in ours: **0**
- Unmatched in finance: **0**
- Lines matching all seven compared segment fields: **106 / 112 (94.64%)**
- Discrepancy lines: **9**; individual discrepancy items: **17**

The overall percentage uses all finance allocation lines as the denominator. The matched-line all-segment rate is **106 / 112 (94.64%)**. Amounts use a SAR 0.01 tolerance; codes are compared after numeric zero normalization.

## Per-field agreement (matched lines)

| Field | Agreement | Mismatches | Agreement % |
|---|---:|---:|---:|
| Account | 112 / 112 | 0 | 100.00% |
| Cost Center | 111 / 112 | 1 | 99.11% |
| DIV | 111 / 112 | 1 | 99.11% |
| Agency | 107 / 112 | 5 | 95.54% |
| Solution | 111 / 112 | 1 | 99.11% |
| Project | 112 / 112 | 0 | 100.00% |
| Distribution Combination | 106 / 112 | 6 | 94.64% |

## Cause breakdown

Cause buckets count discrepancy rows, so each compared line has one primary cause.

| Likely cause | Lines | Example(s) |
|---|---:|---|
| Agency resolution differs | 4 | 03940 / JQ-26125743, 03940 / JQ-26125743, 03941 / JQ-26125743 |
| Order/JQ reference differs (amount fallback used) | 3 | 03928 / JQ-26122841, 03936 / JQ-none, 03982 / JQ-26126799 |
| Multiple segment resolutions differ | 1 | 03948 / JQ-26124750 |
| Solution resolution differs | 1 | 03936 / JQ-26123819 |

## Every discrepancy item

| Invoice | OURS JQ | FINANCE JQ | Field | OURS value | FINANCE value | Cause |
|---|---|---|---|---|---|---|
| 03928 | 26122481 | 26122841 | JQ Reference | 26122481 | 26122841 | Order/JQ reference differs (amount fallback used) |
| 03936 | 250014564 |  | JQ Reference | 250014564 |  | Order/JQ reference differs (amount fallback used) |
| 03936 | 26123819 | 26123819 | Solution | 10064 | 10017 | Solution resolution differs |
| 03936 | 26123819 | 26123819 | Distribution Combination | 03-20100-61500027-160014-170-10064-10072-00000-00-000000 | 03-20100-61500027-160014-170-10017-10072-00000-00-000000 | Solution resolution differs |
| 03940 | 26125743 | 26125743 | Agency | 99999 | 10009 | Agency resolution differs |
| 03940 | 26125743 | 26125743 | Distribution Combination | 03-20100-61500027-160013-192-00000-99999-00000-00-000000 | 03-20100-61500027-160013-192-00000-10009-00000-00-000000 | Agency resolution differs |
| 03940 | 26125743 | 26125743 | Agency | 00000 | 10009 | Agency resolution differs |
| 03940 | 26125743 | 26125743 | Distribution Combination | 03-20100-61500027-160013-192-00000-00000-00000-00-000000 | 03-20100-61500027-160013-192-00000-10009-00000-00-000000 | Agency resolution differs |
| 03941 | 26125743 | 26125743 | Agency | 00000 | 10009 | Agency resolution differs |
| 03941 | 26125743 | 26125743 | Distribution Combination | 03-20100-61500027-160013-192-00000-00000-00000-00-000000 | 03-20100-61500027-160013-192-00000-10009-00000-00-000000 | Agency resolution differs |
| 03942 | 26125743 | 26125743 | Agency | 00000 | 10009 | Agency resolution differs |
| 03942 | 26125743 | 26125743 | Distribution Combination | 03-20100-61500027-160013-192-00000-00000-00000-00-000000 | 03-20100-61500027-160013-192-00000-10009-00000-00-000000 | Agency resolution differs |
| 03948 | 26124750 | 26124750 | Cost Center |  | 160012 | Multiple segment resolutions differ |
| 03948 | 26124750 | 26124750 | DIV |  | 194 | Multiple segment resolutions differ |
| 03948 | 26124750 | 26124750 | Agency | 00000 | 10113 | Multiple segment resolutions differ |
| 03948 | 26124750 | 26124750 | Distribution Combination | 03-20100-61500027---00000-00000-00000-00-000000 | 03-20100-61500027-160012-194-00000-10113-00000-00-000000 | Multiple segment resolutions differ |
| 03982 | 26126458 | 26126799 | JQ Reference | 26126458 | 26126799 | Order/JQ reference differs (amount fallback used) |

## Method and interpretation

- The primary join is normalized invoice number plus parsed `JQ-#####`. Ambiguous duplicate keys are assigned by amount, then segment similarity. Remaining lines use normalized invoice number plus line amount within SAR 0.01.
- The 10-part combination order was validated against every populated row in our workbook: Company–Location–Account–Cost Center–DIV–Solution–Agency–Project–Intercompany–Future 1.
- Account, Cost Center, DIV, Agency, Solution, and Project are decoded from finance's distribution combination because the visible ADFDI row-8 headers expose overlay fields, not populated named chart-segment columns.
- Arabic descriptions and dates are audit context only and do not affect segment-match scoring; consequently there is no date-format-only or Arabic-text-only discrepancy bucket unless a requested comparison field differs.
