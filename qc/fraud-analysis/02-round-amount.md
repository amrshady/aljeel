# ROUND_AMOUNT — Fraud Rule Case File

**Category:** `ROUND_AMOUNT` (within-batch QC)
**Severity in rule:** LOW
**Status in v15.10:** Active. 5 catches in J26-640, 1 in J26-788 (6 total across both batches).
**Investigation date:** 2026-05-22
**Verdict:** **REFINE — current rule is too noisy. Refine to catch only retail-airline-ticket round amounts; suppress sponsorship/event rows.**

---

## What the rule catches

Travel-expense amounts that are exact multiples of SAR 1,000 (≥ SAR 2,000). The intuition: airline retail tickets are metered fares with VAT — they rarely round to whole thousands. An exact round amount can suggest the agency invoiced a placeholder figure rather than the actual fare paid.

## What the data shows

### All 6 catches (full source)

| Batch | Sl# | Pax | Route | Amount | Taxable + VAT | Account | Layer | Verdict |
|---|---|---|---|---|---|---|---|---|
| J26-640 | 2 | ALWAKEEL/AMR MR | JED ATH JED | SAR 5,000 | 5000 + 0 | **60307021 sponsorship** | not_resolved | FALSE POSITIVE — Athens conference budget |
| J26-640 | 21 | AHMED/AHMED MOHAMED MR | CAI RUH HAS | SAR 3,000 | 3000 + 0 | **60307021 sponsorship** | L4 | FALSE POSITIVE — sponsored HCP travel |
| J26-640 | 28 | AMR ALWAKEEL | Electra Metropolis Athens (hotel) | SAR 6,000 | 6000 + 0 | **60307021 sponsorship** | L1 | FALSE POSITIVE — same Athens trip hotel |
| J26-640 | 32 | ALQAHTANI/YAZEED MR | RUH HAS RUH | SAR 2,000 | **1739.13 + 260.87** | 60301003 | L1.5 | FALSE POSITIVE — actual metered fare; happens to total exactly 2000 |
| J26-640 | 86 | ALSABRI/GHAIDAA MS | JED DOH CDG VIE DOH | SAR 4,000 | 4000 + 0 | **60307021 sponsorship** | L9 | FALSE POSITIVE — conference travel budget |
| J26-788 | 10 | AHMED/AHMED MOHAMED MR | RUH HAS | SAR 2,000 | (sponsorship) | **60307021 sponsorship** | L0 | FALSE POSITIVE — sponsored HCP travel |

### Pattern

**5 of 6 catches are sponsorship-account rows (60307021).** Sponsorship invoices commonly use round-thousand amounts because they're predetermined event budgets, not metered airline fares. This is expected accounting behavior, not fraud.

**1 of 6 (Sl#32 ALQAHTANI) is a real airline ticket** with taxable 1739.13 + VAT 260.87 = 2000.00. The total rounds because that's the agency's retail rounding, but the underlying fare is a real metered amount.

### Benchmark — HAS RUH route (Hail, the only KSA city with multiple observations)

| Sl# | Pax | Route | Amount |
|---|---|---|---|
| 23 | MAZIED/ISSAM ENG | RUH HAS RUH | SAR 1,400 |
| **32** | **ALQAHTANI/YAZEED MR** | **RUH HAS RUH** | **SAR 2,000** ← caught |
| 33 | BIN MUDHIAN/FAISAL MR | RUH HAS RUH | SAR 2,170 |
| 74 | AHMED/NAGMALDIN MR | HAS RUH | SAR 970 |

Sl#32's SAR 2,000 sits right in the middle of the natural fare range for the same route. Not anomalous.

## Why the rule fires falsely

Two structural reasons:

1. **Sponsorship trips genuinely use round-thousand budgets.** SAR 3,000 / SAR 5,000 / SAR 6,000 are typical sponsorship line-item amounts because they're set by event budget, not airline fare meter. The rule's intuition only applies to retail airline tickets.

2. **Retail fare totals naturally hit round numbers when taxable * 1.15 ≈ N×1000.** SAR 1,739.13 × 1.15 = SAR 2,000.00. The amount appears "round" but the underlying fare is metered. This pattern occurs every time the agency or airline price-rounds the taxable amount to make the final SAR-inclusive amount land on a clean number for the customer.

## What a TRUE positive would look like

For an airline ticket (account 60301003, NOT sponsorship):
- Amount is exactly SAR 5,000 / 10,000 / 15,000
- Taxable = 5,000 / 10,000 / 15,000 (no VAT applied, OR VAT applied but the agency back-computed taxable from a round inclusive figure)
- Route is a domestic KSA pair where typical fares are SAR 800-2,500 (so SAR 5K+ is implausible)
- No supporting Oracle Fusion form or approval anywhere

None of today's 6 catches match this. The rule is firing on legitimate sponsorship invoices and one retail rounding case.

## Refinement recommendation for v15.11

Change the rule from:

> Amount ≥ 2000 AND amount % 1000 == 0

To:

> Amount ≥ 2000 AND amount % 1000 == 0
> AND account is NOT in {60307021 sponsorship, 60307022 hospitality, 60308007 recruitment} (these are event/budget accounts where round amounts are normal)
> AND VAT amount == 0 (real retail fares carry 15% VAT; zero-VAT round amount on a non-sponsorship account is anomalous)
> AND route is a metered airline route (skip hotel/registration/transfer rows where round amounts are also normal)

Applied to today's data:
- Sl#2, 21, 28, 86, J26-788 Sl#10 → all sponsorship account → SUPPRESSED ✓
- Sl#32 → has VAT 260.87 ≠ 0 → SUPPRESSED ✓
- All 6 catches eliminated. Expected new catch rate: 0/117.

## Recommendation

**Refine the rule per the above before surfacing anything to Finance.** Today's "5 ROUND_AMOUNT catches" entry in the QC report is noise — Finance would learn to ignore it within a batch or two.

After refinement, the rule should be effectively silent on typical AlJeel batches. If it ever fires on a future batch, that ROW will be highly suspicious — round retail airline fare on a non-sponsorship account with zero VAT — and Finance should genuinely investigate.

**Do NOT surface ROUND_AMOUNT to Finance in v15.11 in current form.**

After refinement, surface as: "ROUND_AMOUNT (refined): 0 catches" — i.e., remain silent unless a real anomaly hits.

## Knock-on: also remove the row-level `ROUND_AMOUNT(LOW)` flag from `QC Catches` column in the FILLED xlsx for sponsorship rows. Currently 5 rows wear this flag unnecessarily — minor visual noise for Finance.

---

**Investigated by:** Malik via Amr's direction (2026-05-22)
**Next action:** Move to category #3 (DUP_ROUTE_STRICT — 24 catches) when Amr signals.
