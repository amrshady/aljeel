# Asateel v2 POC vs Finance Entry Answer Key

- POC output: `_poc_out/asateel-poc-oracle-CENTRAL-full-v2-2026-06-20.xlsx`
- Answer key: `_allocation/Entry-1.xlsm`, `_allocation/Entry-2.xlsm`
- Matching: invoice number, then line order; if line order amount did not align, amount within 0.01 was used as fallback.

## Overall Hit Rates

| Field | Hits | Total | Rate |
| --- | --- | --- | --- |
| Agency | 101 | 157 | 64.3% |
| Cost Center | 107 | 157 | 68.2% |
| DIV | 85 | 157 | 54.1% |
| Full Distribution Combination | 11 | 157 | 7.0% |
| Line Amount | 36 | 157 | 22.9% |

## Coverage

- POC invoices / lines: 92 / 208
- Answer-key invoices / lines: 92 / 163
- Matched POC lines: 157
- POC lines without answer-key row: 51
- Answer-key lines without POC row: 6
- Invoices in POC but not answer key: none
- Invoices in answer key but not POC: none

## Mismatch Table

Total Agency/CC/DIV disagreements: 178. Showing first 60.

| Invoice | Line | Field | Ours | Answer Key | Allocation Source |
| --- | --- | --- | --- | --- | --- |
| 03041 | 1 | Agency | 00000 | 10071 | brand |
| 03041 | 1 | CostCenter |  | 160014 | brand |
| 03041 | 1 | DIV |  | 170 | brand |
| 03041 | 2 | Agency | 10071 | 10202 | brand |
| 03041 | 2 | CostCenter | 160014 | 160013 | brand |
| 03041 | 2 | DIV | 170 | 192 | brand |
| 03044 | 1 | Agency | 00000 | 10202 | salesperson |
| 03044 | 1 | CostCenter |  | 160013 | salesperson |
| 03044 | 1 | DIV |  | 192 | salesperson |
| 03044 | 2 | Agency | 10081 | 10111 | salesperson |
| 03044 | 2 | CostCenter | 160011 | 160012 | salesperson |
| 03044 | 2 | DIV | 196 | 194 | salesperson |
| 03067 | 1 | DIV | 110 | 192 | supplier_expenses_format |
| 03072 | 1 | DIV | 260 | 170 | supplier_expenses_format |
| 03073 | 1 | DIV | 110 | 192 | supplier_expenses_format |
| 03097 | 1 | Agency | 10206 | 10202 | salesperson |
| 03097 | 1 | CostCenter | 250010 | 160013 | salesperson |
| 03097 | 1 | DIV | 120 | 192 | salesperson |
| 03098 | 1 | Agency | 10206 | 10202 | salesperson |
| 03098 | 1 | CostCenter | 190020 | 160013 | salesperson |
| 03098 | 1 | DIV | 120 | 192 | salesperson |
| 03098 | 2 | Agency | 00000 | 10153 | salesperson |
| 03098 | 2 | CostCenter |  | 160012 | salesperson |
| 03098 | 2 | DIV |  | 194 | salesperson |
| 03098 | 3 | Agency | 88888 | 10041 | salesperson |
| 03098 | 3 | CostCenter | 130020 | 160011 | salesperson |
| 03098 | 3 | DIV | 888 | 196 | salesperson |
| 03098 | 4 | Agency | 00000 | 10100 | salesperson |
| 03098 | 4 | CostCenter |  | 160011 | salesperson |
| 03098 | 4 | DIV |  | 196 | salesperson |
| 03098 | 5 | Agency | 00000 | 10055 | salesperson |
| 03098 | 5 | CostCenter |  | 160011 | salesperson |
| 03098 | 5 | DIV |  | 196 | salesperson |
| 03099 | 2 | Agency | 00000 | 10153 | salesperson |
| 03099 | 2 | CostCenter |  | 160012 | salesperson |
| 03099 | 2 | DIV |  | 194 | salesperson |
| 03100 | 1 | Agency | 00000 | 10100 | salesperson |
| 03100 | 1 | CostCenter |  | 160011 | salesperson |
| 03100 | 1 | DIV |  | 196 | salesperson |
| 03101 | 1 | Agency | 10200 | 10100 | salesperson |
| 03101 | 1 | CostCenter | 160030 | 160011 | salesperson |
| 03101 | 1 | DIV | 190 | 196 | salesperson |
| 03101 | 2 | Agency | 10101 | 10055 | brand |
| 03101 | 2 | CostCenter | 160013 | 160011 | brand |
| 03101 | 2 | DIV | 192 | 196 | brand |
| 03101 | 3 | DIV | 110 | 192 | supplier_expenses_format |
| 03102 | 2 | DIV | 110 | 192 | supplier_expenses_format |
| 03108 | 3 | Agency | 10200 | 10090 | salesperson |
| 03108 | 3 | CostCenter | 160013 | 160011 | salesperson |
| 03108 | 3 | DIV | 192 | 196 | salesperson |
| 03109 | 1 | Agency | 00000 | 10101 | salesperson |
| 03109 | 1 | CostCenter |  | 160013 | salesperson |
| 03109 | 1 | DIV |  | 192 | salesperson |
| 03109 | 2 | Agency | 00000 | 10153 | salesperson |
| 03109 | 2 | CostCenter |  | 160012 | salesperson |
| 03109 | 2 | DIV |  | 194 | salesperson |
| 03110 | 1 | Agency | 00000 | 10009 | brand |
| 03110 | 1 | CostCenter |  | 160013 | brand |
| 03110 | 1 | DIV |  | 192 | brand |
| 03111 | 1 | Agency | 10206 | 10153 | salesperson |

## Mismatches by Allocation Source

| Source | Lines | Segment Misses | Agency | CC | DIV | Full Combo | Amount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| brand | 79 | 46 | 61/79 77.2% | 65/79 82.3% | 65/79 82.3% | 7/79 8.9% | 23/79 29.1% |
| salesperson | 51 | 109 | 14/51 27.5% | 15/51 29.4% | 15/51 29.4% | 0/51 0.0% | 8/51 15.7% |
| supplier_expenses_format | 27 | 23 | 26/27 96.3% | 27/27 100.0% | 5/27 18.5% | 4/27 14.8% | 5/27 18.5% |
| none | 0 | 0 | 0/0 0.0% | 0/0 0.0% | 0/0 0.0% | 0/0 0.0% | 0/0 0.0% |

## 03317 Detail

| Line | Match | Our Amt | Key Amt | Our CC | Key CC | Our DIV | Key DIV | Our Agency | Key Agency | Our Combo | Key Combo | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | line_order | 550.0 | 316.66 | 160011 | 160011 | 196 | 196 | 10041 | 10041 | 03-20100-61500027-160011-196-00000-10041-00000-00-000000 | 03-20100-61500027-160011-196-10008-10041-00000-00-000000 | brand |
| 2 | line_order | 200.0 | 316.66 | 160013 | 160013 | 110 | 192 | 10202 | 10202 | 03-20100-61500027-160013-110-00000-10202-00000-00-000000 | 03-20100-61500027-160013-192-10054-10202-00000-00-000000 | supplier_expenses_format |
| 3 | line_order | 200.0 | 316.66 | 160011 | 160011 | 196 | 196 | 10038 | 10038 | 03-20100-61500027-160011-196-00000-10038-00000-00-000000 | 03-20100-61500027-160011-196-10054-10038-00000-00-000000 | brand |

## Top Systematic Error Patterns

| Count | Field | Source | Ours | Answer Key |
| --- | --- | --- | --- | --- |
| 11 | DIV | supplier_expenses_format | 110 | 192 |
| 5 | DIV | supplier_expenses_format | 260 | 170 |
| 5 | CostCenter | salesperson | (blank) | 160011 |
| 5 | DIV | salesperson | (blank) | 196 |
| 4 | CostCenter | salesperson | (blank) | 160013 |
| 4 | DIV | salesperson | (blank) | 192 |
| 4 | Agency | salesperson | 00000 | 10153 |
| 4 | CostCenter | salesperson | (blank) | 160012 |
| 4 | DIV | salesperson | (blank) | 194 |
| 4 | Agency | brand | 10111 | 10153 |
| 3 | Agency | salesperson | 10206 | 10202 |
| 3 | DIV | salesperson | 120 | 192 |
- The weakest path by raw segment disagreements is `salesperson` (109 Agency/CC/DIV misses).
- The most frequent disagreed segment is `DIV` (72 misses).
- Full-combo misses (146) are dominated by nonzero finance solution segments where the POC wrote `00000`; a canonical brand/salesperson-to-solution rule is needed before full combinations can score well.
- Amount mismatches (121) show that the POC PDF-derived line split often does not mirror finance's Entry split; the Supplier Expenses Format allocation amounts need to be the primary line source when finance uses them.
- Supplier Expenses Format rows mostly carry the right Agency/CC, but DIV is often different, especially `110 -> 192` and `260 -> 170`; the rule needs the Entry/lookup DIV, not the generic source DIV.
- Salesperson rows are the weakest source because unresolved or mismapped salespeople lead to blank/00000 or wrong Agency/CC/DIV; closing this needs the canonical salesperson-to-manpower mapping plus finance's manual override cases.
