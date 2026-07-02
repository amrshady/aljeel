# EMD_MISMATCH — Fraud Rule Case File

**Category:** `EMD_MISMATCH` (within-batch QC)
**Severity in rule:** MEDIUM
**Status in v15.10:** Active. 0 catches across J26-640 + J26-788.
**Investigation date:** 2026-05-22
**Verdict:** **RULE IS WORKING CORRECTLY. KEEP ACTIVE. NO SURFACING NEEDED.**

---

## What it catches

A `1936*` prefix ticket is an Electronic Miscellaneous Document — typically a change fee, seat-upgrade fee, baggage fee, or cancellation/rebooking charge issued by the airline on top of an original ticket. The original airline ticket carries the `6905*` prefix.

The rule fires when a `1936*` ticket appears WITHOUT a matching `6905*` original for the same passenger within ±7 days. That pattern is a classic travel-fraud signal — the agency may be charging change fees on tickets that were never actually issued.

## What the data shows

### J26-640: 2 EMD/change-fee tickets, both legitimately paired

| Sl# | EMD Ticket | Passenger | Route | Amount | Status |
|---|---|---|---|---|---|
| 29 | 1936040338 | RATL/CHARLES MR | RUH GIZ RUH | SAR 250 | ✅ Paired with Sl#4 (ticket 6905264384, same route, SAR 800) |
| 30 | 1936040471 | ALI/HESHAM MR | RUH JED | SAR 200 | ✅ Paired with Sl#9 (ticket 6905264402, same route, SAR 2,080) |

Both EMD amounts (SAR 250 and SAR 200) are consistent with standard airline change fees. No 1936 ticket appears without a matching 6905 original for the same passenger in the same batch.

### J26-788: 0 EMD tickets at all

No 1936-prefix tickets in the batch. Nothing to check.

## Why the rule returning 0 is the correct answer

- Rule logic confirmed by reading source (`scripts/qc_catches_within_batch.py` lines 237-279)
- Detection criterion: tickets starting with `1936` are EMD; tickets starting with `6905` are originals
- Pairing window: ±7 days by invoice date
- Tested manually: each 1936 in J26-640 has at least one matching 6905 for the same passenger within the batch
- No false negatives (no obvious EMD missed)
- No false positives (no over-flagging)

## How a TRUE positive would look

Hypothetical fraud pattern this rule WOULD catch:
- Travel agency issues `1936040999` for SAR 1,500 to RATL/CHARLES MR
- No corresponding `6905*` ticket exists for RATL/CHARLES in this batch or ±7 days
- This means the agency is invoicing a change fee for a trip that was never booked
- Or: the agency is invoicing a refund/change fee multiple times for the same underlying booking
- Either way, SAR 1,500 fraud exposure

Today's data has neither pattern. Both 1936 tickets are real change/cancel fees on real originals.

## What to monitor going forward

When future batches process, watch for:
- Multiple 1936 tickets for the same passenger without proportionally more 6905s — could indicate fee-padding
- 1936 tickets that exceed 30% of the original ticket amount — unusually high change-fee proportion
- 1936 tickets > SAR 1,000 — most legitimate change fees are SAR 100-500
- 1936 tickets where the matched 6905 was cancelled (would require integrating with airline cancellation data — not in scope today)

## Recommendation

**Do NOT surface EMD_MISMATCH to Finance in v15.11.** Rule is correctly silent for J26-640 and J26-788. Surfacing 0 catches as a "no fraud detected" banner adds noise. Keep the rule running in the QC pipeline as a background safety net; if it ever fires, the catch will appear in `catches-within-batch.json` and be available for review.

**Possible refinement for later (not blocking):** add a 5th sub-rule to catch 1936 tickets with abnormally high amounts (≥30% of paired 6905 original). Today this is uncaught — but also doesn't fire on any J26-640/J26-788 data, so adding the rule is speculative.

---

**Investigated by:** Malik via Amr's direction (2026-05-22)
**Next action:** Move to category #2 (ROUND_AMOUNT investigation) when Amr signals.
