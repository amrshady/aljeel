# Color Coding Rules — Row-Level Classification

## Row State Decision Tree

```
IF hard gate failures → RED (DO NOT POST)
ELIF any QC catch with severity=HARD → RED
ELIF any flag in REVIEW_WORTHY set → YELLOW (needs human review)
ELIF resolution confidence < 0.9 → YELLOW
ELSE → GREEN (auto-postable)
```

## Review-Worthy Flags (force YELLOW)

| Flag | Meaning |
|------|---------|
| `FORM_EMP_NO_MISMATCH` | Form employee different from Manpower match |
| `EMPLOYEE_NOT_IN_MASTER` | Employee not found in Manpower |
| `ALLOCATION_TARGET_MISSING` | Need-to-allocate without subordinate |
| `MULTI_ALLOCATION_PENDING_REVIEW` | Multiple allocation candidates |
| `MANAGER_NOT_REALLOCATED` | Manager traveling without allocation |
| `EMPLOYEE_AS_SPONSORED` | Pax in Manpower but routed to Sponsoring |
| `SOLUTION_CODE_PENDING` | Solution code needs resolution |
| `TRIP_PURPOSE_UNKNOWN` | No trip purpose signal detected |
| `MIXED_FAMILY_CLUSTER` | Mixed business/personal family cluster |
| `FORM_APPROVER_NOT_LINE_MANAGER` | Form approver differs from line manager |
| `ACCOUNT_DEFAULT_FALLBACK` | Fell to Rule 99 default |
| `DUP_ROUTE_STRICT` | Same pax + route ±2 days (within-batch) |
| `NO_APPROVAL` | No .msg approval email found |
| `EMD_MISMATCH` | Change-fee ticket without matching original |
| `OVER_LIMIT` | Amount exceeds grade ceiling |
| `ROUND_AMOUNT` | Suspiciously round amount |
| `CROSS_BATCH_DUPLICATE_TICKET` | Same ticket in two batches |
| `POTENTIAL_REBOOKING_FRAUD` | Similar rebooking across batches |
| `FREQUENT_TRAVELER_OVER_BUDGET` | YTD travel > 90% of annual cap |
| `PASSENGER_AMOUNT_PATTERN` | 3+ trips at same SAR within 60 days |
| `PERSONAL_LOW_CONFIDENCE` | Personal classification with low confidence |
| `TRIP_PURPOSE_MISMATCH` | Purpose signals conflict |

## Informational Flags (GREEN-OK)

| Flag | Meaning |
|------|---------|
| `FORM_AGREES_WITH_MANPOWER` | Form confirms Manpower data |
| `FORM_NOT_FOUND_IN_EMAIL` | No .msg found (not a problem if resolved otherwise) |
| `FORM_TRIP_VALUE_DIFFERS` | Allowance vs actual (expected by design) |
| `FORM_FUSION_CODES_LOGGED` | Fusion codes logged for mapping |
| `MANPOWER_DIV_NOT_IN_MASTER` | DIV 192/194/196 (valid combos) |
| `ALLOCATION_RESOLVED_HIERARCHY` | Auto-resolved via single subordinate |
| `ALLOCATION_RESOLVED_DETERMINISTIC` | Auto-resolved via .msg parsing |
| `OPEX_PDF_PARSED` | OPEX PDF parsed successfully |
| `FAMILY_CLUSTER_DETECTED` | Family cluster identified |
| `ACCOUNT_OVERRIDE_APPLIED` | Account auto-overridden by classifier |
| `SPONSORSHIP_DETECTED` | Sponsorship route detected |
| `RESOLVED_VIA_*` | Any resolution trace flag |

## Visual Styling

| Status | Fill Color | Font Color | Meaning |
|--------|-----------|------------|---------|
| 🟢 GREEN | `#C6EFCE` | `#006100` | Auto-postable |
| 🟡 YELLOW | `#FFEB9C` | `#9C5700` | Needs human review |
| 🔴 RED | `#FFC7CE` | `#9C0006` | DO NOT POST |
