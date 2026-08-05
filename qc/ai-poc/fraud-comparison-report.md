# AlJeel AP — AI Consistency Check vs v15.11 Deterministic Rules (v16.2)

**Generated:** 2026-08-04 22:44 UTC
**Schema:** v16.2 — hardened Pydantic v2 + Gemini responseSchema
**Model:** gemini-3.1-pro-preview (Cloudflare AI Gateway, 2M context)

## Telemetry Summary

| Batch | Model | Rows | RED | YELLOW | SAR at Risk | v15.11 Flagged | Cost | Latency | Pydantic |
|-------|-------|------|-----|--------|-------------|----------------|------|---------|----------|
| J26-550 | gemini-3.1-pro-preview | 72 | 15 | 2 | SAR 86,230 | 39 | $1.9621 | 124.7s | ✅ |

## Combined Catches by Category (Both Batches)

| Category | Count |
|----------|-------|
| APPROVAL_MISSING | 8 |
| DUPLICATE_BILLING | 3 |
| UNAPPROVED_FAMILY | 2 |
| AMOUNT_MISMATCH_EMAIL | 2 |

---

# AI Consistency Check — J26-550 (Schema v16.2)

**Generated:** 2026-08-04 22:44 UTC
**Schema:** v16.2 (hardened Pydantic + Gemini responseSchema)

## Summary

| Metric | v15.11 Deterministic | AI (Gemini 3.1 Pro) |
|--------|---------------------|----------------------|
| Total rows | 72 | 72 |
| Flagged rows | 39 | 17 |
| RED (high severity) | — | 13 |
| YELLOW (medium severity) | — | 2 |
| CLEAN | — | 57 |
| **Total SAR at risk** | — | **SAR 86,230.00** |

## Catches by Primary Category

| Category | Count |
|----------|-------|
| APPROVAL_MISSING | 8 |
| DUPLICATE_BILLING | 3 |
| UNAPPROVED_FAMILY | 2 |
| AMOUNT_MISMATCH_EMAIL | 2 |

## 4-Quadrant Analysis

### Q1: Both Flagged (12 rows)
_Agreement — both AI and rules found suspicious_

| SL# | AI Verdict | Primary Category | SAR at Risk | v15.11 Category | AI Reasoning |
|-----|-----------|-----------------|-------------|-----------------|-------------|
| 8 | YELLOW | AMOUNT_MISMATCH_EMAIL | 1,000 | SHARED_OPEX_SPONSORSHIP | Invoice amount is 6000 SAR, but email approval is for 5000 SAR. |
| 9 | RED | UNAPPROVED_FAMILY | 3,000 | NO_FOLDER | Family member traveling without documented approval. |
| 10 | RED | APPROVAL_MISSING | 3,300 | NO_FOLDER | No approval email found for this passenger. |
| 11 | RED | UNAPPROVED_FAMILY | 3,300 | NO_FOLDER | Family member traveling without documented approval. |
| 17 | RED | DUPLICATE_BILLING | 522 | DUP_ROUTE_STRICT | Duplicate billing for the same passenger and route on the same date. |
| 25 | RED | APPROVAL_MISSING | 1,600 | NO_FOLDER | No approval email found for this passenger. |
| 35 | RED | APPROVAL_MISSING | 1,400 | NO_FOLDER | No approval email found for this passenger. |
| 47 | RED | APPROVAL_MISSING | 29,000 | NO_FOLDER | No approval email found for this passenger. |
| 48 | RED | APPROVAL_MISSING | 29,000 | NO_APPROVAL | No approval email found for this passenger. |
| 49 | RED | DUPLICATE_BILLING | 41 | NO_APPROVAL | Duplicate billing for the same passenger and route. |
| 58 | RED | APPROVAL_MISSING | 7,000 | ROUND_AMOUNT | No approval email found for this passenger. |
| 64 | RED | APPROVAL_MISSING | 1,400 | SHARED_OPEX_SPONSORSHIP | No approval email found for this passenger. |

### Q2: AI Only (5 rows)
_AI flagged, rules missed — potential new signals_

| SL# | AI Verdict | Primary Category | SAR at Risk | AI Reasoning |
|-----|-----------|-----------------|-------------|-------------|
| 2 | RED | APPROVAL_MISSING | 1,100 | No approval email found for this passenger. |
| 40 | YELLOW | AMOUNT_MISMATCH_EMAIL | 6,660 | Amount mismatch for registration. |
| 41 | RED | DUPLICATE_BILLING | 207 | Duplicate billing for the same passenger and route. |
| 52 | RED | APPROVAL_MISSING | 4,000 | No approval email found for this passenger. |
| 62 | RED | DUPLICATE_BILLING | 207 | Duplicate billing for the same passenger and route. |

### Q3: Rules Only (27 rows)
_v15.11 flagged, AI cleared — potential false positives in rule engine_

| SL# | v15.11 Category | AI Verdict | AI Reasoning |
|-----|----------------|-----------|-------------|
| 4 | SHARED_OPEX_SPONSORSHIP | CLEAN | Matches approval email. |
| 5 | DUP_ROUTE_STRICT | CLEAN | Matches approval email. |
| 6 | DUP_ROUTE_STRICT | CLEAN | Matches approval email. |
| 12 | DUP_ROUTE_STRICT | CLEAN | Matches approval email. |
| 14 | NO_FOLDER | CLEAN | Matches approval email. |
| 23 | DUP_ROUTE_STRICT | CLEAN | Matches approval email. |
| 26 | NO_APPROVAL | CLEAN | Matches approval email. |
| 28 | NO_FOLDER | CLEAN | Matches approval email. |
| 32 | NO_FOLDER | CLEAN | Matches approval email. |
| 33 | NO_FOLDER | CLEAN | Matches approval email. |
| 34 | NO_FOLDER | CLEAN | Matches approval email. |
| 36 | NO_FOLDER | CLEAN | Matches approval email. |
| 37 | DUP_ROUTE_STRICT | CLEAN | Matches approval email. |
| 42 | DUP_ROUTE_STRICT | CLEAN | Matches approval email. |
| 46 | NO_APPROVAL | CLEAN | Matches approval email. |
| 50 | NO_APPROVAL | CLEAN | Matches approval email. |
| 53 | SHARED_OPEX_SPONSORSHIP | CLEAN | Matches approval email. |
| 54 | SHARED_OPEX_SPONSORSHIP | CLEAN | Matches approval email. |
| 55 | DUP_ROUTE_STRICT | CLEAN | Matches approval email. |
| 65 | SHARED_OPEX_SPONSORSHIP | CLEAN | Matches approval email. |
| 66 | DUP_ROUTE_STRICT | CLEAN | Matches approval email. |
| 67 | DUP_ROUTE_STRICT | CLEAN | Matches approval email. |
| 68 | NO_FOLDER | CLEAN | Matches approval email. |
| 69 | NO_APPROVAL | CLEAN | Matches approval email. |
| 75 | NO_APPROVAL | CLEAN |  |
| 76 | NO_APPROVAL | CLEAN |  |
| 77 | NO_APPROVAL | CLEAN |  |

### Q4: Neither (31 rows)
_Both agree: clean_
_All 31 remaining rows consensus-clean._

## Top 5 AI Cases

### Rank 1: Missing Approval for High Value Tickets (✅ Also in v15.11)
**SL#s:** 47, 48
**Category:** APPROVAL_MISSING
**SAR at Risk:** 58,000.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** No approval emails were found for these high-value tickets.
**Evidence:**
  - [invoice_row] sl_no:47: `ALJEFRI/AHMAD MR`
  - [invoice_row] sl_no:48: `DIRANEYYA/OBAYDA MR`

### Rank 2: Unapproved Family Travel (✅ Also in v15.11)
**SL#s:** 9, 10, 11
**Category:** UNAPPROVED_FAMILY
**SAR at Risk:** 9,600.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** Family members traveling without documented approval.
**Evidence:**
  - [invoice_row] sl_no:9: `HUSSEIN/TALIA MS(CHD)`
  - [invoice_row] sl_no:11: `SALEM/EFFAT MRS`

### Rank 3: Missing Approval for High Value Ticket (✅ Also in v15.11)
**SL#s:** 58
**Category:** APPROVAL_MISSING
**SAR at Risk:** 7,000.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** No approval email found for this passenger.
**Evidence:**
  - [invoice_row] sl_no:58: `ALSULBUD/AHMED MR`
  - [invoice_row] sl_no:58: `7000.0`

### Rank 4: Amount Mismatch for Registration (🆕 AI-only find)
**SL#s:** 40
**Category:** AMOUNT_MISMATCH_EMAIL
**SAR at Risk:** 6,660.00
**Recommended Action:** REQUEST_APPROVAL_RECONFIRMATION
**Reasoning:** Invoice amount is 6660 SAR, but email approval is for 5000 SAR.
**Evidence:**
  - [invoice_row] sl_no:40: `6660.0`
  - [approval_msg] EHRA OPEX CRN-2026-19 Approval.msg: `EHRA 2026 REGISTRATION`

### Rank 5: Missing Approval for Ticket (🆕 AI-only find)
**SL#s:** 52
**Category:** APPROVAL_MISSING
**SAR at Risk:** 4,000.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** No approval email found for this passenger.
**Evidence:**
  - [invoice_row] sl_no:52: `FEHRI/OUSAMA MR`
  - [invoice_row] sl_no:52: `4000.0`

## AI Key Themes

- Missing approvals for high-value tickets
- Unapproved family travel
- Duplicate billing for the same passenger and route

## v15.11 Catches Detail

Categories: {}


### v15.11 Medium NO_APPROVAL
Count: 0, Total: SAR 0.00


---
