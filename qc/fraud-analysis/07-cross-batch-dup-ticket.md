# CROSS_BATCH_DUPLICATE_TICKET — Fraud Rule Case File

**Category:** `CROSS_BATCH_DUPLICATE_TICKET` (cross-batch fraud)
**Severity in rule:** HARD
**Status in v15.10:** Active. 0 catches reported across J26-640 + J26-788.
**Investigation date:** 2026-05-22
**Verdict:** **✅ KEEP — rule works correctly, 0 catches is the right answer.**

---

## What the rule catches

Exact same ticket_no appearing in two different batches. The fraud intuition: an airline ticket has a globally-unique 10-digit number — the same number appearing in two different invoice batches means the agency billed the same trip twice across cycles.

## Verification

- Cross-batch history at `cache/cross_batch_history.json` indexes 168 unique tickets across J26-640 + J26-788
- Manually de-duped both batches' raw input by 10-digit ticket numbers — 168 unique, **0 duplicates**
- Rule logic confirmed via source read (`scripts/cross_batch_fraud.py:93-119`) — does a simple dict lookup in `history["tickets"]`, fires when the same ticket key is found in two batches

The rule works correctly. 0 catches means the agency has not double-billed any specific 10-digit ticket across the two batches in our window. Continue running it as a hard-fail check; if it ever fires, that's an unambiguous fraud signal that should block Oracle posting.

## What v15.11 surfaces to Finance

**Silent unless real catch.** If a duplicate ever fires, it's HARD-severity → blocks the row from being posted, surfaces as a top-of-output banner.

## Recommendation

**KEEP rule as-is. Do NOT surface anything to Finance in current run.** This is the type of rule where silence is its value — when it fires, Finance should drop everything.

---

**Investigated by:** Malik via Amr's direction (2026-05-22)
**Next action:** Move to category #8 (OVER_LIMIT) when Amr signals.
