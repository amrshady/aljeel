# Fraud Detection Rules — Master Decision Log

**Owner:** AlJeel AP pipeline (`~/.openclaw/workspace/aljeel/`)
**Investigation completed:** 2026-05-22
**Status:** All 8 cases investigated. Ready for consolidated v15.11 refinement.

This is the audit trail. Each row records what was decided, why, and what gets implemented in v15.11.

A single consolidated sub-agent task (`v15.11-fraud-rules-refinement`) will implement every REFINE / SUPPRESS / FIX verdict in code. Today's `v15.10` ships with all rules running but their output downgraded to internal-only (`catches-*.json`) until refinement lands.

---

## Decision matrix — all 8 categories

| # | Rule | Catches today (J640 / J788) | Verdict | Refinement | Surface to Finance? | Case file |
|---|---|---|---|---|---|---|
| 1 | EMD_MISMATCH | 0 / 0 | ✅ KEEP — rule works, silence is correct answer | Optional later: flag 1936* fees > 30% of paired 6905* original | NO — silent unless real catch | `01-emd-mismatch.md` |
| 2 | ROUND_AMOUNT | 5 / 1 | 🔧 REFINE — all 6 catches are false positives | Add 3 guards: skip sponsorship/event accounts (60307021/22, 60308007), require VAT=0, skip hotel/registration/transfer rows | NO in current form; SILENT after refine | `02-round-amount.md` |
| 3 | DUP_ROUTE_STRICT | 24 / 16 | 🔧 REFINE — 80% (32/40) are return-leg false positives | (a) Compare actual route strings not sorted tuples; (b) Require same service date for STRICT tier; (c) Re-tier to STRICT vs SOFT; (d) Frequent-traveler downgrade | YES post-refine — 2 real candidates surface (ABU ABED + SHAYEB) | `03-dup-route-strict.md` |
| 4 | NO_APPROVAL | 34 / 39 | 🔴 REFINE — 22%+ confirmed false-positive rate, single-source `has_msg` flag too narrow | Build multi-source approval detector: Oracle Fusion form OR explicit `يعتمد` in body OR `Approved_` in subject OR voucher with resolved emp_no OR CHD family ride-along | Tier 1 HIGH (>SAR3K real): ~3-4 per batch. Tier 2 MEDIUM: aggregated count only | `04-no-approval.md` |
| 5 | PASSENGER_AMOUNT_PATTERN | 3 / 5 | 🔧 REFINE — all 8 are commute/agency-rate patterns | (a) Require pattern across multiple distinct routes; (b) Compare flagged amount against route's natural fare distribution; (c) Add fare-class continuity check | NO in current form; SILENT after refine | `05-passenger-amount-pattern.md` |
| 6 | POTENTIAL_REBOOKING_FRAUD | 0 / 0 | 🚨 FIX BUG + REFINE — silent because tuple-vs-list comparison always fails | (a) Fix tuple/list type bug; (b) Use actual route strings; (c) Tighten to same-SERVICE-date (not invoice date) + ±10% amount + different ticket numbers | NO until both fixes ship; SILENT after refine | `06-potential-rebooking-fraud.md` |
| 7 | CROSS_BATCH_DUPLICATE_TICKET | 0 / 0 | ✅ KEEP — rule works, 168 unique tickets confirmed | None | NO — silent unless real catch (HARD-severity, would block posting) | `07-cross-batch-dup-ticket.md` |
| 8 | OVER_LIMIT | 0 / 0 | 🔴 SUSPEND — structurally dead because Manpower has no Grade column | Suspend in code, document in RULES.md. Reactivate when AlJeel adds Grade data to Manpower OR rewrite to use alternative ceiling source (account class, flat per-trip cap) | NO — rule dead | `08-over-limit.md` |

---

## Summary by verdict

- **2 KEEP** as-is (EMD_MISMATCH, CROSS_BATCH_DUPLICATE_TICKET) — both silently armed, valuable when they fire
- **5 REFINE** before surfacing (ROUND_AMOUNT, DUP_ROUTE_STRICT, NO_APPROVAL, PASSENGER_AMOUNT_PATTERN, POTENTIAL_REBOOKING_FRAUD — also has structural bug to fix)
- **1 SUSPEND** (OVER_LIMIT — structurally dead until grade data exists)

**Net: 1 rule with a hidden critical bug, 4 rules with significant false-positive rates, 2 working correctly, 1 dead.**

## Bug count

- **1 structural bug** in cross-batch fraud (tuple-vs-list comparison in POTENTIAL_REBOOKING_FRAUD silently disables the rule)
- **1 design bug** shared by DUP_ROUTE_STRICT + POTENTIAL_REBOOKING_FRAUD (sorted-tuple route corridor causes outbound + return to mis-match)
- **1 dead rule** (OVER_LIMIT depends on non-existent grade data)
- **1 single-source detector that should be multi-source** (NO_APPROVAL only recognizes Oracle Fusion forms)
- **1 missing variance check** (PASSENGER_AMOUNT_PATTERN fires on commute patterns because no route-diversity requirement)
- **1 missing context exclusion** (ROUND_AMOUNT fires on sponsorship account rows where round amounts are normal)

## What v15.11 will ship (provisional, until consolidated implementation)

1. Refined catch rules in `scripts/qc_catches_within_batch.py` + `scripts/cross_batch_fraud.py`
2. Removal of stale per-row noise flags (`ROUND_AMOUNT(LOW)` on sponsorship rows, etc.) from `QC Catches` column
3. New section in FILLED xlsx output: `Fraud Watch` — only populated when refined rules fire
4. `qc/fixtures/expected-catches-<batch>.json` test fixtures for regression
5. `qc/score_against_canonical.py` extended to also validate catch counts match expected
6. Updated RULES.md + IMPLEMENTATION.md documenting fraud-detection as a first-class pipeline stage
7. `*.BASELINE-v15.11` snapshot when complete

## What v15.11 will NOT do

- Bypass the QC layer entirely (background fraud detection stays armed)
- Auto-block any row from posting on a soft flag (only HARD failures block — only CROSS_BATCH_DUPLICATE_TICKET is HARD today)
- Surface anything before Finance + Laith have signed off on the refined output format

---

## Expected catch counts after v15.11

| Rule | Catches today | Catches expected post-v15.11 | Surface |
|---|---|---|---|
| EMD_MISMATCH | 0 / 0 | 0 / 0 (correct) | silent |
| ROUND_AMOUNT | 5 / 1 | 0 / 0 (false positives suppressed) | silent |
| DUP_ROUTE_STRICT | 24 / 16 | ~2 STRICT + ~6 SOFT | Tier 1 + Tier 2 |
| NO_APPROVAL | 34 / 39 | ~3-5 HIGH + ~15-20 MEDIUM aggregated | Tier 1 + Tier 2 |
| PASSENGER_AMOUNT_PATTERN | 3 / 5 | 0 / 0 (commute filter) | silent |
| POTENTIAL_REBOOKING_FRAUD | 0 / 0 (BUG) | 0 / 0 (real, after fix) | silent |
| CROSS_BATCH_DUPLICATE_TICKET | 0 / 0 | 0 / 0 (correct) | silent |
| OVER_LIMIT | 0 / 0 | suspended | n/a |

**Finance-facing surface after v15.11:** ~5-8 high-signal catches per batch instead of 80+ noisy ones.

---

## Investigation log

- 2026-05-22 — Cases 1-3 written
- 2026-05-22 — Case #4 NO_APPROVAL written
- 2026-05-22 — Case #5 PASSENGER_AMOUNT_PATTERN written
- 2026-05-22 — Cases 6-8 written
- **2026-05-22 — ALL 8 CASES COMPLETE. Ready for consolidated v15.11 refinement.**
