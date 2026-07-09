# AlJeel AP — AI Consistency Check vs v15.11 Deterministic Rules (v16.2)

**Generated:** 2026-07-09 00:09 UTC
**Schema:** v16.2 — hardened Pydantic v2 + Gemini responseSchema
**Model:** gemini-3.1-pro-preview (Cloudflare AI Gateway, 2M context)

## Telemetry Summary

| Batch | Model | Rows | RED | YELLOW | SAR at Risk | v15.11 Flagged | Cost | Latency | Pydantic |
|-------|-------|------|-----|--------|-------------|----------------|------|---------|----------|
| J26-1029 | gemini-3.1-pro-preview | 120 | 49 | 44 | SAR 150,000 | 76 | $0.9961 | 126.6s | ✅ |

## Combined Catches by Category (Both Batches)

| Category | Count |
|----------|-------|
| APPROVAL_MISSING | 50 |
| OTHER | 24 |
| DUPLICATE_BILLING | 10 |

---

# AI Consistency Check — J26-1029 (Schema v16.2)

**Generated:** 2026-07-09 00:09 UTC
**Schema:** v16.2 (hardened Pydantic + Gemini responseSchema)

## Summary

| Metric | v15.11 Deterministic | AI (Gemini 3.1 Pro) |
|--------|---------------------|----------------------|
| Total rows | 120 | 120 |
| Flagged rows | 76 | 93 |
| RED (high severity) | — | 49 |
| YELLOW (medium severity) | — | 44 |
| CLEAN | — | 27 |
| **Total SAR at risk** | — | **SAR 150,000.00** |

## Catches by Primary Category

| Category | Count |
|----------|-------|
| APPROVAL_MISSING | 50 |
| OTHER | 24 |
| DUPLICATE_BILLING | 10 |

## 4-Quadrant Analysis

### Q1: Both Flagged (69 rows)
_Agreement — both AI and rules found suspicious_

| SL# | AI Verdict | Primary Category | SAR at Risk | v15.11 Category | AI Reasoning |
|-----|-----------|-----------------|-------------|-----------------|-------------|
| 1 | RED | DUPLICATE_BILLING | 777 | DUP_ROUTE_STRICT | Duplicate route detected. |
| 4 | YELLOW | APPROVAL_MISSING | 1,230 | NO_FOLDER | Missing approval folder. |
| 7 | YELLOW | APPROVAL_MISSING | 920 | NO_FOLDER | Missing approval folder. |
| 10 | YELLOW | DUPLICATE_BILLING | 950 | DUP_ROUTE_STRICT | Duplicate route and missing folder. |
| 11 | YELLOW | APPROVAL_MISSING | 0 | NO_FOLDER | Missing approval folder. |
| 12 | RED | APPROVAL_MISSING | 5,300 | NO_APPROVAL | No approval found. |
| 13 | RED | APPROVAL_MISSING | 3,600 | NO_APPROVAL | No approval found. |
| 14 | RED | APPROVAL_MISSING | 1,200 | NO_APPROVAL | No approval found. |
| 15 | RED | APPROVAL_MISSING | 4,250 | NO_APPROVAL | No approval found. |
| 16 | YELLOW | DUPLICATE_BILLING | 250 | DUP_ROUTE_STRICT | Duplicate route and missing folder. |
| 17 | RED | APPROVAL_MISSING | 165 | NO_APPROVAL | No approval found. |
| 20 | YELLOW | APPROVAL_MISSING | 15,500 | NO_FOLDER | Missing approval folder. |
| 21 | YELLOW | APPROVAL_MISSING | 12,000 | NO_FOLDER | Missing approval folder. |
| 22 | YELLOW | APPROVAL_MISSING | 9,000 | NO_FOLDER | Missing approval folder. |
| 23 | YELLOW | APPROVAL_MISSING | 1,000 | NO_FOLDER | Missing approval folder. |
| 24 | YELLOW | APPROVAL_MISSING | 9,000 | NO_FOLDER | Missing approval folder. |
| 30 | YELLOW | OTHER | 1,060 | PASSENGER_AMOUNT_PATTERN (XB) | Trip value differs. |
| 33 | YELLOW | APPROVAL_MISSING | 575 | NO_FOLDER | Missing approval folder. |
| 35 | RED | APPROVAL_MISSING | 600 | NO_APPROVAL | No approval found. |
| 36 | RED | APPROVAL_MISSING | 500 | NO_APPROVAL | No approval found. |
| 37 | RED | APPROVAL_MISSING | 375 | NO_APPROVAL | No approval found. |
| 38 | RED | APPROVAL_MISSING | 375 | NO_APPROVAL | No approval found. |
| 40 | RED | APPROVAL_MISSING | 835 | NO_APPROVAL | No approval found. |
| 42 | YELLOW | DUPLICATE_BILLING | 11,000 | DUP_ROUTE_STRICT | Duplicate route and missing folder. |
| 44 | YELLOW | DUPLICATE_BILLING | 500 | DUP_ROUTE_STRICT | Duplicate route and missing folder. |
| 47 | RED | APPROVAL_MISSING | 455 | NO_FOLDER | Missing approval folder. |
| 48 | YELLOW | APPROVAL_MISSING | 455 | NO_FOLDER | Missing approval folder. |
| 51 | RED | APPROVAL_MISSING | 800 | NO_APPROVAL | No approval found. |
| 52 | RED | APPROVAL_MISSING | 800 | NO_APPROVAL | No approval found. |
| 53 | RED | APPROVAL_MISSING | 1,980 | NO_APPROVAL | No approval found. |
| 54 | RED | APPROVAL_MISSING | 1,850 | NO_APPROVAL | No approval found. |
| 55 | RED | APPROVAL_MISSING | 1,850 | NO_APPROVAL | No approval found. |
| 56 | RED | APPROVAL_MISSING | 2,100 | NO_APPROVAL | No approval found. |
| 57 | RED | APPROVAL_MISSING | 4,200 | NO_APPROVAL | No approval found. |
| 58 | RED | APPROVAL_MISSING | 1,850 | NO_APPROVAL | No approval found. |
| 59 | RED | APPROVAL_MISSING | 1,850 | NO_APPROVAL | No approval found. |
| 60 | RED | APPROVAL_MISSING | 1,850 | NO_APPROVAL | No approval found. |
| 61 | RED | APPROVAL_MISSING | 1,850 | NO_APPROVAL | No approval found. |
| 62 | RED | APPROVAL_MISSING | 14,800 | NO_APPROVAL | No approval found. |
| 63 | RED | APPROVAL_MISSING | 14,800 | NO_APPROVAL | No approval found. |
| 64 | RED | APPROVAL_MISSING | 5,300 | NO_APPROVAL | No approval found. |
| 65 | RED | APPROVAL_MISSING | 5,300 | NO_APPROVAL | No approval found. |
| 66 | RED | APPROVAL_MISSING | 190 | NO_APPROVAL | No approval found. |
| 67 | YELLOW | APPROVAL_MISSING | 0 | NO_FOLDER | Missing approval folder. |
| 70 | YELLOW | APPROVAL_MISSING | 730 | NO_FOLDER | Missing approval folder. |
| 75 | YELLOW | APPROVAL_MISSING | 850 | NO_FOLDER | Missing approval folder. |
| 80 | RED | APPROVAL_MISSING | 850 | NO_FOLDER | Missing approval folder. |
| 81 | YELLOW | APPROVAL_MISSING | 18,000 | NO_FOLDER | Missing approval folder. |
| 82 | YELLOW | APPROVAL_MISSING | 6,500 | NO_FOLDER | Missing approval folder. |
| 83 | RED | APPROVAL_MISSING | 490 | NO_APPROVAL | No approval found. |
| 84 | RED | APPROVAL_MISSING | 190 | NO_APPROVAL | No approval found. |
| 86 | YELLOW | APPROVAL_MISSING | 2,900 | NO_FOLDER | Missing approval folder. |
| 89 | YELLOW | APPROVAL_MISSING | 2,000 | NO_FOLDER | Missing approval folder. |
| 90 | YELLOW | APPROVAL_MISSING | 2,000 | NO_FOLDER | Missing approval folder. |
| 91 | YELLOW | APPROVAL_MISSING | 2,000 | NO_FOLDER | Missing approval folder. |
| 92 | YELLOW | APPROVAL_MISSING | 3,000 | NO_FOLDER | Missing approval folder. |
| 94 | YELLOW | APPROVAL_MISSING | 482 | NO_FOLDER | Missing approval folder. |
| 97 | YELLOW | APPROVAL_MISSING | 430 | NO_FOLDER | Missing approval folder. |
| 100 | YELLOW | APPROVAL_MISSING | 640 | NO_FOLDER | Missing approval folder. |
| 104 | YELLOW | APPROVAL_MISSING | 16,000 | NO_FOLDER | Missing approval folder. |
| 106 | RED | APPROVAL_MISSING | 9,800 | NO_APPROVAL | No approval found. |
| 107 | RED | APPROVAL_MISSING | 200 | NO_APPROVAL | No approval found. |
| 108 | RED | APPROVAL_MISSING | 200 | NO_APPROVAL | No approval found. |
| 109 | YELLOW | DUPLICATE_BILLING | 800 | DUP_ROUTE_STRICT | Duplicate route and missing folder. |
| 110 | YELLOW | DUPLICATE_BILLING | 1,500 | DUP_ROUTE_STRICT | Duplicate route and missing folder. |
| 112 | YELLOW | APPROVAL_MISSING | 15,000 | NO_FOLDER | Missing approval folder. |
| 113 | YELLOW | APPROVAL_MISSING | 15,000 | NO_FOLDER | Missing approval folder. |
| 119 | RED | APPROVAL_MISSING | 675 | NO_FOLDER | Missing approval folder. |
| 120 | RED | DUPLICATE_BILLING | 675 | DUP_ROUTE_STRICT | Duplicate route and missing folder. |

### Q2: AI Only (24 rows)
_AI flagged, rules missed — potential new signals_

| SL# | AI Verdict | Primary Category | SAR at Risk | AI Reasoning |
|-----|-----------|-----------------|-------------|-------------|
| 3 | YELLOW | OTHER | 530 | Trip value differs. |
| 5 | YELLOW | APPROVAL_MISSING | 516 | Form not found in email. |
| 6 | YELLOW | OTHER | 510 | Trip value differs. |
| 25 | RED | OTHER | 1,375 | Allocation target missing. |
| 26 | RED | OTHER | 430 | Allocation target missing. |
| 27 | RED | OTHER | 1,065 | Allocation target missing. |
| 31 | YELLOW | OTHER | 1,015 | Trip value differs. |
| 34 | RED | OTHER | 1,290 | Allocation target missing. |
| 39 | YELLOW | APPROVAL_MISSING | 920 | Form not found in email. |
| 41 | RED | OTHER | 2,150 | Allocation target missing. |
| 43 | RED | OTHER | 1,556 | Allocation target missing. |
| 49 | RED | OTHER | 775 | Allocation target missing. |
| 50 | YELLOW | OTHER | 775 | Trip value differs. |
| 69 | YELLOW | OTHER | 570 | Trip value differs. |
| 71 | RED | OTHER | 1,125 | Allocation target missing. |
| 72 | RED | OTHER | 1,035 | Allocation target missing. |
| 79 | RED | OTHER | 755 | Allocation target missing. |
| 85 | YELLOW | OTHER | 2,850 | Trip value differs. |
| 88 | RED | OTHER | 1,125 | Allocation target missing. |
| 93 | YELLOW | OTHER | 758 | Trip value differs. |
| 96 | YELLOW | OTHER | 550 | Trip value differs. |
| 99 | YELLOW | OTHER | 900 | Trip value differs. |
| 117 | RED | OTHER | 1,290 | Allocation target missing. |
| 118 | RED | OTHER | 565 | Allocation target missing. |

### Q3: Rules Only (7 rows)
_v15.11 flagged, AI cleared — potential false positives in rule engine_

| SL# | v15.11 Category | AI Verdict | AI Reasoning |
|-----|----------------|-----------|-------------|
| 123 | NO_FOLDER | CLEAN |  |
| 124 | NO_APPROVAL | CLEAN |  |
| 125 | NO_APPROVAL | CLEAN |  |
| 126 | NO_APPROVAL | CLEAN |  |
| 127 | NO_APPROVAL | CLEAN |  |
| 128 | NO_APPROVAL | CLEAN |  |
| 129 | NO_APPROVAL | CLEAN |  |

### Q4: Neither (27 rows)
_Both agree: clean_
_All 27 remaining rows consensus-clean._

## Top 5 AI Cases

### Rank 1: High value tickets missing approval (✅ Also in v15.11)
**SL#s:** 112, 113
**Category:** APPROVAL_MISSING
**SAR at Risk:** 30,000.00
**Recommended Action:** REQUEST_APPROVAL_RECONFIRMATION
**Reasoning:** Two tickets for 15000 SAR each with no approval folder found.
**Evidence:**
  - [computed] qc_catches_v30: `NO_FOLDER(HIGH)`
  - [invoice_row] total_amount: `15000.0`

### Rank 2: High value hotel bookings missing approval (✅ Also in v15.11)
**SL#s:** 62, 63
**Category:** APPROVAL_MISSING
**SAR at Risk:** 29,600.00
**Recommended Action:** REQUEST_APPROVAL_RECONFIRMATION
**Reasoning:** Two hotel bookings for 14800 SAR each with no approval found.
**Evidence:**
  - [computed] qc_catches_v30: `NO_APPROVAL(HIGH)`
  - [invoice_row] total_amount: `14800.0`

### Rank 3: High value ticket missing approval (✅ Also in v15.11)
**SL#s:** 81
**Category:** APPROVAL_MISSING
**SAR at Risk:** 18,000.00
**Recommended Action:** REQUEST_APPROVAL_RECONFIRMATION
**Reasoning:** Ticket for 18000 SAR with no approval folder found.
**Evidence:**
  - [computed] qc_catches_v30: `NO_FOLDER(HIGH)`
  - [invoice_row] total_amount: `18000.0`

### Rank 4: High value ticket missing approval (✅ Also in v15.11)
**SL#s:** 104
**Category:** APPROVAL_MISSING
**SAR at Risk:** 16,000.00
**Recommended Action:** REQUEST_APPROVAL_RECONFIRMATION
**Reasoning:** Ticket for 16000 SAR with no approval folder found.
**Evidence:**
  - [computed] qc_catches_v30: `NO_FOLDER(HIGH)`
  - [invoice_row] total_amount: `16000.0`

### Rank 5: High value ticket missing approval (✅ Also in v15.11)
**SL#s:** 20
**Category:** APPROVAL_MISSING
**SAR at Risk:** 15,500.00
**Recommended Action:** REQUEST_APPROVAL_RECONFIRMATION
**Reasoning:** Ticket for 15500 SAR with no approval folder found.
**Evidence:**
  - [computed] qc_catches_v30: `NO_FOLDER(HIGH)`
  - [invoice_row] total_amount: `15500.0`

## AI Key Themes

- Missing approvals for high value tickets
- Duplicate billing on specific routes

## v15.11 Catches Detail

Categories: {}


### v15.11 Medium NO_APPROVAL
Count: 0, Total: SAR 0.00


---
