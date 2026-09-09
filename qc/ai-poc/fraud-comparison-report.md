# AlJeel AP — AI Consistency Check vs v15.11 Deterministic Rules (v16.2)

**Generated:** 2026-09-03 02:13 UTC
**Schema:** v16.2 — hardened Pydantic v2 + Gemini responseSchema
**Model:** gemini-3.1-pro-preview (Cloudflare AI Gateway, 2M context)

## Telemetry Summary

| Batch | Model | Rows | RED | YELLOW | SAR at Risk | v15.11 Flagged | Cost | Latency | Pydantic |
|-------|-------|------|-----|--------|-------------|----------------|------|---------|----------|
| J26-550 | gemini-3.1-pro-preview | 72 | 26 | 3 | SAR 100,320 | 39 | $2.0116 | 138.0s | ✅ |

## Combined Catches by Category (Both Batches)

| Category | Count |
|----------|-------|
| APPROVAL_MISSING | 18 |
| UNAPPROVED_FAMILY | 3 |
| AMOUNT_MISMATCH_EMAIL | 2 |
| APPROVAL_INVALID | 1 |

---

# AI Consistency Check — J26-550 (Schema v16.2)

**Generated:** 2026-09-03 02:13 UTC
**Schema:** v16.2 (hardened Pydantic + Gemini responseSchema)

## Summary

| Metric | v15.11 Deterministic | AI (Gemini 3.1 Pro) |
|--------|---------------------|----------------------|
| Total rows | 72 | 72 |
| Flagged rows | 39 | 29 |
| RED (high severity) | — | 20 |
| YELLOW (medium severity) | — | 2 |
| CLEAN | — | 50 |
| **Total SAR at risk** | — | **SAR 100,320.35** |

## Catches by Primary Category

| Category | Count |
|----------|-------|
| APPROVAL_MISSING | 18 |
| UNAPPROVED_FAMILY | 3 |
| AMOUNT_MISMATCH_EMAIL | 2 |
| APPROVAL_INVALID | 1 |

## 4-Quadrant Analysis

### Q1: Both Flagged (15 rows)
_Agreement — both AI and rules found suspicious_

| SL# | AI Verdict | Primary Category | SAR at Risk | v15.11 Category | AI Reasoning |
|-----|-----------|-----------------|-------------|-----------------|-------------|
| 4 | RED | APPROVAL_MISSING | 5,000 | SHARED_OPEX_SPONSORSHIP | There is no approval email found for this ticket. |
| 8 | RED | APPROVAL_MISSING | 6,000 | SHARED_OPEX_SPONSORSHIP | There is no approval email found for this ticket. |
| 9 | RED | UNAPPROVED_FAMILY | 3,000 | NO_FOLDER | Family member traveling on company spend without documented approval. |
| 10 | RED | UNAPPROVED_FAMILY | 3,300 | NO_FOLDER | Family member traveling on company spend without documented approval. |
| 11 | RED | UNAPPROVED_FAMILY | 3,300 | NO_FOLDER | Family member traveling on company spend without documented approval. |
| 17 | YELLOW | AMOUNT_MISMATCH_EMAIL | 522 | DUP_ROUTE_STRICT | Invoice amount differs from the amount stated in the approval email. |
| 25 | RED | APPROVAL_MISSING | 1,600 | NO_FOLDER | There is no approval email found for this ticket. |
| 35 | RED | APPROVAL_MISSING | 1,400 | NO_FOLDER | There is no approval email found for this ticket. |
| 42 | RED | APPROVAL_MISSING | 500 | DUP_ROUTE_STRICT | There is no approval email found for this ticket. |
| 47 | RED | APPROVAL_MISSING | 29,000 | NO_FOLDER | There is no approval email found for this ticket. |
| 48 | RED | APPROVAL_MISSING | 29,000 | NO_APPROVAL | There is no approval email found for this ticket. |
| 49 | YELLOW | AMOUNT_MISMATCH_EMAIL | 41 | NO_APPROVAL | Invoice amount differs from the amount stated in the approval email. |
| 58 | RED | APPROVAL_MISSING | 7,000 | ROUND_AMOUNT | There is no approval email found for this ticket. |
| 64 | RED | APPROVAL_MISSING | 1,400 | SHARED_OPEX_SPONSORSHIP | There is no approval email found for this ticket. |
| 69 | RED | APPROVAL_MISSING | 400 | NO_APPROVAL | There is no approval email found for this ticket. |

### Q2: AI Only (14 rows)
_AI flagged, rules missed — potential new signals_

| SL# | AI Verdict | Primary Category | SAR at Risk | AI Reasoning |
|-----|-----------|-----------------|-------------|-------------|
| 2 | RED | APPROVAL_MISSING | 1,100 | There is no approval email found for this ticket. |
| 31 | YELLOW | AMOUNT_MISMATCH_EMAIL | 351 | Invoice amount differs from the amount stated in the approval email. |
| 39 | RED | APPROVAL_INVALID | 16,800 | Self-approval by the traveler. |
| 40 | RED | APPROVAL_MISSING | 6,660 | There is no approval email found for this ticket. |
| 41 | RED | APPROVAL_MISSING | 207 | There is no approval email found for this ticket. |
| 43 | RED | APPROVAL_MISSING | 500 | There is no approval email found for this ticket. |
| 44 | RED | APPROVAL_MISSING | 650 | There is no approval email found for this ticket. |
| 52 | RED | APPROVAL_MISSING | 4,000 | There is no approval email found for this ticket. |
| 59 | RED | APPROVAL_MISSING | 1,000 | There is no approval email found for this ticket. |
| 62 | RED | APPROVAL_MISSING | 207 | There is no approval email found for this ticket. |
| 63 | RED | APPROVAL_MISSING | 550 | There is no approval email found for this ticket. |
| 70 | RED | APPROVAL_MISSING | 500 | There is no approval email found for this ticket. |
| 71 | RED | APPROVAL_MISSING | 500 | There is no approval email found for this ticket. |
| 72 | RED | APPROVAL_MISSING | 430 | There is no approval email found for this ticket. |

### Q3: Rules Only (24 rows)
_v15.11 flagged, AI cleared — potential false positives in rule engine_

| SL# | v15.11 Category | AI Verdict | AI Reasoning |
|-----|----------------|-----------|-------------|
| 5 | DUP_ROUTE_STRICT | CLEAN | Invoice amount matches the approved amount in the email. |
| 6 | DUP_ROUTE_STRICT | CLEAN | Invoice amount matches the approved amount in the email. |
| 12 | DUP_ROUTE_STRICT | CLEAN | Invoice amount matches the approved amount in the email. |
| 14 | NO_FOLDER | CLEAN | Invoice amount matches the approved amount in the email. |
| 23 | DUP_ROUTE_STRICT | CLEAN | Invoice amount matches the approved amount in the email. |
| 26 | NO_APPROVAL | CLEAN | Invoice amount matches the approved amount in the email. |
| 28 | NO_FOLDER | CLEAN | Invoice amount matches the approved amount in the email. |
| 32 | NO_FOLDER | CLEAN | Invoice amount matches the approved amount in the email. |
| 33 | NO_FOLDER | CLEAN | Invoice amount matches the approved amount in the email. |
| 34 | NO_FOLDER | CLEAN | Invoice amount matches the approved amount in the email. |
| 36 | NO_FOLDER | CLEAN | Invoice amount matches the approved amount in the email. |
| 37 | DUP_ROUTE_STRICT | CLEAN | Invoice amount matches the approved amount in the email. |
| 46 | NO_APPROVAL | CLEAN | Invoice amount matches the approved amount in the email. |
| 50 | NO_APPROVAL | CLEAN | Invoice amount matches the approved amount in the email. |
| 53 | SHARED_OPEX_SPONSORSHIP | CLEAN | Invoice amount matches the approved amount in the email. |
| 54 | SHARED_OPEX_SPONSORSHIP | CLEAN | Invoice amount matches the approved amount in the email. |
| 55 | DUP_ROUTE_STRICT | CLEAN | Invoice amount matches the approved amount in the email. |
| 65 | SHARED_OPEX_SPONSORSHIP | CLEAN | Invoice amount matches the approved amount in the email. |
| 66 | DUP_ROUTE_STRICT | CLEAN | Invoice amount matches the approved amount in the email. |
| 67 | DUP_ROUTE_STRICT | CLEAN | Invoice amount matches the approved amount in the email. |
| 68 | NO_FOLDER | CLEAN | Invoice amount matches the approved amount in the email. |
| 75 | NO_APPROVAL | CLEAN |  |
| 76 | NO_APPROVAL | CLEAN |  |
| 77 | NO_APPROVAL | CLEAN |  |

### Q4: Neither (22 rows)
_Both agree: clean_
_All 22 remaining rows consensus-clean._

## Top 5 AI Cases

### Rank 1: Missing Approval for High Value Tickets (✅ Also in v15.11)
**SL#s:** 47, 48
**Category:** APPROVAL_MISSING
**SAR at Risk:** 58,000.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** Two high-value tickets (29,000 SAR each) for passengers ALJEFRI/AHMAD MR and DIRANEYYA/OBAYDA MR lack any approval documentation.
**Evidence:**
  - [computed] approval_msg: `No approval email found for this ticket.`
  - [invoice_row] sl_no 47: `taxable_amount: 29000.0`

### Rank 2: Self-Approval for High Value Ticket (🆕 AI-only find)
**SL#s:** 39
**Category:** APPROVAL_INVALID
**SAR at Risk:** 16,800.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** A high-value ticket (16,800 SAR) for passenger ALTAIR/MOHAMMED MR was self-approved by the traveler.
**Evidence:**
  - [approval_msg] 6904823462: `Approved. Sincerely, Mohammed Al Tair`
  - [invoice_row] sl_no 39: `passenger: ALTAIR/MOHAMMED MR`

### Rank 3: Unapproved Family Travel (✅ Also in v15.11)
**SL#s:** 9, 10, 11
**Category:** UNAPPROVED_FAMILY
**SAR at Risk:** 9,600.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** Three tickets for family members (HUSSEIN/TALIA MS(CHD), HUSSEIN/YOUSSEF MR, SALEM/EFFAT MRS) lack approval documentation.
**Evidence:**
  - [computed] approval_msg: `No approval email found for this ticket.`
  - [invoice_row] sl_no 9: `passenger: HUSSEIN/TALIA MS(CHD)`

### Rank 4: Missing Approval for High Value Ticket (✅ Also in v15.11)
**SL#s:** 58
**Category:** APPROVAL_MISSING
**SAR at Risk:** 7,000.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** A high-value ticket (7,000 SAR) for passenger ALSULBUD/AHMED MR lacks approval documentation.
**Evidence:**
  - [computed] approval_msg: `No approval email found for this ticket.`
  - [invoice_row] sl_no 58: `taxable_amount: 7000.0`

### Rank 5: Missing Approval for High Value Registration (🆕 AI-only find)
**SL#s:** 40
**Category:** APPROVAL_MISSING
**SAR at Risk:** 6,660.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** A high-value registration (6,660 SAR) for passenger MAYSAN ALMEGBEL lacks approval documentation.
**Evidence:**
  - [computed] approval_msg: `No approval email found for this ticket.`
  - [invoice_row] sl_no 40: `taxable_amount: 6660.0`

## AI Key Themes

- Missing approval documentation for high-value tickets
- Unapproved family travel
- Self-approval by travelers

## v15.11 Catches Detail

Categories: {}


### v15.11 Medium NO_APPROVAL
Count: 0, Total: SAR 0.00


---
