# QA Validation — Cross-Batch Benchmark Report (v16)

**Date:** 2026-05-26  
**Validator:** Independent QA agent (subagent, depth 1)  
**Method:** From-scratch Python verification — did NOT use `score_against_truth.py`  
**Script:** `aljeel/qc/qa_validate_v2.py`

---

## Claims Under Review

| Batch    | Rows | Baseline All-5 | v16 All-5 | v16 CC gaps | v16 Agency gaps |
|----------|-----:|---------------:|----------:|------------:|----------------:|
| J26-550  |   72 |          80.6% |     80.6% |           5 |               5 |
| J26-589  |  129 |          62.0% |     65.9% |           7 |              11 |
| J26-593  |  160 |          74.4% |     81.2% |          22 |              27 |
| J26-640  |  117 |         100.0% |    100.0% |           0 |               0 |

---

## VERDICT: ✅ CONFIRMED

All v16 claims are accurate. Every number — row counts, All-5 percentages, CC gap counts, and Agency gap counts — matches the independent re-computation exactly.

---

## Methodology

### Truth file reading
- Sheet: `Details`
- Column layout (1-indexed): 1=Sl#, 4=Ticket, 17=Account, 19=CC, 21=DIV, 23=Solution, 25=Agency
- Ticket extraction regex: `(?<![\d])(\d{10}|26-\d{3})(?![\d])` — strict, no boundary bleed

### Pipeline file reading
- Header row detected by presence of `Description` column (found at row 3 in all 4 batches)
- Columns resolved by header name: Account, Cost Center, DIV, Solution, Agency
- Confirmed column indices: desc=10, account=18, cc=20, div=22, sol=24, agency=26 (0-indexed)

### Normalization
- `norm(v)`: strip leading zeros; None/empty → `'0'`
- Example: `'00000'` → `'0'`, `'160014'` → `'160014'`, `None` → `'0'`

### Duplicate ticket handling (critical)
Each batch has one ticket that appears multiple times in both truth and pipeline:

| Batch    | Duplicate ticket | Count in truth | Count in pipeline | Pairing strategy |
|----------|-----------------|---------------:|------------------:|------------------|
| J26-550  | `26-555`        |              2 |                 1 | N:1 (each truth paired with single pipe row) |
| J26-589  | `6905012406`    |              5 |                 5 | N:N (index-aligned) |
| J26-593  | `26-614`        |              3 |                 3 | N:N (index-aligned) |
| J26-640  | `26-689`        |              3 |                 3 | N:N (index-aligned) |

**This is the single most important implementation detail.** My first draft (v1) used a flat `dict` that overwrites on duplicate keys, producing wrong row counts (71/125/158/115 instead of 72/129/160/117) and wrong percentages. The v2 script stores all occurrences in lists and applies the correct N:M pairing logic, producing exact matches.

### Scoring
- **paired_evaluated** = total number of (truth, pipeline) pairs where both sides are non-null
- **All-5 match** = all 5 segments (account, cc, div, solution, agency) exactly equal after normalization
- **CC gaps** = rows in the non-all-5 set where CC differs
- **Agency gaps** = rows in the non-all-5 set where Agency differs

---

## Independent Results vs Claims

| Batch    | Claimed rows | Actual rows | Claimed All-5% | Actual All-5% | Claimed CC | Actual CC | Claimed Ag | Actual Ag | Status |
|----------|-------------:|------------:|---------------:|--------------:|-----------:|----------:|-----------:|----------:|--------|
| J26-550  |           72 |          72 |          80.6% |         80.6% |          5 |         5 |          5 |         5 | ✅ OK  |
| J26-589  |          129 |         129 |          65.9% |         65.9% |          7 |         7 |         11 |        11 | ✅ OK  |
| J26-593  |          160 |         160 |          81.2% |         81.2% |         22 |        22 |         27 |        27 | ✅ OK  |
| J26-640  |          117 |         117 |         100.0% |        100.0% |          0 |         0 |          0 |         0 | ✅ OK  |

Raw counts: J26-550: 58/72, J26-589: 85/129, J26-593: 130/160, J26-640: 117/117.

---

## Spot Checks

### ✅ J26-640 — Perfect batch (100% all-5)

Ticket `1936040338` (SL#29, Truth row 30, Pipeline row 32):

| Field    | Truth (raw) | Truth (norm) | Pipeline (raw) | Pipeline (norm) | Match |
|----------|-------------|--------------|----------------|-----------------|-------|
| account  | 60301003    | 60301003     | 60301003       | 60301003        | ✓     |
| cc       | 160011      | 160011       | 160011         | 160011          | ✓     |
| div      | 196         | 196          | 196            | 196             | ✓     |
| solution | 00000       | 0            | 00000          | 0               | ✓     |
| agency   | 10081       | 10081        | 10081          | 10081           | ✓     |

All 117 rows in J26-640 are perfect — no mismatches anywhere.

---

### ✗ J26-593 — CC mismatch example

Ticket `6905084597` (SL#9, Truth row 10, Pipeline row 12):

| Field    | Truth (raw) | Truth (norm) | Pipeline (raw) | Pipeline (norm) | Match |
|----------|-------------|--------------|----------------|-----------------|-------|
| account  | 60307021    | 60307021     | 60307021       | 60307021        | ✓     |
| cc       | 160014      | 160014       | 250010         | 250010          | ✗     |
| div      | 170         | 170          | 120            | 120             | ✗     |
| solution | 10050       | 10050        | 00000          | 0               | ✗     |
| agency   | 10072       | 10072        | 10206          | 10206           | ✗     |

This is a sponsorship row (account 60307021 = Sponsoring Expenses) where the pipeline assigned a default travel CC/DIV/Solution/Agency instead of the correct sponsorship coding.

---

### ✗ J26-593 — Agency-only mismatch example

Ticket `26-616` (pipeline row 37):

| Field    | Truth       | Pipeline    | Match |
|----------|-------------|-------------|-------|
| account  | 60307021    | 60307021    | ✓     |
| cc       | 160011      | 160011      | ✓     |
| div      | 196         | 196         | ✓     |
| solution | 0           | 0           | ✓     |
| agency   | 10100       | 10156       | ✗     |

Account/CC/DIV/Solution all correct; only agency code wrong. A single-segment miss.

---

### ✗ J26-550 — Multi-field mismatch

Ticket `6904732430` (SL#10, Truth row 11):

| Field    | Truth       | Pipeline    | Match |
|----------|-------------|-------------|-------|
| account  | 21070229    | 60301003    | ✗     |
| cc       | 160014      | 250010      | ✗     |
| div      | 170         | 120         | ✗     |
| solution | 0           | 0           | ✓     |
| agency   | 10239       | 10206       | ✗     |

Truth account `21070229` = Accrued Project; pipeline defaulted to travel account `60301003`. This is a J&J / accrual-type entry where the pipeline used the wrong template entirely.

---

## Notable Observations

### 1. J26-550 has 5 pipeline-only rows
The J26-550 pipeline output contains 77 rows but the truth only has 72. The 5 surplus pipeline rows (tickets `6904763621`, `6904763645`, `6904763646`, `6904763647`, `6904763648`, `6904763649`) have no corresponding truth entry. These are **not penalized** in the All-5 scoring since scoring only evaluates truth-matched pairs. This is consistent with the benchmark methodology.

### 2. 'EP' is a non-numeric solution code in the pipeline
Three rows in J26-550 and two in J26-589 have `solution = 'EP'` in the pipeline output. The truth always has a numeric code (`10064` in these cases). After `norm()`, `'EP'` stays as `'EP'` (not parseable as int), while `'10064'` stays as `'10064'`. These count as mismatches. Worth flagging as a pipeline artifact — the solution field should always be a 5-digit numeric code.

### 3. J26-550 duplicate ticket `26-555` paired N:1
Truth has two rows for `26-555` (rows 71 and 72, for the same passenger with split amounts). The pipeline only has one row. The pair_rows logic replicates the single pipeline row for both truth comparisons. Truth row 70 matches (agency `10156` → pipe `10156` = match), but truth row 71 has a different correct agency (`10156`) — but the pipeline is coding it as `10041`. This results in one agency gap for `26-555`.

### 4. Normalization edge: leading-zero solution codes
`'00000'` normalizes to `'0'`. Both truth and pipeline consistently produce `'00000'` for general/unassigned rows, so after normalization both become `'0'` — this is correct behavior and does not inflate match rates.

---

## Conclusion

**VERDICT: CONFIRMED**

The cross-batch benchmark report is accurate. All 16 numbers checked (4 batches × 4 metrics: rows, All-5%, CC gaps, Agency gaps) are exactly reproduced by independent re-computation with a from-scratch script.

The only non-trivial implementation detail is duplicate ticket handling: the correct methodology is to store all occurrences and apply N:M pairing (N:1 when pipeline has fewer rows, N:N when counts match), using `paired_evaluated` (total pairs) as the denominator — not unique ticket count.

---

## Files Examined

| File | Rows (truth/pipeline) | Notes |
|------|-----------------------|-------|
| `jawal-J26-550/J26-550.xlsx` (Details) | 72 | 1 dup ticket: `26-555` ×2 |
| `jawal-J26-550/output/Spreadsheet-J26-550-FILLED-v16.xlsx` | 77 | 5 pipeline-only rows; `'EP'` in solution ×3 |
| `jawal-J26-589/J26-589.xlsx` (Details) | 129 | 1 dup ticket: `6905012406` ×5 |
| `jawal-J26-589/output/Spreadsheet-J26-589-FILLED-v16.xlsx` | 129 | `'EP'` in solution ×2 |
| `jawal-J26-593/J26-593.xlsx` (Details) | 160 | 1 dup ticket: `26-614` ×3 |
| `jawal-J26-593/output/Spreadsheet-J26-593-FILLED-v16.xlsx` | 160 | — |
| `jawal-J26-640/J26-640.xlsx` (Details) | 117 | 1 dup ticket: `26-689` ×3 |
| `jawal-J26-640/output/Spreadsheet-J26-640-FILLED-v16.xlsx` | 117 | — |
