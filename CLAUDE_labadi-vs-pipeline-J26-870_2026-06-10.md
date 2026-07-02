# Labadi vs. Pipeline — J26-870 SPLIT comparison

**TL;DR:** Both files have the same 39 data rows and identical amounts everywhere (line sum 155,606.10; invoice 157,065 — zero financial changes). There are **49 cell differences in 23 rows, confined to 4 columns**: Description (29), GL Description (15), Distribution Combination (3), Employee No (2). They decompose into **one confirmed pipeline bug, two evidence-backed allocation corrections, one labeling convention, and 12 false diffs caused by version skew** — Labadi worked from the SPLIT file deployed at ~06:09, before a 06:56 splitter fix, so part of the diff is our own later regeneration, not his edits. He also appended two columns: col 71 "Adjustment" (his change notes) and col 72 (employee number as text with a trailing period).

---

## A. Confirmed pipeline bug — Row 39, BUKHARI/AMR (ticket 6905992272), 3,800 SAR

Labadi changed the account inside the Distribution Combination from **21070229 (Accrued Employee Annual Tickets)** to **60308009 (Training Expenses)**, note: *"GL Account is not correct."*

The damning part: **our own pipeline agreed with him and we didn't apply it.** Our row says Trip Purpose = TRAINING (confidence 0.85, trace: `trip_goal='Attend Training (Technical/Non-Technical)' → TRAINING`) and our **Trip Account Override column already contains 60308009** — but the final Account and combo were written as 21070229. The override never reached the final combo. This also matches Labadi's own L4 rule from the v11-labadi matrix (Training → 60308009). All other segments (250010/120/10206, Sol 10050) match Bukhari's Manpower record exactly and were left alone.

**Verdict: pipeline bug** — the trip-account override is computed but not applied when writing the final Account/Distribution Combination. Highest-severity diff (balance-sheet accrual vs. P&L expense). Worth fixing before the next batch.

## B. Judgment call backed by evidence — Row 5, KHADER/OMAR (ticket 6905929962), 1,826.09 SAR

Labadi changed Employee No **1000453 → 1002169** and the combo's agency **10200 (S&M) → 10041 (Fujifilm)**; GL Description S&M → Fujifilm. Note: *"employee No and agency based on omar email."*

Evidence (`24may/6905929962/RE_ Approved_ Personal Contribution...msg`): Omar Khader's approved trip form says Host Name = **Fujifilm**, reason *"Attending a presentation for FUJIFILM with Engineer Zainab."* Manpower context:
- 1000453 Omar Khader: 196/Capital Equipment, agency 10200 S&M, **"Need to allocate"** — our row was already RED with exactly that note asking for manual confirmation.
- 1002169 Abdallah Amoudi: same CC/DIV (160011/196), but Manpower agency = **10156 NUBOMED**, not Fujifilm. However his line manager (1000523 Shadi Rashwan) is the Fujifilm-agency manager, so Amoudi's Manpower agency looks stale.
- 10041 = Fujifilm is a valid Agency lookup.

**Verdict: not a bug — Manpower data gap.** His agency comes from the email's Host Name, not Manpower; his CC/DIV match Manpower for both employees. Why specifically employee 1002169 isn't visible in the evidence we hold (the email names only Omar and "Engineer Zainab"; the only Zainab in Manpower is 1000767, Technical Services) — worth asking him, but this is precisely the manual allocation our RED flag requested.

## C. Judgment call backed by evidence — Row 41, AHMED ABDELGHAFAR (hotel 26-821), 421.74 SAR

Full reallocation: `60307021-160014-170-10050-10072` (Sponsoring Expenses · Contribution · HF · Abbott, emp 1002483) → **`60301004-170020-888-00000-88888`** (Travel Cost Expense G&A · Strategy · G&A), **Employee No removed** (his col 72 is also blank — deliberate). Note: *"GL & Account allocation Employee No."*

Our pipeline had failed all 9 resolution layers for "AHMED ABDELGHAFAR", then attached the row to emp 1002483 (Rawad Malaeb, HF/Abbott) and OPEX HF-2026-20. The evidence folder `30may/Re Abdelghafar Business Trip/` (approval email + Holiday Inn Riyadh voucher) is a standalone **business trip**, separate from the PSSMC folder that actually holds OPEX-HF-2026-20. Labadi's codes are all valid and form a coherent G&A set: DIV 888 = G&A → account 60301004 is his own L7 rule; CC 170020 = "Strategy" (the G&A/Strategy team in Manpower); agency 88888 = G&A. Tellingly, he kept rows 40 and 42 in HF-2026-20 (even prefixing the serial) but pulled only this row out.

**Verdict: pipeline over-aggregation + missing-person gap.** We lumped a non-Manpower G&A traveler into a sponsorship event. Evidence supports Labadi.

## D. Labeling convention — 29 Description diffs (no financial effect)

On every sponsorship row that has a known OPEX serial, Labadi prefixed it to the Description: `HF-2026-23-`, `CE-18-2026-` (×20 incl. split rows), `CRM-2026-30-` (row 38), `HF-2026-20-` (rows 40, 42). **Every prefix exactly equals our existing OPEX Serial column (col 64)** — no new information, but a clear convention: he wants the OPEX serial embedded in the Oracle invoice-line description. Row 41 got no prefix (he de-sponsorized it); row 39 has serial MISSING. This is a cheap pipeline feature to add.

## E. NOT corrections — 12 GL Description diffs (GE vs NUBOMED) are version skew

On all 12 second-employee split rows (emp 1002037, Euro Anesthesia), his GL Description says "GE" where ours says "NUBOMED". Three facts prove these aren't his edits:
1. His Adjustment column says **"Nothing Changed"** on every one of these rows.
2. His own Agency code/name columns still read **10156/NUBOMED**, contradicting the "GE" text — and the rebuilt combo (…-10156-…) is present in his file.
3. Timeline: the SPLIT he downloaded was deployed ~06:09; the splitter was edited at **06:56** (adding GL-Description rebuild, `split_multi_emp.py:257`); our comparison file was regenerated at 09:27. His base simply predates the fix.

**Verdict: already fixed in the current pipeline; no action.** Bonus: by marking all Euro Anesthesia split rows "Nothing Changed", Labadi has implicitly **approved the multi-employee split itself** — including re-deriving 1002037 → 10156/NUBOMED from Manpower.

---

## Summary table (substantive changes, ranked by significance)

| Row | Passenger / ticket | Amount | What changed | Matches Manpower? | Verdict |
|---|---|---|---|---|---|
| 39 | BUKHARI/AMR 6905992272 | 3,800 | Account 21070229 → 60308009 | n/a (account rule) | **Pipeline bug** — our own override said 60308009 |
| 5 | KHADER/OMAR 6905929962 | 1,826.09 | Emp 1000453→1002169; Agency 10200→10041 Fujifilm | Partially (CC/DIV yes; agency from email, not Manpower) | Manpower gap ("Need to allocate") — evidence supports him |
| 41 | AHMED ABDELGHAFAR 26-821 | 421.74 | Full combo → G&A/Strategy (60301004-170020-888-00000-88888); emp removed | Yes — codes match the G&A/Strategy team pattern | Pipeline over-aggregation; evidence supports him |
| 4,8–38,40,42 | 16 sponsorship rows | — | OPEX serial prefixed to Description | n/a | Convention to adopt |
| 9–37 (odd) | 12 split rows | — | GL Desc GE vs NUBOMED | His combos already = Manpower | **False diff** — version skew, already fixed |

## Things to flag / follow up

1. **Fix the Trip Account Override bug** — find where the final combo is written and make it consume col 63. This is the only place his file caught us factually wrong.
2. **Adopt the OPEX-serial Description prefix** for sponsorship rows (trivial: col 64 already holds it).
3. **His editing style is combo-only**: he never updates the individual code columns (19–28), so his returned files are internally inconsistent — any future automated comparison or re-import must treat the Distribution Combination string as his source of truth.
4. **Ask Labadi two questions**: (a) why employee 1002169 (Amoudi) specifically for Omar Khader's Fujifilm trip — the email doesn't name him; (b) should Amoudi's Manpower agency be corrected from NUBOMED to Fujifilm (he sits under the Fujifilm manager).
5. **Re-send him the current SPLIT** (09:27 regen) — his copy predates the GL-Description fix, so his sign-off was on slightly stale text.
6. Minor oddity left untouched by both sides: row 42 (MOSAAD ALHUSSEIN) was fuzzy-resolved to emp 1000587 in the trace but carries emp 1002483 in the cell; Labadi kept 1002483, so no conflict — just noting it.

I've saved the durable learnings (his conventions, the override bug, the allocation insights, the version-skew trap) to memory.
