# Open Items — Post-Rulebook Refactor

**Date:** 2026-05-21

---

## For Laith / Labib

| # | Item | Priority | Blocking? |
|---|------|----------|-----------|
| 1 | **EP solution code** — 4 employees (incl. ELSHAZLI/OMAR) have Solution="EP" but no numeric code. Currently using 00000 + S9 flag. | HIGH | Yes — needed to clear S9 flags |
| 2 | **DIV codes 192, 194, 196** — appear in Manpower (60 employees) but NOT in the DIV master tab. What are they? Currently flagged S8 (soft). All 60 affected lines in J26-788 produce valid combos but are flagged HOLD. | HIGH | No — combos are valid, flag is informational |
| 3 | **Location discrepancy** — 6 employees in golden fixture J26-640 have different Location than Manpower (golden shows 40100/20100, Manpower shows 10100). Is Manpower or golden correct? | MEDIUM | No — only affects validation, not production |
| 4 | **"Need to allocate" email parsing** — 26 employees in J26-788 have flag "Need to allocate" in Manpower col O. Rulebook says to parse approval email for subordinate name. Not implemented yet because email bodies aren't available in the Oracle template. Need access to .msg files per batch. | MEDIUM | No — flagged S1 for manual review |
| 5 | **ALSABRI/GHAIDAA** — Not in Manpower. 2 refund lines in J26-788 use placeholder CC=999999. Should she be added to Manpower? | LOW | No — flagged S7 |

## For Amr

| # | Item | Decision Needed |
|---|------|-----------------|
| 1 | **Account classification depth** — Currently the v5 processor uses the v4's account code as baseline when the keyword classifier defaults. For future batches processed from scratch (not from v4 input), the Description field alone may not have enough context to classify Sponsoring vs Travel accounts. Should we integrate email body parsing into the batch processor? |
| 2 | **"Need to allocate" workflow** — The 26 affected lines need subordinate names from approval emails. Two approaches: (a) integrate .msg parsing into the batch processor (requires email files per batch), or (b) keep as manual review with the S1 flag. Recommendation: (a) for production, (b) acceptable for demo. |
| 3 | **Location source** — Manpower shows most employees at 10100 (HQ) even when they work in Jeddah/Dammam. The golden fixture was hand-corrected. Should we add a Location override mechanism, or wait for Manpower cleanup? |
