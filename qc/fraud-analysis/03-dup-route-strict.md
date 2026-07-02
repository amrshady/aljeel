# DUP_ROUTE_STRICT — Fraud Rule Case File

**Category:** `DUP_ROUTE_STRICT` (within-batch QC)
**Severity in rule:** MEDIUM
**Status in v15.10:** Active. **40 catches total** (24 in J26-640, 16 in J26-788).
**Investigation date:** 2026-05-22
**Verdict:** **🔴 REFINE — rule's route-corridor matching is fundamentally broken. 80% (32/40) of catches are legitimate return-leg pairs incorrectly flagged. Refine before surfacing.**

---

## What the rule is supposed to catch

Same passenger + same route corridor + within ±2 days, where the two tickets aren't:
- The same ticket cost-center-split into multiple lines
- An EMD/change-fee pair (1936* prefix paired with 6905* original)

Intent: catch genuine double-bookings (agency invoiced the same trip twice) or back-to-back identical bookings (rebook-for-refund fraud).

## What the rule is ACTUALLY catching (and the root cause)

`_parse_route_corridor()` returns the route as a **sorted tuple** (line 54 of `qc_catches_within_batch.py`):

```python
return tuple(sorted(cities))  # e.g. ('JED', 'RUH')
```

This means:
- Outbound `RUH JED` → corridor `(JED, RUH)`
- Return inbound `JED RUH` → corridor `(JED, RUH)` (same!)
- These are flagged as "duplicate" even though one is a real outbound and one is a real return leg of the same legitimate round trip

This is the root cause of 32 of the 40 catches.

## Full classification of all 40 catches

| Class | Count | Verdict |
|---|---|---|
| **RETURN_LEG** (outbound + inbound of same round trip) | 32 (80%) | FALSE POSITIVE — legitimate same-day or 1-3 day round trips |
| **SAME_ROUTE_SAME_DATE** (potentially genuine duplicate) | 2 (5%) | INVESTIGATE — different ticket numbers, same route, same service date |
| **SAME_ROUTE_DIFF_DATE** (separate trips, same route different days) | 6 (15%) | SOFT FLAG — legitimate but worth a glance if frequent |
| COMPLEX | 0 | — |

### RETURN_LEG examples (false positives — 32 rows)

| Pax | Outbound | Return |
|---|---|---|
| ALAJMI/MANNAA | RUH AHB Apr-26 | AHB RUH Apr-30 |
| HUSSEIN/AHMAD | RUH JED Apr-28 | JED RUH Apr-30 |
| ALI/HESHAM | RUH JED Apr-28 | JED RUH Apr-30 |
| ALANAZI/FARHAN ×6 | various RUH↔TUU pairs | various dates |
| BIN RAJAB/FERAS ×5 | JED↔AHB pairs | spread May 3-5 |
| ELZAIM/AHMAD | RUH AJF May-03 | AJF RUH May-03 (same-day) |
| ... | ... | ... |

All of these are correct business travel: fly out, fly back. The agency rightly issues 2 separate tickets (sometimes from different airlines / different fare classes). Nothing wrong with them.

### SAME_ROUTE_SAME_DATE — the only 2 potentially-real candidates

**Pair 1: ABU ABED/IBRAHIM MR — J26-788 Sl#44 + Sl#55**
- Both `JED EAM JED`, service date 2026-05-05
- Sl#44: issue 2026-05-04, ticket `6905495665`, total SAR 1,830 (taxable 1591.3 + VAT 238.7)
- Sl#55: issue 2026-05-05, ticket `6905533283`, total SAR 1,735.01 (taxable 1508.7 + VAT 226.31)
- Different ticket numbers, different issue dates, slightly different amounts
- Possible explanations:
  - Original ticket + re-issued ticket (rebooking after change)
  - Different fare classes for outbound vs return (unlikely if labeled JED-EAM-JED twice)
  - Genuine double-billing (agency issued the same trip twice to bill twice) ← real fraud signal
- **Worth Finance investigation:** SAR 3,565 at risk if genuine duplicate

**Pair 2: SHAYEB/ABDALLAH MR — J26-788 Sl#82 + Sl#84**
- Both `RUH GIZ`, service date 2026-05-09
- Sl#82: ticket `6905569510`, total SAR 570 (taxable 495.65 + VAT 74.35)
- Sl#84: ticket `6905569512`, total SAR 202.40 (taxable 176 + VAT 26.40)
- Different ticket numbers, same issue date, very different amounts (570 vs 202)
- The SAR 202 ticket's pattern strongly suggests a seat-upgrade / extra-baggage / change fee bundled as a separate 6905 ticket (the airline issued an ancillary fee as a separate booking record rather than as an EMD 1936)
- **Soft flag for Finance:** Probably legitimate, but Finance should verify these aren't two different passengers mis-mapped to the same name.

### SAME_ROUTE_DIFF_DATE — 6 legit separate trips

These are passengers who genuinely flew the same corridor twice in the window. Example: ALANAZI/FARHAN flew RUH-TUU on Apr-26 AND again on Apr-30. Legitimate frequent traveler. Not fraud.

## Refinement recommendation for v15.11

**Change 1 — Stop using sorted-tuple route corridor.** Compare actual route strings (`r1.route == r2.route`), not sorted tuples. Outbound and return are no longer falsely merged.

**Change 2 — Add same-service-date as a hard requirement.** A genuine duplicate-invoice is the same trip billed twice — that means same service date. If service dates differ even by 1 day, they're separate trips (covered by same-route-diff-date already, gets softer treatment).

**Change 3 — Re-classify the rule output:**
- **STRICT (high signal):** same route + same service date + different ticket numbers (2 catches in current data)
- **SOFT (low signal):** same route + different service dates within ±7 days (currently mis-classified as STRICT)

**Change 4 — Add a frequent-traveler whitelist consideration.** ALANAZI/FARHAN has 6 catches alone — but his data pattern is consistent (RUH↔TUU regular commute). For passengers with this many DUP catches, calculate trip frequency over the trailing 90 days; if commute-pattern, downgrade the catches to informational only.

Applied to today's data:
- 32 RETURN_LEG → SUPPRESSED (sorted-corridor bug fixed)
- 6 SAME_ROUTE_DIFF_DATE → downgrade to SOFT
- 2 SAME_ROUTE_SAME_DATE → keep as STRICT for Finance review

Net surface to Finance: **2 high-signal flags** (ABU ABED + SHAYEB cases) instead of 40 noisy ones. Finance will actually look at 2; they'd ignore 40.

## What to surface to Finance in v15.11

A `Duplicate Invoice Watch` section in the QC report:

```
2 potential duplicate invoices flagged (SAR 3,767 at risk):

1. ABU ABED/IBRAHIM MR — JED EAM JED — 2026-05-05
   • Ticket 6905495665 (issued 2026-05-04, SAR 1,830)
   • Ticket 6905533283 (issued 2026-05-05, SAR 1,735.01)
   → Same passenger, same route, same service date, different ticket numbers
   → Verify these aren't original-vs-rebook before posting.

2. SHAYEB/ABDALLAH MR — RUH GIZ — 2026-05-09
   • Ticket 6905569510 (SAR 570)
   • Ticket 6905569512 (SAR 202.40)
   → Smaller ticket looks like an ancillary fee, but verify both are for the same passenger.
```

## Recommendation

**Do NOT surface DUP_ROUTE_STRICT to Finance in current form.** 40 catches with 80% false-positive rate would teach Finance to ignore the rule. After v15.11 refinement, the rule becomes high-signal and ships with 2 catches that Finance will actually investigate.

---

**Investigated by:** Malik via Amr's direction (2026-05-22)
**Next action:** Move to category #4 (NO_APPROVAL — 34 catches, biggest volume) when Amr signals.
