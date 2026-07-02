# Reverse Manager Rule — Hand-Test Verification

**Date:** 2026-05-22

## Test 1: MERHEB/MOHAMAD MR ✅ PASS

- **Form Emp No:** 1002576
- **Email:** mmerheb@aljeel.com
- **1002576 in Manpower as employee?** NO
- **1002576 as Manager No?** YES — 6 reports:
  - 1000030 Ashraf Saad: loc=40100, CC=160013, DIV=192, AG=10200
  - 1000157 Ayman Elsafi: loc=10100, CC=160013, DIV=192, AG=10060
  - 1000375 Ahmad Al Baz: loc=10100, CC=160013, DIV=192, AG=10202
  - 1000428 Rafat Abu Dayah: loc=10100, CC=160013, DIV=192, AG=10202
  - 1001011 Mahmoud Wadi: loc=10100, CC=160013, DIV=192, AG=10005
  - 1002019 Mohammed Alattar: loc=10100, CC=160013, DIV=192, AG=10202

**Pool results:**
- CC: 160013 = 6/6 (100%) ≥ 50% → **160013** ✅
- DIV: 192 = 6/6 (100%) ≥ 50% → **192** ✅
- Agency: 10202=3/6 (50%) < 70% → **00000** (General) ✅
- Location: 40100 (first non-HQ) → **40100** ✅
- Solution: **00000** (manager, cross-cutting) ✅

**Golden expects:** 03-40100-60301003-160013-192-00000-00000-00000-00-000000  
**v13 produces:** 03-40100-60301003-160013-192-00000-00000-00000-00-000000  
**Result:** ✅ EXACT MATCH

## Test 2: HESHAM ALI (mgr 1002575) — NO_MAJORITY (expected)

- **Form Emp No:** 1002575
- **1002575 in Manpower as employee?** NO
- **1002575 as Manager No?** YES — 6 reports:
  - 1000097 Mazen Subhi Awad: CC=160030, DIV=190, AG=10200
  - 1000185 Rabee Kanani: CC=140020, DIV=190, AG=10200
  - 1000344 Meshal Aleshaiwy: CC=160040, DIV=190, AG=10200
  - 1000593 Feras Amro: CC=160014, DIV=170, AG=10200
  - 1001894 Karim Eletribi: CC=140045, DIV=190, AG=10200
  - 1002434 Nadeem Arar: CC=160014, DIV=170, AG=10239

**Pool results:**
- CC: 160014=2/6 (33%) < 50% → **NO MAJORITY** → cannot resolve
- DIV: 190=4/6 (67%) ≥ 50% → would pass, but CC gate fails first
- Result: `REVERSE_MANAGER_NO_MAJORITY` — line remains unresolved

**Why this is correct:** Hesham Ali manages across 5 different cost centers (160030, 140020, 160040, 160014, 140045) and 2 DIVs (170, 190). No single CC reaches 50%. Forcing a resolution here would be incorrect. These 5 lines were already `not_found` in v12 — no regression.

## Test 3: BELAL (emp 1000450, baseline) ✅ PASS

- **Form Emp No:** None (BELAL resolves via L1/L4)
- **1000450 in Manpower?** YES — normal employee
- **L7.5 trigger:** L7.5 only fires when Form Emp No is NOT in Manpower. Since BELAL resolves at L1/L4, L7.5 is never reached.
- **Result:** ✅ Not triggered — correct behavior

## Test 4: ZAKARIA AYESH (mgr 1000124) ✅ PASS

- **Form Emp No:** 1000124
- **1000124 in Manpower as employee?** NO
- **1000124 as Manager No?** YES — 4 reports:
  - 1000042 Hussam Quwaider: loc=40100, CC=250010, DIV=120, AG=10206
  - 1000266 Ahmed Elbana: loc=40100, CC=250010, DIV=120, AG=10206
  - 1000394 Husam Al Hajj: loc=40100, CC=250010, DIV=120, AG=10206
  - 1000425 Saleh Goulay: loc=40100, CC=250010, DIV=120, AG=10206

**Pool results:**
- CC: 250010 = 4/4 (100%) → **250010** ✅
- DIV: 120 = 4/4 (100%) → **120** ✅
- Agency: 10206 = 4/4 (100%) → **10206** ✅
- Location: 40100 = 4/4 → **40100** ✅
- **Result:** ✅ Clean resolution (all segments unanimous)

## Summary

| Test | Pax | Path | CC Pool | DIV Pool | Agency Pool | Outcome |
|------|-----|------|---------|----------|-------------|---------|
| 1 | MERHEB | A (form_empno) | 160013 (100%) | 192 (100%) | 00000 (split) | ✅ Resolved |
| 2 | HESHAM ALI | A (form_empno) | fragmented (33%) | 190 (67%) | 10200 (83%) | ⚠️ NO_MAJORITY |
| 3 | BELAL | N/A | N/A | N/A | N/A | ✅ Not triggered |
| 4 | ZAKARIA | A (form_empno) | 250010 (100%) | 120 (100%) | 10206 (100%) | ✅ Resolved |
