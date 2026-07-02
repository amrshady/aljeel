# v13 Layer 7.5 Hits — All Lines

**Batch:** J26-640  
**Total L7.5 triggers:** 6 (1 resolved, 5 no-majority)

## Resolved Lines (segment overrides applied)

### Row 1: MERHEB/MOHAMAD MR
- **Description:** RUH JED RUH (ticket 6905264364)
- **Resolution path:** Path A — Form Emp No 1002576 as Manager No
- **Manager:** Mohamad Mohamad Merheb (6 direct reports)
- **Pooled segments:** CC=160013, DIV=192, Agency=00000, Solution=00000, Location=40100
- **v12 combo:** 03-20100-60301003-999999-000-00000-00000-00000-00-000000 (not_resolved)
- **v13 combo:** 03-40100-60301003-160013-192-00000-00000-00000-00-000000
- **Golden combo:** 03-40100-60301003-160013-192-00000-00000-00000-00-000000
- **Result:** ✅ EXACT GOLDEN MATCH

## No-Majority Lines (informational flag, segments unchanged)

### Row 9: ALI/HESHAM MR
- **Description:** RUH JED (ticket 6905264402)
- **Manager:** Hesham Ahmed Ali (mgr 1002575, 6 reports)
- **CC pool:** 160014(2), 160030(1), 140020(1), 160040(1), 140045(1) — best 33% < 50%
- **Flag:** REVERSE_MANAGER_NO_MAJORITY
- **v12 status:** not_found → v13: still unresolved (correctly)

### Row 10: ALI/HESHAM MR
- **Description:** JED RUH (ticket 6905264403)
- Same manager as Row 9

### Row 30: ALI/HESHAM MR
- **Description:** RUH JED (ticket 1936040471)
- Same manager as Row 9

### Row 113: ALI/HESHAM MR
- **Description:** RUH CMN (ticket 6905428812)
- Same manager as Row 9

### Row 114: ALI/HESHAM MR
- **Description:** CMN IST RUH (ticket 6905428813)
- Same manager as Row 9

## J26-788 Impact

**Zero L7.5 triggers.** All 103 lines resolve via emp_no_direct (91) or team_pool allocation (10) or not_found (2). No change from v12.
