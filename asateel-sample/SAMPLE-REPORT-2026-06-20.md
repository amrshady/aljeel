# Asateel Sample Report — 5 invoices × 3 folders (2026-06-20)

Vendor: شركة اساطيل الطريق / Asatile Alttariq Co. — Land Transportation
VAT 314166819700003 · C.R. 7051361314 · buyer = Al Jeel Medical (VAT 300047873310003)

## Files picked (explicit)
- PROJECTS (مشاريع 13-2026): 03048, 03049, 03050, 03051, 03052
- ADMIN (اداره 8-2026): 03063, 03064, 03065, 03066, 03088
- CENTRAL (وسطي 11-2026): 03041, 03042, 03043, 03044, 03045

## Document structure (per PDF, 3 pages)
- **Page 1 = printed ZATCA tax invoice** (QR, VAT#, line table, totals). ALL usable structured
  data lives here. NOTE: tesseract returns page 1 blank (vector/QR render quirk) — vision/LLM OCR
  reads it cleanly. => pipeline must use image-LLM extraction for page 1, not tesseract.
- Page 2 = Al Jeel letterhead handwritten goods-receipt note (driver/car # handwritten, low value).
- Page 3 = Asateel "كشف التخريج" dispatch slip, mostly handwritten (illegible to OCR).

## Extracted records

### PROJECTS
| Inv | Date | Truck | Reference (المرجع) | Dispatch# | Supply Order | Subtotal | VAT | Total |
|---|---|---|---|---|---|---|---|---|
| 03048 | 02/05 | مبردة | القصيم | 03927 | 5786 | 1,600 | 240 | 1,840 |
| 03049 | 02/05 | مبردة | القصيم | 03928 | 5787 | 1,600 | 240 | 1,840 |
| 03050 | 02/05 | مبردة | جدة | 03929 | 5781 | 1,900 | 285 | 2,185 |
| 03051 | 02/05 | مبردة | المدينة | 03903 | 5957 | 1,900 | 285 | 2,185 |
| 03052 | 02/05 | مبردة | الدمام | 03904 | 5958 | 1,350 | 202.50 | 1,552.50 |

### ADMIN
| Inv | Date | Truck | Reference | Dispatch# | Supply Order | Subtotal | VAT | Total |
|---|---|---|---|---|---|---|---|---|
| 03063 | 02/05 | تريلا براد | الدمام | 03038 | 1549 | 1,850 | 277.50 | 2,127.50 |
| 03064 | 02/05 | تريلا براد | الدمام | 03933 | 1610 | 1,850 | 277.50 | 2,127.50 |
| 03065 | 02/05 | تريلا براد | الدمام | 03934 | 2151 | 1,850 | 277.50 | 2,127.50 |
| 03066 | 02/05 | لوري مبرد | جدة | 03935 | 1612 | 2,100 | 315 | 2,415 |
| 03088 | 04/05 | تريلا براد | جدة | 03049 | 1611 | 2,450 | 367.50 | 2,817.50 |

### CENTRAL (multi-line invoices appear here)
| Inv | Date | Truck | Reference | Dispatch# | Supply Order | Subtotal | VAT | Total |
|---|---|---|---|---|---|---|---|---|
| 03041 | 02/05 | مبردة (2 lines) | حائل / القصيم الوطني | 04104 | 26110785 / 26111081 | 2,500 | 375 | 2,875 |
| 03042 | 02/05 | مبردة | المختبرات التشخيصية | 04055 | 25070626 | 550 | 82.50 | 632.50 |
| 03043 | 02/05 | تريلا براد | الدمام | 04056 | 4348 | 1,850 | 277.50 | 2,127.50 |
| 03044 | 02/05 | مبردة (2 lines) | م/ابن خلدون + م/اسس الاعمال | 04057 | 26109036 / 26114186 | 750 | 112.50 | 862.50 |
| 03045 | 02/05 | تريلا براد (2 lines) | جدة + موقع اضافي | 04058 | 3955 | 2,650 | 397.50 | 3,047.50 |

## Allocation analysis (vs Aljeel_Lookups-v2 ONLY)
Allowed lookup sheets: Account, Agency(676), Solution(296), DIV(35), Manpower(663).

Fields available on the invoice to drive allocation:
1. **المرجع / Reference** — sometimes a city (القصيم/جدة/الدمام/حائل/المدينة) = pure route, NOT an
   allocation key; sometimes a business unit (المختبرات التشخيصية = Diagnostic Labs → Solution
   "Lab"/DIV 160; م/ابن خلدون, م/اسس الاعمال = project sites). This is the only field that hints at
   division/solution, but it is Arabic free-text and Agency/Solution/DIV descriptions are ENGLISH —
   no direct string join. Needs a curated Arabic→code map (small, build-once) or an LLM resolve step.
2. **أمر التوريد / Supply Order** — strongest structured key.
   - CENTRAL POs are long Oracle numbers (26110785, 25070626) → these are real Oracle PO refs.
   - PROJECTS/ADMIN POs are short internal nums (5786, 1549). Different numbering per stream.
   - On their own these don't resolve agency/CC without an external PO→cost-allocation source.
3. **Dispatch# (كشف التخريج)** — Asateel internal control number; not in any lookup. Useful only
   as a dedupe / cross-invoice uniqueness key (DUP catch).

## Honest gap (decision needed)
With ONLY Aljeel_Lookups-v2 and the invoice page-1 content, we CANNOT deterministically derive
Agency + Cost Center + Division for each ride. The lookups translate CODES→names; they do not map
a route/PO/customer→code. Jawal had the OPEX form + employee master to bridge that. Asateel's
equivalent bridge (route/customer → division/agency) is NOT inside Aljeel_Lookups-v2.

Options to close it (pick one):
- (A) Build a small **Arabic-reference → DIV/Solution/Agency map** from the المرجع values (finite set:
  cities + a handful of business-unit names). One-time table, then deterministic.
- (B) Get a **PO → cost-allocation** feed (the long Oracle PO numbers in CENTRAL imply this exists in
  Oracle) — cleanest, but is an extra input source.
- (C) LLM-resolve the Arabic reference to the closest Solution/DIV, YELLOW for review.

Constant for Asateel GL: account 61500027 (freight/transport), same 10-segment combo as Jawal output.
