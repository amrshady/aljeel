# J26-788 Re-run Report (v5-rulebook)

**Date:** 2026-05-21
**Input:** `Spreadsheet-J26-788-FILLED-v4.xlsx` (v4 with 2-segment combos)
**Output:** `Spreadsheet-J26-788-FILLED-v5-rulebook.xlsx` (full 10-segment combos)
**Master Data:** 662 employees, 144 valid CCs, 35 DIVs, 676 agencies, 296 solutions

---

## Summary

| Metric | Value |
|--------|-------|
| Total lines | 103 |
| Clean (Post to GL) | 35 (34.0%) |
| Hard gate failures | 0 |
| Soft gate flags | 68 (66.0%) |
| Emp match: direct | 101 (98.1%) |
| Emp match: not found | 2 (1.9%) |

## Flag Breakdown

| Flag | Count | Description |
|------|-------|-------------|
| MANPOWER_DIV_NOT_IN_MASTER (S8) | 60 | DIV 192/194/196 — in Manpower but not DIV master |
| ALLOCATION_TARGET_MISSING (S1) | 26 | Employee flag = "Need to allocate" |
| EMPLOYEE_AS_SPONSORED (S5) | 8 | Sponsoring account but pax is known employee |
| MANAGER_NOT_REALLOCATED (S10) | 3 | G&A manager traveling on own CC |
| EMPLOYEE_NOT_IN_MASTER (S7) | 2 | ALSABRI/GHAIDAA refund lines (known case) |
| SOLUTION_CODE_PENDING (S9) | 1 | EP employee (ELSHAZLI/OMAR) — waiting on Laith |

## Key Observations

### MANPOWER_DIV_NOT_IN_MASTER (60 lines)
These are employees in DIV codes 192, 194, 196 which appear in the Manpower tab but not in the DIV master (J26-640-resolved DIV tab). Laith needs to confirm what these codes represent. They produce valid combos — the flag is informational.

### ALLOCATION_TARGET_MISSING (26 lines)
These employees have Solution/Charge note = "Need to allocate" in Manpower col O. Per the rulebook, the agent should parse the approval email body for a subordinate name and recurse. Currently flagged for human review since email parsing isn't implemented in this batch (email bodies not available in the Oracle template input).

### EMPLOYEE_NOT_IN_MASTER (2 lines)
Both are ALSABRI/GHAIDAA refund lines (from original J26-640). Expected behavior — she's not in the current Manpower snapshot. Combo uses 999999 placeholder CC.

### SOLUTION_CODE_PENDING (1 line)
ELSHAZLI/OMAR at Abbott (Agency 10072), DIV 170 (Contribution). His Solution name is "EP" but the code is pending from Laith. Combo uses 00000 for Solution.

## Combo Format Verification

All 103 lines produce exactly 10 segments with correct widths:
- Company: 2 chars (always "03")
- Location: 5 chars
- Account: 8 chars
- CostCenter: 6 chars
- DIV: 3 chars
- Solution: 5 chars
- Agency: 5 chars
- Project: 5 chars (always "00000")
- Intercompany: 2 chars (always "00")
- Future1: 6 chars (always "000000")

### Example Combos (v4 → v5)

| Passenger | v4 (2-seg) | v5 (10-seg) |
|-----------|------------|-------------|
| ELZAIM/AHMAD MR | 60301003.250010 | 03-10100-60301003-250010-120-00000-10206-00000-00-000000 |
| ALANAZI/FARHAN MR | 60301003.140020 | 03-10100-60301003-140020-190-00000-10200-00000-00-000000 |
| MAHMOUD/BELAL MR | 60301003.160011 | 03-10100-60301003-160011-196-00000-10081-00000-00-000000 |
| ALBASIRI/SALEH MR | 60307021.160013 | 03-10100-60307021-160013-192-00000-10060-00000-00-000000 |
