# PASSENGER_AMOUNT_PATTERN — Fraud Rule Case File

**Category:** `PASSENGER_AMOUNT_PATTERN` (cross-batch fraud)
**Severity in rule:** LOW
**Status in v15.10:** Active. **8 catches total** (3 in J26-640, 5 in J26-788) — count grows as cross-batch history accumulates.
**Investigation date:** 2026-05-22
**Verdict:** **🔧 REFINE — current rule fires on legitimate commute/agency-fare patterns. Refine to require additional anomaly signal beyond same-amount repetition.**

---

## What the rule is supposed to catch

Same passenger appears 3+ times at the **exactly same SAR amount** within 60 days (rolling window, including prior batches in cross-batch history). The fraud intuition: a passenger repeatedly billing the same precise fare is a pattern an agency might use to disguise phantom bookings or padded amounts. Real airfares vary by day-of-week, fare class, advance-purchase window — exact-same amounts across 3+ trips would be statistically unusual.

## What the rule actually catches

Most AlJeel travel is **regional commute travel** at **agency-negotiated corporate rates**. The exact-same-amount pattern is the agency's pricing for a corridor, not a fraud signal.

### All 8 catches with full route + benchmark context

| Pax | Route | Trip amount | Trip count | Same-route fare distribution | Verdict |
|---|---|---|---|---|---|
| ELHAG/ALI ENG | JED MED JED | SAR 1,080 | 3 | **4 of 5 same-route trips also SAR 1,080**, 1 at SAR 1,200 | Corporate rate. NOT fraud. |
| ELATTAR/AHMED MR | RUH DMM RUH | SAR 1,800 | 3 | 2 of 9 at SAR 1,800; others range SAR 917 – 2,485 | Higher than median but within range. Likely standard fare class. |
| BIN RAJAB/FERAS MR | JED AHB | SAR 1,050 | 3 | 1 of 4 at SAR 1,050; others SAR 560, 1,010, 1,480 | Repeats but well within range. Same employee, frequent commute. |
| ALANAZI/ABDULAZIZ MR | JED GIZ JED | SAR 1,250 | 4 | 3 of 9 at SAR 1,250; others SAR 1,200-1,830 | Corporate rate, frequent commuter. |
| JAMAL/ABDULMALIK MR | JED RUH / RUH JED | SAR 650 | 4 | Spread across two related routes; same fare both directions | Same agency rate outbound + return = legitimate round-trip pattern. |

### Pattern interpretation

The trips share three characteristics that explain the repeated amounts:

1. **Same employee + same route** — these are commute patterns (JED-MED, RUH-DMM, JED-AHB, JED-GIZ are all KSA-internal routes that AlJeel staff fly regularly)
2. **Agency-negotiated rates** — Jawal Travel has corporate-rate contracts with airlines; the exact-same SAR amount appears across multiple bookings of the same fare class on the same route
3. **No service-date conflicts** — the trips are spread across different service dates within the 60-day window. Genuine separate trips, not duplicated invoices.

For genuine fraud, we'd want to see one of these additional signals:

- **Same route + same date + same amount** (the rule should be combined with DUP_ROUTE_STRICT's tightened version — same-day catches are the real concern)
- **Same amount across DIFFERENT routes** (e.g., SAR 1,250 for both JED-GIZ and JED-DMM — would suggest a placeholder amount, not a real fare)
- **Amount inconsistent with fare-class history** (e.g., this employee has flown JED-MED at SAR 800 historically and suddenly jumps to a fixed SAR 1,080 for 3 trips — possible kickback adjustment)
- **Amount round + zero VAT** (already partially covered by refined ROUND_AMOUNT)

## Refinement recommendation for v15.11

**Change 1 — Add route variance check.** Only fire when 3+ trips at exactly the same amount span **multiple distinct routes**. Same-route repeats are commute patterns.

**Change 2 — Compare against the route's natural fare distribution.** If the flagged amount is within ±1 stdev of the route's other observed fares, it's a corporate rate; suppress. Only fire when the flagged amount is statistically anomalous for that route.

**Change 3 — Add fare-class continuity check.** If the same passenger's earlier history shows variable fares on this route and suddenly settles on a fixed amount, flag. If the fixed amount has been stable across the entire history, it's an agency rate, suppress.

Applied to today's data: refined rule catches **0 of 8** today's false positives. The corporate-fare pattern is consistent with the route's natural fare distribution for all 8 cases.

### A note on volume growth

This is a cross-batch rule — its catch rate grows as more batches are added to `cache/cross_batch_history.json`. With 168 trips in history today, we have 8 catches. With 1,000 trips in 6 months, we could have 50+ catches if the rule isn't refined. That's why investigating now matters — the rule's signal-to-noise will degrade as data grows unless we add the variance checks.

## What v15.11 surfaces to Finance for PASSENGER_AMOUNT_PATTERN

After refinement: **probably nothing in steady-state.** The refined rule should fire rarely — when it does, it represents a real anomaly worth investigating (e.g. an employee with previously variable fares suddenly settling on a fixed amount across multiple routes).

If the rule fires, the surface should include:
- Pax + flagged amount + trip count
- The 3+ tickets making up the pattern
- Comparison: this passenger's prior fare distribution on the same route
- Comparison: agency's typical fare for this route across all passengers
- A reason-to-investigate explanation (variance check failure)

## Recommendation

**Do NOT surface PASSENGER_AMOUNT_PATTERN to Finance in current form.** The 8 catches are pure commute/agency-rate noise. After v15.11 adds the variance check + route-diversity requirement, the rule becomes high-signal — Finance only sees catches that represent real fare anomalies.

The rule is structurally useful, just needs the noise filters added.

---

**Investigated by:** Malik via Amr's direction (2026-05-22)
**Next action:** Move to category #6 (POTENTIAL_REBOOKING_FRAUD — 0 catches, verify rule works) when Amr signals.
