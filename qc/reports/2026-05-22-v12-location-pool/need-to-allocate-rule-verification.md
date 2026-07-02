# Fix B: Need-to-Allocate Team Pool Pre-Wiring Verification

## Test Cases (5 known Need-to-allocate managers)

### 1000157 — Ayman Elsafi (4 reports, all Can Be used)
- Direct reports: 4, all Can Be used
- Pool tuples: (160013, 192, 10060) x3, (160013, 192, 10062) x1
- Best tuple: (160013, 192, 10060) — 3/4 = 75% ✅ (majority)
- **Expected:** RESOLVED_VIA_TEAM_POOL with CC=160013, DIV=192, Agency=10060
- **Result:** ✅ Correct

### 1000173 — Mohamed Eltoukhi (4 reports, all Can Be used)
- Direct reports: 4, all Can Be used
- Pool tuples: (160012, 194, 10113) x3, (160012, 194, 10153) x1
- Best tuple: (160012, 194, 10113) — 3/4 = 75% ✅ (majority)
- **Expected:** RESOLVED_VIA_TEAM_POOL with CC=160012, DIV=194, Agency=10113
- **Result:** ✅ Correct

### 1000182 — Nabel Elkahlout (4 reports: 3 Can Be used + 1 Need to allocate)
- Direct reports: 4 total, 3 Can Be used (1 Need-to-allocate skipped)
- Pool tuples: (160012, 194, 10126) x2, (160012, 194, 10125) x1
- Best tuple: (160012, 194, 10126) — 2/3 = 67% ✅ (majority)
- **Expected:** RESOLVED_VIA_TEAM_POOL with CC=160012, DIV=194, Agency=10126
- **Result:** ✅ Correct

### 1000181 — Tarek Hashad (3 reports, all Need to allocate)
- Direct reports: 3, ALL Need to allocate
- Recursed to depth 2: all 3 sub-managers have 0 reports
- Total usable: 0
- **Expected:** ALLOCATION_TARGET_MISSING (no fabrication)
- **Result:** ✅ Correct

### 1000030 — Ashraf Saad (0 reports)
- Direct reports: 0
- **Expected:** ALLOCATION_TARGET_MISSING
- **Result:** ✅ Correct

## >50% Threshold Verification: Manager 1000430
- 38 usable subordinates (recursed to depth 2-3)
- 11 distinct Agency codes, most common: 10156 with 13/38 = 34%
- 34% < 50% threshold → NOT resolved → MULTI_ALLOCATION_PENDING_REVIEW
- Golden uses employee's OWN Agency (10200) for this case
- **Result:** ✅ Threshold prevents regression

## Summary
- 5/5 test cases behave as expected
- Threshold correctly prevents over-resolution on fragmented pools
- No fabrication when 0 usable subordinates exist
