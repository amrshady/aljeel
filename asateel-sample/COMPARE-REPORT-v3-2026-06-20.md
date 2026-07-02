# Asateel v3 POC vs Finance Entry Answer Key

- POC output: `_poc_out/asateel-poc-oracle-CENTRAL-full-v3-2026-06-20.xlsx`
- Answer key: `_allocation/Entry-1.xlsm`, `_allocation/Entry-2.xlsm`
- Matching: invoice number, then line order; if line-order amount did not align, amount within 0.01 was used as fallback.

## Overall Hit Rates

| Field | Hits | Total | v3 Rate | v2 Rate | Delta |
| --- | --- | --- | --- | --- | --- |
| Agency | 123 | 157 | 78.3% | 64.3% | +14.0 pp |
| Cost Center | 148 | 157 | 94.3% | 68.2% | +26.1 pp |
| DIV | 148 | 157 | 94.3% | 54.1% | +40.2 pp |
| Full Distribution Combination | 110 | 157 | 70.1% | 7.0% | +63.1 pp |
| Line Amount | 36 | 157 | 22.9% | 22.9% | +0.0 pp |

## Solution And Controls

| Metric | Value |
| --- | --- |
| Solution resolved | 149/208 71.6% |
| Solution matches answer key | 138/157 87.9% |
| Location=20100 | 208/208 100.0% |
| Need-to-allocate/charge-to RED rows | 13 |
| Row status GREEN/YELLOW/RED | 178/15/15 |
| Allocation sources | brand=50, manpower_empno=147, salesperson=7, supplier_expenses_format=4 |

## Hit Rates By Allocation Source

| Source | Lines | Agency | CC | DIV | Solution | Full Combo | Amount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| manpower_empno | 147 | 117/147 79.6% | 142/147 96.6% | 142/147 96.6% | 131/147 89.1% | 105/147 71.4% | 33/147 22.4% |
| brand | 5 | 2/5 40.0% | 2/5 40.0% | 2/5 40.0% | 3/5 60.0% | 1/5 20.0% | 0/5 0.0% |
| salesperson | 1 | 0/1 0.0% | 0/1 0.0% | 0/1 0.0% | 0/1 0.0% | 0/1 0.0% | 0/1 0.0% |
| supplier_expenses_format | 4 | 4/4 100.0% | 4/4 100.0% | 4/4 100.0% | 4/4 100.0% | 4/4 100.0% | 3/4 75.0% |

## 03317 Detail

| Line | Match | Our Amt | Key Amt | Our Agency | Key Agency | Our CC | Key CC | Our DIV | Key DIV | Our Sol | Key Sol | Source | Our Combo | Key Combo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | line_order | 550.0 | 316.66 | 10043 | 10041 | 160011 | 160011 | 196 | 196 | 10008 | 10008 | manpower_empno | 03-20100-61500027-160011-196-10008-10043-00000-00-000000 | 03-20100-61500027-160011-196-10008-10041-00000-00-000000 |
| 2 | line_order | 200.0 | 316.66 | 10202 | 10202 | 160013 | 160013 | 192 | 192 | 10054 | 10054 | manpower_empno | 03-20100-61500027-160013-192-10054-10202-00000-00-000000 | 03-20100-61500027-160013-192-10054-10202-00000-00-000000 |
| 3 | line_order | 200.0 | 316.66 | 10156 | 10038 | 160011 | 160011 | 196 | 196 | 10054 | 10054 | manpower_empno | 03-20100-61500027-160011-196-10054-10156-00000-00-000000 | 03-20100-61500027-160011-196-10054-10038-00000-00-000000 |

## Mismatch Table

Total Agency/CC/DIV disagreements: 52. Showing first 60.

| Invoice | Line | Field | Ours | Answer Key | Allocation Source |
| --- | --- | --- | --- | --- | --- |
| 03041 | 2 | Agency | 10200 | 10202 | manpower_empno |
| 03067 | 1 | Agency | 10200 | 10202 | manpower_empno |
| 03073 | 3 | Agency | 10156 | 10153 | manpower_empno |
| 03073 | 3 | CostCenter | 160011 | 160012 | manpower_empno |
| 03073 | 3 | DIV | 196 | 194 | manpower_empno |
| 03098 | 1 | Agency | 10200 | 10202 | manpower_empno |
| 03098 | 3 | Agency | 10156 | 10041 | manpower_empno |
| 03098 | 4 | Agency | 10156 | 10100 | manpower_empno |
| 03100 | 1 | Agency | 10156 | 10100 | manpower_empno |
| 03101 | 1 | Agency | 10156 | 10100 | manpower_empno |
| 03104 | 1 | Agency | 10156 | 10038 | manpower_empno |
| 03110 | 1 | Agency | 10005 | 10009 | manpower_empno |
| 03112 | 2 | Agency | 10156 | 10100 | manpower_empno |
| 03112 | 3 | Agency | 10083 | 10041 | manpower_empno |
| 03129 | 1 | Agency | 10156 | 10041 | manpower_empno |
| 03133 | 2 | Agency | 10043 | 10041 | manpower_empno |
| 03134 | 1 | Agency | 10200 | 10072 | manpower_empno |
| 03136 | 1 | Agency | 10156 | 10038 | manpower_empno |
| 03136 | 2 | Agency | 10060 | 10062 | manpower_empno |
| 03138 | 1 | CostCenter | 160011 | 160014 | manpower_empno |
| 03138 | 1 | DIV | 196 | 170 | manpower_empno |
| 03139 | 1 | Agency | 10043 | 10200 | brand |
| 03139 | 1 | CostCenter | 160011 | 140040 | brand |
| 03139 | 1 | DIV | 196 | 190 | brand |
| 03149 | 2 | Agency | 00000 | 10153 | salesperson |
| 03149 | 2 | CostCenter |  | 160012 | salesperson |
| 03149 | 2 | DIV |  | 194 | salesperson |
| 03149 | 3 | Agency | 10153 | 10071 | brand |
| 03149 | 3 | CostCenter | 160012 | 160014 | brand |
| 03149 | 3 | DIV | 194 | 170 | brand |
| 03154 | 1 | Agency | 10101 | 10102 | manpower_empno |
| 03155 | 1 | Agency | 10101 | 10102 | manpower_empno |
| 03170 | 3 | Agency | 10111 | 10071 | brand |
| 03170 | 3 | CostCenter | 160012 | 160014 | brand |
| 03170 | 3 | DIV | 194 | 170 | brand |
| 03195 | 1 | Agency | 10206 | 10126 | manpower_empno |
| 03195 | 1 | CostCenter | 250010 | 160012 | manpower_empno |
| 03195 | 1 | DIV | 120 | 194 | manpower_empno |
| 03236 | 1 | Agency | 10200 | 10202 | manpower_empno |
| 03236 | 2 | Agency | 10200 | 10052 | manpower_empno |
| 03236 | 2 | CostCenter | 160013 | 160011 | manpower_empno |
| 03236 | 2 | DIV | 192 | 196 | manpower_empno |
| 03270 | 1 | Agency | 10200 | 10202 | manpower_empno |
| 03270 | 2 | Agency | 10156 | 10100 | manpower_empno |
| 03305 | 1 | Agency | 10200 | 10202 | manpower_empno |
| 03306 | 1 | Agency | 10125 | 10126 | manpower_empno |
| 03307 | 1 | Agency | 10200 | 10202 | manpower_empno |
| 03317 | 1 | Agency | 10043 | 10041 | manpower_empno |
| 03317 | 3 | Agency | 10156 | 10038 | manpower_empno |
| 03318 | 1 | Agency | 10206 | 10153 | manpower_empno |
| 03318 | 1 | CostCenter | 250010 | 160012 | manpower_empno |
| 03318 | 1 | DIV | 120 | 194 | manpower_empno |

## Top Systematic Error Patterns

| Count | Field | Source | Ours | Answer Key |
| --- | --- | --- | --- | --- |
| 7 | Agency | manpower_empno | 10200 | 10202 |
| 5 | Agency | manpower_empno | 10156 | 10100 |
| 3 | Agency | manpower_empno | 10156 | 10038 |
| 2 | Agency | manpower_empno | 10156 | 10041 |
| 2 | Agency | manpower_empno | 10043 | 10041 |
| 2 | CostCenter | brand | 160012 | 160014 |
| 2 | DIV | brand | 194 | 170 |
| 2 | Agency | manpower_empno | 10101 | 10102 |
| 2 | CostCenter | manpower_empno | 250010 | 160012 |
| 2 | DIV | manpower_empno | 120 | 194 |
| 1 | Agency | manpower_empno | 10156 | 10153 |
| 1 | CostCenter | manpower_empno | 160011 | 160012 |
