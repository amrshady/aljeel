# DRAFT — Manpower / Cost-Center Allocation Update Request: J26-954

**To:** Qasim Mohammad (Sr Finance Manager) / Laith Jaradat
**From:** AP Agent (AlJeel)
**Re:** Stale Oracle Manpower data causing hard-fails + soft flags on J26-954 (16–23 Jun)

---

Hi Qasim,

J26-954 processed (139 lines), but a batch of rows is blocked or flagged because the **Oracle Manpower export we validate against (`Aljeel_Lookups-v2.xlsx`, Manpower sheet) is stale** for these employees. A refreshed export with their division + cost-center allocation would clear most of it.

## A. 5 HARD FAILURES — blocking Fusion posting (must fix first)

All 5 trip the **H6 UNKNOWN_COST_CENTER** gate. Two root causes:

**A1 — Cost center blanked to 000000 by annual-ticket account override (2 rows):**
| Sl. | Emp No | Passenger | Account | Amount (SAR) |
|---|---|---|---|---|
| 23 | 1002201 | ALJUNDI/LAMA MS | 21070229 | 10,470 |
| 24 | 1002013 | MOWAFI/IYAD MR | 21070229 | 2,220 |
These also have ANNUAL_HR_APPROVAL_MISSING. Need: confirm the correct cost center for each (the override to 21070229 Accrued Annual Tickets is currently zeroing the CC).

**A2 — Valid cost center, but employee on stale Manpower row (3 rows):**
| Sl. | Emp No | Passenger | Cost Center | Amount (SAR) |
|---|---|---|---|---|
| 109 | 1000378 | HAZIMEH/RIHAM MRS | 160011 | 3,150 |
| 112 | 1000378 | KHADOUJ AWADA/ISSA MR(CHD) | 160011 | 2,610 |
| 114 | 1001105 | BAZRBASHI/HEBAH MRS | 160013 | 830 |
Note: CCs 160011 / 160013 ARE valid codes in the master — they fail only because these employees' Manpower rows are incomplete (DIV not in master too). A refreshed allocation for emp 1000378 and 1001105 clears these.

## B. 13 "NEED TO ALLOCATE" employees (red — ALLOCATION_TARGET_MISSING)

These employees are marked **"Need to allocate"** in the Manpower sheet (sol_flag) — they have no confirmed allocation target, so their rows are forced RED. Please assign each a final cost center / division:

| Emp No | Passenger | Current CC | Current DIV |
|---|---|---|---|
| 1000467 | ELKILO/ABDELRAHMAN MR | 160012 | 194 |
| 1002294 | AHMED/NAGMALDIN MR | 160012 | 194 |
| 1002217 | BIN RAJAB/FERAS MR | 160012 | 194 |
| 1001799 | JAMAL/ABDULMALIK MR | 160012 | 194 |
| 1002398 | ALHARBI/ALBARAA MR | 160012 | 194 |
| 1001686 | ELSHAMALY/MAHMOUD MOFEED MR | 160012 | 194 |
| 1002378 | SHAYEB/ABDALLAH MR | 160012 | 194 |
| 1000523 | RASHWAN/SHADI MR | 160011 | 196 |
| 1000320 | ZEIADEH/AYED MR | 160011 | 196 |
| 1001406 | ISMAIEL/YASIN MR | 160011 | 196 |
| 1000378 | HAZIMEH/RIHAM MRS | 160011 | 196 |
| 1000615 | SHARIF/AAMIR MR | 160011 | 196 |
| 1002405 | RATL/CHARLES MR | 160011 | 196 |

## C. MANPOWER_DIV_NOT_IN_MASTER (soft — ~59 rows)

A wider set of employees carry DIV codes (192/194/196) that aren't in the current DIV master. These are soft flags (won't block posting) but inflate the review queue. A refreshed Manpower + DIV master would clear most of the long tail in one pass.

## What we need from you

1. **Confirmed cost center + division** for the 5 hard-fail employees (Section A) — unblocks Fusion.
2. **Allocation target** for the 13 "Need to allocate" employees (Section B).
3. Ideally a **fresh full Manpower export** (replaces `Aljeel_Lookups-v2.xlsx` Manpower sheet) to also clear Section C.

Once updated, I'll reload the master and re-run J26-954 — most RED rows should drop to GREEN/YELLOW.

Thanks,
AP Agent
