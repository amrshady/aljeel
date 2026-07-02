# Cost Center & Distribution Combination Rule Book — v1

**Source of truth:** Laith Jaradat (AP Supervisor, AlJeel) on call 2026-05-21
**Golden fixture:** `jawal-J26-640-resolved.xlsx` Details tab (118 lines, all CLEAN/Post-to-GL)
**Master data:** `Master Data (003).xlsx` Manpower tab + `J26-640-resolved.xlsx` INDEX / DIV / Agency / Solution / Cost Center Segment tabs

---

## 1. Distribution Combination — exact structure

Output format (literal hyphens, fixed widths, all numeric, NO N/A allowed):

```
{Company}-{Location}-{Account}-{CostCenter}-{DIV}-{Solution}-{Agency}-{Project}-{Intercompany}-{Future1}
```

| Position | Segment | Width | Pad | Source |
|---|---|---|---|---|
| 1 | Company | 2 | left-zero | Constant `03` |
| 2 | Location | 5 | left-zero | `Manpower.Location` (col E) |
| 3 | Account (GL) | 8 | left-zero | `INDEX.Account` matched on expense type |
| 4 | Cost Center | 6 | left-zero | `Manpower.New cost center` (col M) |
| 5 | Division (DIV) | 3 | left-zero | `Manpower.Code` (col I) |
| 6 | Solution | 5 | left-zero | `Manpower.Solution` lookup (col P) or `00000` |
| 7 | Agency | 5 | left-zero | `Manpower.New agency` (col L) |
| 8 | Project | 5 | always | `00000` |
| 9 | Intercompany | 2 | always | `00` |
| 10 | Future 1 | 6 | always | `000000` |

**Total combo length:** 49 characters (10 segments + 9 hyphens).

---

## 2. Resolution order

For each invoice line, resolve in this order. Stop at first hard failure.

### Step 1 — Identify the employee
- Match by `Emp No New` (col M of Jawal invoice) → `Manpower.Emp No` (col A)
- If empty/missing → match by passenger name on `Manpower.Name` (fuzzy, ≥0.85 token-set ratio)
- If still no match → match by `.msg` filename regex `\((\d{7,8})\)` (already implemented as `msg_filename_empno_override` in v3)
- If still no match → **FAIL with `EMPLOYEE_NOT_IN_MASTER`** → CC = `999999` placeholder, halt for human review

### Step 2 — Check employee flag (col O = "Solution / Charge note")
- `Can Be used` → continue to Step 3
- `Need to allocate` → **HOLD**, parse approval email body for subordinate name, recurse Step 1 on that name
- `Charge to Medsource` → **FLAG**, route to MedSource entity (currently out of scope)
- `there should be no expenses if any charge to Erbe` → **FLAG**, change Agency to `10043` (Erbe) and post

### Step 3 — Classify expense type → Account
Apply rules in order; first match wins:

| Rule | Triggers | Account |
|---|---|---|
| 1 | Email subject/body contains `recruitment` / `candidate` / `interview` | `60308007` Recruitment Fees |
| 2 | Email subject/body contains `training` / `course` / `certification` | `60308009` Training Expenses |
| 3 | Email subject/body contains `annual ticket` / `annual leave` / `vacation entitlement` | `21070229` Accrued Annual Tickets |
| 4 | Email subject/body contains `sponsor` / `sponsorship` / pax not in Manpower (external doctor) | `60307021` Sponsoring Expenses |
| 5 | Pax in Manpower AND `DIV = 888 (G&A)` | `60301004` Travel Cost Expense G&A |
| 6 | Pax in Manpower AND DIV ≠ 888 (default) | `60301003` Travel Tickets Expense |
| 7 | Agency = GE (10081) AND email mentions "warranty" / "project" | `21070227` Accrued Project & Warranty (GE-specific) |
| 8 | Personal recharge marker in email | `11034013` Personal |
| 99 | Fallback | `60301003` + FLAG `ACCOUNT_DEFAULT_FALLBACK` |

### Step 4 — Pull DIV / CC / Agency / Solution from Manpower
- DIV = `Manpower.Code` (col I)
- Cost Center = `Manpower.New cost center` (col M)
- Agency = `Manpower.New agency code` (col K) — **NOT** col L which is the name
- Solution = `Manpower.Solution` (col P) if populated, else `00000`

> **Note:** Manpower has 28 distinct CC values, 32 agencies, 7 DIV codes. If the pulled value is outside the master tables in J26-640-resolved → REJECT.

### Step 5 — Append fixed tail
- Project = `00000`
- Intercompany = `00`
- Future 1 = `000000`

### Step 6 — Validate
Run the validation gates (Section 4). Any HARD failure → halt + halt-flag the line.

---

## 3. Lookup tables (cached snapshots — refresh from master each run)

### 3a. Location codes (Manpower observed)
- `10100` = HQ (Riyadh-area)
- `30100` = Dammam (Eastern)
- `40100` = Jeddah (Western)
- `20100` = Riyadh (mentioned by Laith but no current employees)

### 3b. DIV codes (full DIV master)
Used by employees: 120, 170, 190, 192, 194, 196, 888

| Code | Name |
|---|---|
| 000 | General |
| 100 | Jeel |
| 110 | DMS |
| 120 | Technical Services |
| 130 | SIS |
| 140 | Cardiac Sciences |
| 150 | PCS |
| 160 | Lab |
| **170** | **Contribution** (special — sales pool) |
| 190 | S&M |
| 192 | Dental & Medical Solutions (observed in CRM-employees, not in DIV master — needs Laith confirmation) |
| 194 | (observed in CRM-employees, needs Laith confirmation) |
| 196 | (observed, needs Laith confirmation) |
| 200 | Ajou |
| 260 | Contribution |
| 888 | **G&A** (Finance, HR, Admin, CEO Office) |
| 999 | Others |

> **OPEN QUESTION FOR LAITH:** Codes 192, 194, 196 appear in Manpower but not in the DIV master table. What do they represent?

### 3c. Solution codes (observed in Manpower)
- `10017` CRM (6 employees)
- `10050` HF — Heart Failure (3 employees)
- `?????` EP — Electrophysiology (4 employees) ← **WAITING ON LAITH for the code**
- `00000` everyone else (default)

> The Solution master tab has 298 codes; only 3 of them are wired to AlJeel employees today. All 3 sit under **Agency 10072 (Abbott)**.

### 3d. Agency codes (full Agency master — top ones in use)
- `00000` General
- `10041` Fujifilm
- `10043` Erbe
- `10071` Terumo
- `10072` Abbott
- `10081` GE
- `10100` Getinge
- `10101` Vygon
- `10111` Bio-Rad
- `10126` Sakura
- `10132` Illumina
- `10153` BMX
- `10155` Dirui
- `10156` NUBOMED
- `10200` S&M (Sales & Marketing — for non-agency-specific reps)
- `10202` Solventum
- `10206` Technical Services
- `88888` G&A (for G&A staff with no agency)
+ ~660 more codes in the master tab (long tail)

### 3e. Account codes (INDEX)
See Section 2 Step 3 table.

### 3f. Cost Center clusters (Cost Center Segment master, 136 entries)
- `110xxx` Board of Director / Group
- `120xxx` CEO Office
- `130xxx` Finance / Collection / Tax / Treasury
- `131xxx` Group & MGNT
- `140xxx` Supply Chain / Procurement / Operation / Logistics / Warehouse / Accounting GL / Treasury (AL Ajou)
- `150xxx` HR / Admin / Personnel
- `160xxx` Commercial / Sales / Tender / Regulatory / Showrooms
- `170xxx` Strategy / Marketing / Training & Development / Employee Engagement
- `180xxx` IT
- `190xxx` Legal / Compliance
- `200xxx` Maintenance (Central / Eastern / Western)
- `250xxx` Technical Services
- `300xxx`+ DMS / Distribution / Real Estate / Investment / Private Expenses
- `999xxx` Shared Services / placeholder

---

## 4. Validation gates

### Hard gates (REJECT — do not post)

| # | Gate | Failure code |
|---|---|---|
| H1 | Combo segment count ≠ 10 | `INVALID_COMBO_STRUCTURE` |
| H2 | Any segment is `N/A`, blank, or non-numeric where numeric required | `NON_NUMERIC_SEGMENT` |
| H3 | Company ≠ `03` | `INVALID_COMPANY` |
| H4 | Location not in {10100, 20100, 30100, 40100} | `UNKNOWN_LOCATION` |
| H5 | Account not in INDEX tab valid set | `UNKNOWN_ACCOUNT` |
| H6 | Cost Center not in Cost Center Segment master | `UNKNOWN_COST_CENTER` |
| H7 | DIV not in DIV master | `UNKNOWN_DIV` |
| H8 | Agency not in Agency master | `UNKNOWN_AGENCY` |
| H9 | Solution not in Solution master AND ≠ `00000` | `UNKNOWN_SOLUTION` |
| H10 | Project ≠ `00000` (exactly 5 zeros, no trim) | `BAD_PROJECT_PADDING` |
| H11 | Intercompany ≠ `00` (exactly 2 zeros) | `BAD_INTERCOMPANY_PADDING` |
| H12 | Future 1 ≠ `000000` (exactly 6 zeros) | `BAD_FUTURE_PADDING` |
| H13 | Segment width mismatch (e.g. CC = `16001` instead of `160013`) | `BAD_SEGMENT_WIDTH` |

### Soft gates (FLAG — post to HOLD queue for human review)

| # | Gate | Flag code |
|---|---|---|
| S1 | Employee flag = `Need to allocate` and no subordinate found in email body | `ALLOCATION_TARGET_MISSING` |
| S2 | Employee flag = `Charge to Medsource` | `MEDSOURCE_ROUTE` |
| S3 | Employee flag = `there should be no expenses if any charge to Erbe` and Agency ≠ 10043 | `ERBE_EXCEPTION` |
| S4 | Account = `60301003` default but DIV = `888` (G&A) | `MAYBE_60301004_GA` |
| S5 | Account = `60307021` (Sponsoring) but pax name matches Manpower employee | `EMPLOYEE_AS_SPONSORED` |
| S6 | Credit memo line without matching original invoice (folder match) | `ORPHAN_CREDIT_MEMO` |
| S7 | Employee not found in Master Data (CC = `999999` placeholder) | `EMPLOYEE_NOT_IN_MASTER` |
| S8 | DIV not in DIV master but appears in Manpower (192/194/196 cases) | `MANPOWER_DIV_NOT_IN_MASTER` |
| S9 | Employee Manpower.Solution populated but Solution code unknown to master (e.g. EP before Laith sends code) | `SOLUTION_CODE_PENDING` |
| S10 | Manager-level pax (DIV 888 + senior title) traveling without explicit allocation | `MANAGER_NOT_REALLOCATED` |

---

## 5. Golden-fixture regression check

Take `jawal-J26-640-resolved.xlsx` Details tab as canonical. For each of the 118 lines:

1. Construct the expected combo from columns O-AC (Company...Future1)
2. Run new agent on same input
3. Compare combo strings — must be **100% identical** for all 118 CLEAN lines
4. Any drift > 0% → HALT batch, surface diff to Laith
5. Flags column comparison (CLEAN / NO_APPROVAL / etc.) — drift ≤ 1% acceptable for now (some flags rely on email-body parsing which is probabilistic)

This becomes the new golden fixture replacing `archive/matched/jawal-j788-*.json` (which was 2-segment v2 era).

---

## 6. Open items to confirm with Laith / Labib

| # | Question | Owner | Blocking? |
|---|---|---|---|
| 1 | EP solution code | Laith → email | Yes — needed to clear S9 flags on EP employees |
| 2 | DIV codes 192, 194, 196 — what do they represent? | Laith / Labib | No — assume Dental & Medical Solutions variants for now |
| 3 | Manpower access for malik@accordpartners.ai (Access Denied during call) | Laith / Mohammed | No — we have local copy |
| 4 | Should the approval-email template be implemented? Standardized form attached? | Laith proposed → Amr approved → who builds the template? | No — proceed without, add later |
| 5 | Account `21070227` (Accrued Project & Warranty) — GE-only or also other agencies? | Laith | No — keep GE-only |
| 6 | Credit memos with no matching original — what's the canonical handling? | Laith | No — flag S6 for now |
| 7 | Should DIV `170` (Contribution) lines roll up to a different cost center? | Laith | No |

---

## 7. Implementation notes for the agent code

- The current `process_j26_788.py` etc. should be **renamed** to remove the J26-788 binding (this is the per-batch script, batch number changes monthly)
- All lookup tables loaded **once** at run start from `Master Data (003).xlsx` + `jawal-J26-640-resolved.xlsx` reference tabs
- Combo string built by `"-".join([str(s).zfill(W) for s,W in zip(segments,widths)])` — explicit zfill prevents the padding bugs Laith called out
- Hard-gate failures = no row written to output Excel; instead written to `qc/halt-queue/<batch>.json` for human review
- Soft-gate flags written to `Agent Flags` column (column AG in J26-640 format) — pipe-separated if multiple
- `Agent Action` column (AH) = `Post to GL` (passed all gates), `HOLD - <reason>` (soft gate), `REJECT - <reason>` (hard gate)

