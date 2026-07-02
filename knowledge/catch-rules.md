# Catch Rules — per-pipeline canonical reference

The exact catch logic, thresholds, and severity assignments. Numbers locked in Python; Claude only writes prose around them.

---

## J&J / DePuy

### Extraction completeness gate
- Sum of line totals vs header total must satisfy: `0.98 <= sum/header <= 1.02`
- Below threshold sets `extraction_audit.incomplete = True` and emits `[INCOMPLETE]` log line
- Triggers re-extraction with smaller chunk_pages

### Match rules (in order)
1. **Exact aggregation match** by `V:<vendor_item_code>`
2. **Description fallback** by `D:<normalize(description)>`
3. **Fuzzy prefix match** for Gemini-concatenated descriptions
4. **Sum across PO duplicates** — POST IBF cages have 4 duplicate-desc rows; sum quantities

### normalize() handles
- Bilingual description (truncate at first Arabic char)
- OCR variance: 0/O ambiguity, leading +, 5X vs 5 X spacing, ø/Ø diameter, W/N vs WA N
- Trailing catalog-code tokens (e.g. ` 111.`, ` .131.`)

### Severity assignment
- **CRITICAL** — extraction incomplete, header vs PO under-billing (currently not implemented)
- **HIGH** — quantity mismatch with no fuzzy fallback hit
- **MEDIUM** — quantity match but unit-price drift > 1%
- **LOW** — informational (catalog-code variants caught by fuzzy match)

---

## Asateel

### Reconciliation rule
- Header SAR is gross of VAT; allocation lines are net
- Tolerance: `abs(allocation_sum * 1.15 - header_total) <= 1.0` SAR
- Above tolerance = `ALLOC_MISMATCH` (HIGH severity)

### Allocation-row detection
- A row is an allocation row iff `AMOUNT` is set (numeric, non-zero)
- This covers BOTH JQ-bearing AND cost-center-direct rows
- v1 bug: only counted JQ-bearing rows → 11 false UNALLOCATED catches. Fixed in v2.

### Duplicate detection
| Category | Rule | Severity |
|---|---|---|
| DUP_JQ_STRICT | same emp + same date + same amount + different invoices | HIGH (double-pay candidate) |
| EMP_SAME_DAY_MULTI_INVOICE | 3+ rides one day across 3+ invoices > SAR 3K total | LOW (soft signal, finance review) |
| PARTIAL_ALLOC_MISSING_JQ | allocation row has amount but no JQ | MEDIUM |

### Excel-serial date parsing
- If date column contains raw int (e.g. `46130`), pandas reads as nanoseconds-from-epoch
- Custom `parse_excel_date()` detects int and converts: `pd.Timestamp(1899-12-30) + Timedelta(days=int(v))`

### Gemini cross-validation
- Sample 5 of N PDFs at random
- Extract header total via vision
- Compare to allocation Excel header
- Mismatch >1 SAR = quality flag (LOW severity)

---

## Jawal

### 4-pass match (in priority order)
1. **Pass 1** — exact 10-digit ticket ID against folder name OR PDF body text
2. **Pass 2** — text Ref. No. (col 6) ↔ folder name, fuzzy substring + token overlap
3. **Pass 3** — route keyword (TRAIN/etc) + passenger surname strict match in .msg
4. **Pass 4** — passenger name strict match with transliteration variants

### Transliteration map
- MOHAMMED ↔ MOHAMED ↔ MOHAMMAD
- ABDUL ↔ ABDEL ↔ ABDOL
- KHALID ↔ KHALED
- (extend as new variants surface)

### Catch categories
| Category | Rule | Severity |
|---|---|---|
| NO_FOLDER | Ticket on invoice, no matching evidence folder, NOT EMD | HIGH |
| NO_APPROVAL | Folder exists, zero .msg files | MEDIUM |
| DUP_ROUTE | Same passenger + same route + same date across rows | MEDIUM |
| EMD_FEE | Ticket starts with `1936` | LOW (informational, excluded from NO_FOLDER) |
| VAT_MISMATCH | Details col 13 vat_class ≠ calculated VAT pct | HIGH |
| PERSONAL_CONTRIB_SELF_APPROVAL | Requester == Approver in .msg filename | HIGH (audit) |

### VAT_CLASS_VS_PCT rule
- Source-of-truth: Details col 13 `vat_class`
- `KSA VAT STANDARD` → expect 15%
- `KSA VAT ZERO` → expect 0%
- v1 used GL-name heuristic — mis-flagged 8 international flights. Fixed in v2.

### EMD pairing
- `1936*` ticket numbers are fare-adjustment EMDs paired with original `6905*` booking
- No separate folder expected
- Surface as LOW informational only; never trigger NO_FOLDER

### PERSONAL_CONTRIB_SELF_APPROVAL regex
- Match pattern: `Personal Contribution Approval Requested for (\w+) by \1`
- Multi-space tolerant (`\s+` not single space) — v3 fix
- 56 cases in April batch = missing manager oversight on personal-portion deductions

---

## Catch report prose (all pipelines)

- **Numbers locked in Python.** Claude only writes narrative.
- Each catch in JSON carries: severity, value_at_risk_sar, evidence_paths, reviewer_note
- Catch report = root-cause + resolver action only. Claude never re-counts or re-sums.
- Defense against hallucinated counts: if Claude's prose mentions a SAR figure not in the JSON, that's a bug — file as known issue.
