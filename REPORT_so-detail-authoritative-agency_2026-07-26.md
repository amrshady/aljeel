# SO_Detail authoritative Agency — implementation report

## Result

`SO_Detail.CAT_AGENCY`, joined by canonical JQ / Order Number, now supplies Agency
for all Asateel batches. The same value is written to standalone `Agency` and used
to rebuild Distribution Combination segment 7. Missing, blank/`00000`, and
conflicting SO_Detail agencies do not fall back to Supplier Sheet; they emit an
`AGENCY_UNRESOLVED` exception and make the entire Oracle workbook row RED.

The SO_Detail allocation/employee index split was removed. One index now carries
`SPERSON`, `CAT_AGENCY`, `CAT_AGENCY_DESC`, and an explicit agency validity status.
CC, DIV, Solution, employee selection/remaps, and row split logic were not changed.

## CENTRAL golden before/after

| Measure | Before | After |
|---|---:|---:|
| Distribution rows | 185 | 185 |
| Reconciled/mismatched invoices | 92/0 | 92/0 |
| GREEN/YELLOW/RED | 3/182/0 | 0/129/56 |
| HOME_AGENCY_DISCREPANCY | 34 | 30 |
| Agency values changed | — | 63 |
| Rows flagged RED for agency | 0 | 56 |
| Combo segment-7 invariant violations | 0 | 0 |
| Non-agency field changes (CC/DIV/Solution/employee/split) | — | 0 |

Of the 63 changed agency values, 10 changed to a valid SO_Detail agency and 53
changed from a supplier agency to `00000` because SO_Detail was unresolved. Three
additional unresolved rows were already `00000`, producing 56 RED rows total.
The unresolved reasons are 39 missing JQs/agencies, 15 conflicting canonical-JQ
agencies, and 2 blank/`00000` agencies.

Valid SO_Detail agency corrections:

| Invoice | Line | Canonical JQ | Before | After |
|---|---:|---|---:|---:|
| 03099 | 2 | JQ-26115124 | 10153 | 10141 |
| 03134 | 1 | JQ-260000937 | 10072 | 10071 |
| 03142 | 2 | JQ-26109251 | 10111 | 10211 |
| 03176 | 1 | JQ-26112696 | 10153 | 10111 |
| 03176 | 2 | JQ-26112687 | 10153 | 10111 |
| 03177 | 1 | JQ-26112696 | 10153 | 10111 |
| 03178 | 1 | JQ-26112696 | 10153 | 10111 |
| 03179 | 1 | JQ-26112696 | 10153 | 10111 |
| 03179 | 2 | JQ-26112687 | 10153 | 10111 |
| 03236 | 1 | JQ-26108646 | 10202 | 10009 |

## Golden gate

`python3 qc/asateel_golden_check.py` ran to completion. It reported `GOLDEN DRIFT`
because the reviewed baseline expects `3/182/0` GREEN/YELLOW/RED and the new
required unresolved-agency behavior produces `0/129/56`. The three expected blank
cost-center row keys also changed status from YELLOW to RED. Allocation row count
and invoice reconciliation did not drift.

No golden check or fixture was edited. The baseline needs human re-blessing by
Ahmed if the new SO_Detail-authoritative results are accepted.

The generated workbook was independently inspected: all 56 flagged rows have RED
fill across every output/debug cell, and all 185 rows satisfy segment 7 == Agency.
No deployment was performed.
