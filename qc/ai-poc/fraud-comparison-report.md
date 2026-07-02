# AlJeel AP — AI Consistency Check vs v15.11 Deterministic Rules (v16.2)

**Generated:** 2026-06-29 10:18 UTC
**Schema:** v16.2 — hardened Pydantic v2 + Gemini responseSchema
**Model:** gemini-3.1-pro-preview (Cloudflare AI Gateway, 2M context)

## Telemetry Summary

| Batch | Model | Rows | RED | YELLOW | SAR at Risk | v15.11 Flagged | Cost | Latency | Pydantic |
|-------|-------|------|-----|--------|-------------|----------------|------|---------|----------|
| J26-939 | gemini-3.1-pro-preview | 120 | 53 | 36 | SAR 100,000 | 69 | $1.9509 | 491.9s | ✅ |

## Combined Catches by Category (Both Batches)

| Category | Count |
|----------|-------|
| APPROVAL_MISSING | 45 |
| UNAPPROVED_FAMILY | 3 |
| DUPLICATE_BILLING | 2 |

---

# AI Consistency Check — J26-939 (Schema v16.2)

**Generated:** 2026-06-29 10:18 UTC
**Schema:** v16.2 (hardened Pydantic + Gemini responseSchema)

## Summary

| Metric | v15.11 Deterministic | AI (Gemini 3.1 Pro) |
|--------|---------------------|----------------------|
| Total rows | 120 | 120 |
| Flagged rows | 69 | 89 |
| RED (high severity) | — | 30 |
| YELLOW (medium severity) | — | 20 |
| CLEAN | — | 70 |
| **Total SAR at risk** | — | **SAR 100,000.00** |

## Catches by Primary Category

| Category | Count |
|----------|-------|
| APPROVAL_MISSING | 45 |
| UNAPPROVED_FAMILY | 3 |
| DUPLICATE_BILLING | 2 |

## 4-Quadrant Analysis

### Q1: Both Flagged (65 rows)
_Agreement — both AI and rules found suspicious_

| SL# | AI Verdict | Primary Category | SAR at Risk | v15.11 Category | AI Reasoning |
|-----|-----------|-----------------|-------------|-----------------|-------------|
| 4 | YELLOW | APPROVAL_MISSING | 500 | NO_FOLDER | Missing approval folder. |
| 6 | YELLOW | APPROVAL_MISSING | 545 | NO_FOLDER | Missing approval folder. |
| 9 | YELLOW | UNAPPROVED_FAMILY | 710 | NO_FOLDER | Family ticket missing HR approval. |
| 10 | YELLOW | UNAPPROVED_FAMILY | 710 | NO_FOLDER | Family ticket missing HR approval. |
| 11 | YELLOW | APPROVAL_MISSING | 730 | NO_FOLDER | Missing approval folder. |
| 12 | YELLOW | UNAPPROVED_FAMILY | 1,070 | NO_FOLDER | Family ticket missing HR approval. |
| 13 | YELLOW | UNAPPROVED_FAMILY | 1,070 | NO_FOLDER | Family ticket missing HR approval. |
| 14 | YELLOW | APPROVAL_MISSING | 1,300 | NO_FOLDER | Missing approval folder. |
| 17 | YELLOW | APPROVAL_MISSING | 6,500 | SHARED_OPEX_SPONSORSHIP | Missing approval. |
| 18 | YELLOW | APPROVAL_MISSING | 2,200 | SHARED_OPEX_SPONSORSHIP | Missing approval. |
| 19 | YELLOW | APPROVAL_MISSING | 2,200 | SHARED_OPEX_SPONSORSHIP | Missing approval. |
| 20 | YELLOW | APPROVAL_MISSING | 2,200 | SHARED_OPEX_SPONSORSHIP | Missing approval. |
| 21 | YELLOW | APPROVAL_MISSING | 2,200 | SHARED_OPEX_SPONSORSHIP | Missing approval. |
| 22 | RED | APPROVAL_MISSING | 8,900 | NO_APPROVAL | No approval and missing evidence. |
| 23 | RED | APPROVAL_MISSING | 920 | NO_APPROVAL | No approval and missing evidence. |
| 24 | RED | APPROVAL_MISSING | 920 | NO_APPROVAL | No approval and missing evidence. |
| 25 | RED | APPROVAL_MISSING | 920 | NO_APPROVAL | No approval and missing evidence. |
| 26 | RED | APPROVAL_MISSING | 410 | NO_APPROVAL | No approval and missing evidence. |
| 29 | YELLOW | DUPLICATE_BILLING | 2,160 | DUP_ROUTE_STRICT | Duplicate route detected. |
| 31 | RED | APPROVAL_MISSING | 450 | NO_FOLDER | Missing approval folder. |
| 32 | YELLOW | DUPLICATE_BILLING | 718 | DUP_ROUTE_STRICT | Duplicate route detected. |
| 38 | RED | APPROVAL_MISSING | 5,900 | NO_APPROVAL | No approval and missing evidence. |
| 39 | RED | APPROVAL_MISSING | 410 | NO_APPROVAL | No approval and missing evidence. |
| 41 | YELLOW | APPROVAL_MISSING | 520 | NO_FOLDER | Missing approval folder. |
| 45 | YELLOW | APPROVAL_MISSING | 2,140 | SHARED_OPEX_SPONSORSHIP | Missing approval. |
| 46 | YELLOW | DUPLICATE_BILLING | 1,000 | DUP_ROUTE_STRICT | Duplicate route detected. |
| 48 | RED | APPROVAL_MISSING | 300 | DUP_ROUTE_STRICT | Missing approval folder. |
| 49 | RED | APPROVAL_MISSING | 570 | NO_FOLDER | Missing approval folder. |
| 50 | RED | APPROVAL_MISSING | 570 | NO_FOLDER | Missing approval folder. |
| 51 | RED | APPROVAL_MISSING | 505 | NO_FOLDER | Missing approval folder. |
| 52 | RED | APPROVAL_MISSING | 505 | NO_FOLDER | Missing approval folder. |
| 53 | RED | APPROVAL_MISSING | 220 | DUP_ROUTE_STRICT | Missing approval folder. |
| 54 | RED | APPROVAL_MISSING | 1,250 | NO_APPROVAL | No approval and missing evidence. |
| 63 | YELLOW | APPROVAL_MISSING | 1,240 | NO_FOLDER | Missing approval folder. |
| 66 | RED | APPROVAL_MISSING | 1,500 | NO_APPROVAL | No approval. |
| 73 | RED | APPROVAL_MISSING | 2,700 | NO_APPROVAL | No approval and missing evidence. |
| 74 | RED | APPROVAL_MISSING | 1,220 | NO_APPROVAL | No approval and missing evidence. |
| 75 | RED | APPROVAL_MISSING | 24,200 | NO_APPROVAL | No approval and missing evidence. |
| 76 | RED | APPROVAL_MISSING | 3,900 | NO_APPROVAL | No approval and missing evidence. |
| 77 | RED | APPROVAL_MISSING | 1,480 | NO_APPROVAL | No approval and missing evidence. |
| 78 | RED | APPROVAL_MISSING | 520 | NO_APPROVAL | No approval and missing evidence. |
| 79 | RED | APPROVAL_MISSING | 520 | NO_APPROVAL | No approval and missing evidence. |
| 80 | RED | APPROVAL_MISSING | 100 | NO_APPROVAL | No approval and missing evidence. |
| 81 | RED | APPROVAL_MISSING | 770 | NO_APPROVAL | No approval. |
| 82 | RED | APPROVAL_MISSING | 600 | NO_FOLDER | Missing approval folder. |
| 84 | YELLOW | APPROVAL_MISSING | 2,000 | NO_FOLDER | Missing approval folder. |
| 85 | YELLOW | APPROVAL_MISSING | 2,000 | SHARED_OPEX_SPONSORSHIP | Missing approval. |
| 86 | YELLOW | APPROVAL_MISSING | 2,000 | NO_FOLDER | Missing approval folder. |
| 87 | YELLOW | APPROVAL_MISSING | 2,000 | NO_FOLDER | Missing approval folder. |
| 88 | YELLOW | APPROVAL_MISSING | 2,000 | NO_FOLDER | Missing approval folder. |
| 91 | YELLOW | APPROVAL_MISSING | 510 | SHARED_OPEX_SPONSORSHIP | Missing approval. |
| 92 | RED | APPROVAL_MISSING | 800 | NO_APPROVAL | No approval. |
| 93 | RED | APPROVAL_MISSING | 800 | NO_APPROVAL | No approval and missing evidence. |
| 94 | RED | APPROVAL_MISSING | 800 | NO_APPROVAL | No approval and missing evidence. |
| 95 | RED | APPROVAL_MISSING | 800 | NO_APPROVAL | No approval and missing evidence. |
| 96 | RED | APPROVAL_MISSING | 800 | NO_APPROVAL | No approval and missing evidence. |
| 97 | RED | APPROVAL_MISSING | 200 | NO_APPROVAL | No approval and missing evidence. |
| 100 | YELLOW | APPROVAL_MISSING | 560 | NO_FOLDER | Missing approval folder. |
| 104 | RED | APPROVAL_MISSING | 360 | NO_FOLDER | Missing approval folder. |
| 107 | YELLOW | DUPLICATE_BILLING | 860 | DUP_ROUTE_STRICT | Duplicate route detected. |
| 108 | YELLOW | APPROVAL_MISSING | 26,000 | SHARED_OPEX_SPONSORSHIP | Missing approval. |
| 112 | YELLOW | DUPLICATE_BILLING | 1,640 | DUP_ROUTE_STRICT | Duplicate route detected. |
| 118 | RED | APPROVAL_MISSING | 1,110 | DUP_ROUTE_STRICT | Missing approval folder and evidence. |
| 119 | RED | APPROVAL_MISSING | 6,110 | NO_FOLDER | Missing approval folder and evidence. |
| 120 | RED | APPROVAL_MISSING | 1,200 | NO_APPROVAL | No approval and missing evidence. |

### Q2: AI Only (24 rows)
_AI flagged, rules missed — potential new signals_

| SL# | AI Verdict | Primary Category | SAR at Risk | AI Reasoning |
|-----|-----------|-----------------|-------------|-------------|
| 16 | RED | APPROVAL_MISSING | 1,260 | Missing approval. |
| 28 | RED | APPROVAL_MISSING | 1,130 | Missing allocation target. |
| 30 | RED | APPROVAL_MISSING | 460 | Missing allocation target. |
| 34 | RED | APPROVAL_MISSING | 1,270 | Missing allocation target. |
| 37 | RED | APPROVAL_MISSING | 5,900 | Missing evidence. |
| 40 | YELLOW | APPROVAL_MISSING | 520 | Manpower division not in master. |
| 42 | YELLOW | APPROVAL_MISSING | 2,130 | Trip purpose unknown. |
| 44 | YELLOW | APPROVAL_MISSING | 1,710 | Missing HR approval. |
| 47 | RED | APPROVAL_MISSING | 1,900 | Missing allocation target. |
| 55 | RED | APPROVAL_MISSING | 1,410 | Missing allocation target. |
| 56 | RED | APPROVAL_MISSING | 1,140 | Missing allocation target. |
| 57 | YELLOW | APPROVAL_MISSING | 1,000 | Employee number mismatch. |
| 59 | YELLOW | APPROVAL_MISSING | 3,610 | Trip value differs. |
| 60 | RED | APPROVAL_MISSING | 970 | Missing allocation target. |
| 61 | RED | APPROVAL_MISSING | 1,130 | Missing allocation target. |
| 70 | RED | APPROVAL_MISSING | 900 | Missing allocation target. |
| 71 | RED | APPROVAL_MISSING | 1,510 | Missing allocation target. |
| 89 | RED | APPROVAL_MISSING | 950 | Missing allocation target. |
| 90 | YELLOW | APPROVAL_MISSING | 710 | Missing approval. |
| 98 | RED | APPROVAL_MISSING | 600 | Missing allocation target. |
| 99 | YELLOW | APPROVAL_MISSING | 600 | Missing HR approval. |
| 103 | RED | APPROVAL_MISSING | 460 | Missing allocation target. |
| 111 | RED | APPROVAL_MISSING | 1,260 | Missing allocation target. |
| 116 | RED | APPROVAL_MISSING | 1,130 | Missing allocation target. |

### Q3: Rules Only (4 rows)
_v15.11 flagged, AI cleared — potential false positives in rule engine_

| SL# | v15.11 Category | AI Verdict | AI Reasoning |
|-----|----------------|-----------|-------------|
| 27 | NO_FOLDER | CLEAN | Row appears clean. |
| 62 | NO_FOLDER | CLEAN | Row appears clean. |
| 121 | NO_APPROVAL | CLEAN |  |
| 122 | NO_APPROVAL | CLEAN |  |

### Q4: Neither (29 rows)
_Both agree: clean_
_All 29 remaining rows consensus-clean._

## Top 5 AI Cases

### Rank 1: Missing Approval and Evidence for 24200 SAR (✅ Also in v15.11)
**SL#s:** 75
**Category:** APPROVAL_MISSING
**SAR at Risk:** 24,200.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** Row 75 has no approval and is missing evidence for a large amount.
**Evidence:**
  - [invoice_row] sl_no:75: `NO_APPROVAL(HIGH) | MISSING_EVIDENCE(HARD)`
  - [invoice_row] sl_no:75: `EMPLOYEE_NOT_IN_MASTER`

### Rank 2: Missing Approval for 26000 SAR (✅ Also in v15.11)
**SL#s:** 108
**Category:** APPROVAL_MISSING
**SAR at Risk:** 26,000.01
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** Row 108 is missing approval for a large amount.
**Evidence:**
  - [invoice_row] sl_no:108: `FORM_NOT_FOUND_IN_EMAIL`
  - [invoice_row] sl_no:108: `TRIP_PURPOSE_UNKNOWN`

### Rank 3: Missing Approval and Evidence for 8900 SAR (✅ Also in v15.11)
**SL#s:** 22
**Category:** APPROVAL_MISSING
**SAR at Risk:** 8,900.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** Row 22 has no approval and is missing evidence.
**Evidence:**
  - [invoice_row] sl_no:22: `NO_APPROVAL(HIGH) | MISSING_EVIDENCE(HARD)`
  - [invoice_row] sl_no:22: `EMPLOYEE_NOT_IN_MASTER`

### Rank 4: Missing Approval and Evidence for 5900 SAR (🆕 AI-only find)
**SL#s:** 37
**Category:** APPROVAL_MISSING
**SAR at Risk:** 5,900.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** Row 37 has no approval and is missing evidence.
**Evidence:**
  - [invoice_row] sl_no:37: `MISSING_EVIDENCE(HARD)`
  - [invoice_row] sl_no:37: `FORM_NOT_FOUND_IN_EMAIL`

### Rank 5: Missing Approval and Evidence for 5900 SAR (✅ Also in v15.11)
**SL#s:** 38
**Category:** APPROVAL_MISSING
**SAR at Risk:** 5,900.00
**Recommended Action:** REJECT_INVOICE_ROW
**Reasoning:** Row 38 has no approval and is missing evidence.
**Evidence:**
  - [invoice_row] sl_no:38: `NO_APPROVAL(HIGH) | MISSING_EVIDENCE(HARD)`
  - [invoice_row] sl_no:38: `FORM_NOT_FOUND_IN_EMAIL`

## AI Key Themes

- Missing approvals and evidence for several high-value rows.
- Family tickets missing HR approval.
- Duplicate billing detected for some routes.

## v15.11 Catches Detail

Categories: {}


### v15.11 Medium NO_APPROVAL
Count: 0, Total: SAR 0.00


---
