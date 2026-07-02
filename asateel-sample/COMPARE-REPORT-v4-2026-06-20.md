# Asateel v4 POC vs Finance Entry Answer Key

- POC output: `_poc_out/asateel-poc-oracle-CENTRAL-full-v4-2026-06-20.xlsx`
- Answer key: `_allocation/Entry-1.xlsm`, `_allocation/Entry-2.xlsm`
- Matching: invoice number, then line order; if line-order amount did not align, amount within 0.01 was used as fallback.

## Side-by-Side Hit Rates

| Field | v4 | v3 | v2 |
| --- | --- | --- | --- |
| Agency | 153/157 97.5% | 123/157 78.3% | 101/157 64.3% |
| Cost Center | 148/157 94.3% | 148/157 94.3% | 107/157 68.2% |
| DIV | 148/157 94.3% | 148/157 94.3% | 85/157 54.1% |
| Solution | 138/157 87.9% | 138/157 87.9% | 17/157 10.8% |
| Full Distribution Combination | 130/157 82.8% | 110/157 70.1% | 11/157 7.0% |
| Line Amount | 36/157 22.9% | 36/157 22.9% | 36/157 22.9% |

## Delta vs v3

- Agency: 97.5% vs 78.3% (+19.1 pp)
- Cost Center: 94.3% vs 94.3% (+0.0 pp)
- DIV: 94.3% vs 94.3% (+0.0 pp)
- Solution: 87.9% vs 87.9% (+0.0 pp)
- Full combo: 82.8% vs 70.1% (+12.7 pp)
- Amount: 22.9% vs 22.9% (+0.0 pp)

## Controls

| Metric | v4 |
| --- | --- |
| Comparable rows | 157 |
| Generated rows | 208 |
| GREEN/YELLOW/RED | 181/12/15 |
| Location=20100 | 208/208 100.0% |
| Agency unresolved rows | 12/208 |
| A..AF header validation | passed in generator summary |

## Agency Resolve Methods

| Method | Rows |
| --- | --- |
| alias | 6 |
| exact | 139 |
| manpower_fallback | 54 |
| substring | 9 |

## Hit Rates By Allocation Source

| Source | Lines | Agency | CC | DIV | Solution | Full Combo | Amount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| brand | 2 | 1/2 50.0% | 1/2 50.0% | 1/2 50.0% | 0/2 0.0% | 0/2 0.0% | 0/2 0.0% |
| salesperson | 1 | 0/1 0.0% | 0/1 0.0% | 0/1 0.0% | 0/1 0.0% | 0/1 0.0% | 0/1 0.0% |
| supplier_agency | 154 | 152/154 98.7% | 147/154 95.5% | 147/154 95.5% | 138/154 89.6% | 130/154 84.4% | 36/154 23.4% |

## 03317 and 03041 Confirmation

### 03317
| Line | Agency | Agency Name | CC | DIV | Solution | Source | Method | Amount |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 10041 | Fujifilm | 160011 | 196 | 10008 | supplier_agency | exact | 550.0 |
| 2 | 10202 | Solventum | 160013 | 192 | 10054 | supplier_agency | exact | 200.0 |
| 3 | 10038 | Fluke | 160011 | 196 | 10054 | supplier_agency | exact | 200.0 |

### 03041
| Line | Agency | Agency Name | CC | DIV | Solution | Source | Method | Amount |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 10071 | Terumo | 160014 | 170 | 10052 | supplier_agency | exact | 1800.0 |
| 2 | 10202 | Solventum | 160013 | 192 | 10054 | supplier_agency | exact | 700.0 |

## Agency Misses

| Invoice | Line | Status | Source | Reason |
| --- | --- | --- | --- | --- |
| 03045 | 2 | YELLOW | brand | no supplier line match, v3 fallback unresolved |
| 03072 | 2 | YELLOW | brand | no supplier line match, v3 fallback unresolved |
| 03110 | 4 | YELLOW | brand | no supplier line match, v3 fallback unresolved |
| 03149 | 2 | YELLOW | salesperson | no supplier line match, v3 fallback unresolved |
| 03149 | 4 | YELLOW | salesperson | no supplier line match, v3 fallback unresolved |
| 03149 | 6 | YELLOW | salesperson | no supplier line match, v3 fallback unresolved |
| 03153 | 2 | YELLOW | salesperson | no supplier line match, v3 fallback unresolved |
| 03181 | 2 | YELLOW | brand | no supplier line match, v3 fallback unresolved |
| 03181 | 3 | YELLOW | brand | no supplier line match, v3 fallback unresolved |
| 03182 | 2 | YELLOW | brand | no supplier line match, v3 fallback unresolved |
| 03183 | 2 | YELLOW | brand | no supplier line match, v3 fallback unresolved |
| 03194 | 2 | YELLOW | brand | no supplier line match, v3 fallback unresolved |

## First Segment Mismatches

Total Agency/CC/DIV/Solution disagreements: 41. Showing first 60.

| Invoice | Line | Field | Ours | Answer Key | Allocation Source |
| --- | --- | --- | --- | --- | --- |
| 03072 | 1 | Solution | 10064 | 10050 | supplier_agency |
| 03073 | 3 | CostCenter | 160011 | 160012 | supplier_agency |
| 03073 | 3 | DIV | 196 | 194 | supplier_agency |
| 03104 | 1 | Solution | 10054 | 00000 | supplier_agency |
| 03110 | 1 | Solution | 10058 | 00000 | supplier_agency |
| 03129 | 2 | Solution | 10054 | 00000 | supplier_agency |
| 03134 | 1 | Solution | 10064 | 00000 | supplier_agency |
| 03135 | 1 | Solution | 10054 | 00000 | supplier_agency |
| 03136 | 1 | Solution | 10054 | 00000 | supplier_agency |
| 03138 | 1 | CostCenter | 160011 | 160014 | supplier_agency |
| 03138 | 1 | DIV | 196 | 170 | supplier_agency |
| 03139 | 1 | CostCenter | 160011 | 140040 | supplier_agency |
| 03139 | 1 | DIV | 196 | 190 | supplier_agency |
| 03142 | 1 | Solution | 10064 | 00000 | supplier_agency |
| 03149 | 1 | Solution | 00000 | 10018 | brand |
| 03149 | 2 | Agency | 00000 | 10153 | salesperson |
| 03149 | 2 | CostCenter |  | 160012 | salesperson |
| 03149 | 2 | DIV |  | 194 | salesperson |
| 03149 | 2 | Solution | 00000 | 10043 | salesperson |
| 03149 | 3 | Agency | 10153 | 10071 | brand |
| 03149 | 3 | CostCenter | 160012 | 160014 | brand |
| 03149 | 3 | DIV | 194 | 170 | brand |
| 03149 | 3 | Solution | 00000 | 10052 | brand |
| 03150 | 1 | Solution | 10064 | 10017 | supplier_agency |
| 03151 | 1 | Solution | 10064 | 10017 | supplier_agency |
| 03170 | 3 | CostCenter | 160012 | 160014 | supplier_agency |
| 03170 | 3 | DIV | 194 | 170 | supplier_agency |
| 03180 | 1 | Solution | 10054 | 00000 | supplier_agency |
| 03180 | 2 | Solution | 10056 | 00000 | supplier_agency |
| 03193 | 4 | Agency | 10100 | 10081 | supplier_agency |
| 03194 | 1 | Solution | 10064 | 00000 | supplier_agency |
| 03195 | 1 | CostCenter | 250010 | 160012 | supplier_agency |
| 03195 | 1 | DIV | 120 | 194 | supplier_agency |
| 03236 | 2 | CostCenter | 160013 | 160011 | supplier_agency |
| 03236 | 2 | DIV | 192 | 196 | supplier_agency |
| 03236 | 2 | Solution | 10056 | 00000 | supplier_agency |
| 03237 | 1 | Solution | 10064 | 10050 | supplier_agency |
| 03308 | 1 | Solution | 10064 | 00000 | supplier_agency |
| 03309 | 2 | Agency | 30264 | 10132 | supplier_agency |
| 03318 | 1 | CostCenter | 250010 | 160012 | supplier_agency |
| 03318 | 1 | DIV | 120 | 194 | supplier_agency |
