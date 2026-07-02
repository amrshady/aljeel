# POTENTIAL_REBOOKING_FRAUD — Fraud Rule Case File

**Category:** `POTENTIAL_REBOOKING_FRAUD` (cross-batch fraud)
**Severity in rule:** MEDIUM
**Status in v15.10:** Active. **0 catches reported** in both batches.
**Investigation date:** 2026-05-22
**Verdict:** **🚨 RULE IS SILENTLY BROKEN — type-coercion bug means it has NEVER fired. After bug fix, the underlying logic is also too coarse and produces false positives. Fix the bug AND refine the logic.**

---

## What the rule is supposed to catch

Same passenger + same route + amount within ±10% + within ±14 days, across different batches. The fraud intuition: a real rebooking happens when an employee cancels a flight and re-issues a new ticket for the same trip — the agency may double-bill (collect refund on the cancelled ticket AND keep the rebook fee). Catching this requires cross-batch comparison because the rebooked invoice may land in the next billing cycle.

## What's actually happening: the rule never fires

### Bug 1 — Silent type-mismatch (rule has never fired since deployment)

In `scripts/cross_batch_fraud.py:134`:

```python
if route and prior.get("route_corridor") and route != prior["route_corridor"]:
    continue
```

`route` (current batch_line) comes from `_parse_route_corridor(desc)` which returns a **tuple**.
`prior["route_corridor"]` (history file) is stored via JSON, which converts tuples → **lists** on save.

A Python tuple is never equal to a list, even with same contents:
```python
>>> ('JED','MED','JED') == ['JED','MED','JED']
False
```

So the check `route != prior["route_corridor"]` is **always True** → `continue` → every comparison is skipped → 0 catches forever.

### Bug 2 — Same sorted-tuple route corridor problem as DUP_ROUTE_STRICT

Even if Bug 1 is fixed, the route_corridor matcher still uses sorted city tuples. Outbound `RUH JED` and inbound `JED RUH` get the same corridor, so an outbound + return get treated as rebook candidates of each other.

## What the rule would catch after fixing Bug 1 (manual simulation)

I manually ran the rule logic against the existing cross-batch history with the tuple/list normalization applied:

| Pax | Route | Trip 1 (svc date) | Trip 2 (svc date) | Gap | Amount diff |
|---|---|---|---|---|---|
| ALBALAWI/SAUD | JED ↔ GIZ | J26-640 Apr-28 SAR 800/450 | J26-788 May-07 SAR 430/420 | 9 days | ±2-7% |
| ELHAG/ALI ENG | JED-MED-JED | J26-640 Apr-29 SAR 1,080 | J26-788 May-06 SAR 1,080 | 7 days | exact same |
| ELATTAR/AHMED | RUH-DMM-RUH | J26-640 May-05 SAR 1,800 | J26-788 May-11 SAR 1,800 | 6 days | exact same |

All 4 candidates are **legitimate separate trips** (different service dates 6-9 days apart), not rebookings. The same-amount pattern reflects corporate-negotiated agency rates (already noted in Case #5 PASSENGER_AMOUNT_PATTERN — these are commuters on routes with stable agency fares).

## Why the logic is too coarse even after the bug fix

A genuine rebooking has these distinguishing features:

1. **Same service date** (NOT same invoice date within 14 days). A rebook is a replacement for the SAME trip — the service date doesn't move.
2. **The original ticket should have been cancelled/voided.** This is observable as a credit-memo or a negative-amount line on the original ticket invoice in a prior batch.
3. **Two tickets for the SAME service date, similar amounts, different ticket numbers** — that's the rebook fingerprint.

The current rule has none of these checks. It just looks for "similar trip within 14 days same passenger same route" — which is the recurring-commute pattern, not rebooking.

## Refinement recommendation for v15.11

**Fix 1 — The tuple-vs-list bug.** Cast both sides to list before comparison:
```python
if route and prior.get("route_corridor") and list(route) != list(prior["route_corridor"]):
    continue
```

**Fix 2 — Use actual route strings, not sorted tuples** (carry the same change as DUP_ROUTE_STRICT refinement to avoid outbound+return being mis-matched).

**Fix 3 — Tighten the rule. The current ±14 day window is too wide.** Replace with:

- **Same service date** (not invoice date) + same route + different tickets + amounts within ±10%

Optionally: **add evidence-of-cancellation check** by looking for negative-amount lines or credit memos for the prior ticket in subsequent batches. This is the strongest fraud signal but requires the data to support it (need to verify Jawal sends credit memos as separate batch lines — currently unknown).

Applied to today's data: refined rule catches **0 of 4** today's false positives. Real rebookings would surface as same-service-date pairs across batches — not happening in current data.

## What v15.11 surfaces to Finance for POTENTIAL_REBOOKING_FRAUD

After refinement: **likely nothing in steady-state.** Refined rule should fire rarely — when it does, a real same-service-date pair across batches represents a high-confidence rebooking signal Finance should investigate.

If the rule fires, surface should include:
- The two tickets (original + rebook)
- Both batches + invoice dates + ticket numbers
- Same service date proof
- Evidence of cancellation if available (negative-amount line on prior ticket)

## Recommendation

**Fix the rule first (Bug 1).** It has been silently broken since deployment — we've had no rebooking-fraud detection at all, even though the code looks like it's running.

Then refine per Fix 2+3 to avoid the same false-positive pattern we just saw on simulation.

After v15.11, the rule becomes operational AND high-signal. Don't surface anything to Finance until both fixes ship.

---

**Investigated by:** Malik via Amr's direction (2026-05-22)
**Next action:** Move to category #7 (CROSS_BATCH_DUPLICATE_TICKET — 0 catches, verify the rule actually works) when Amr signals.
