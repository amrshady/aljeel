# Golden Field-Level Diff: v12 vs v13

**Date:** 2026-05-22  
**Batch:** J26-640

## Per-Segment Golden Match Rates

| Segment | v12 | v13 | Delta |
|---------|-----|-----|-------|
| Account | 95.7% (112/117) | 95.7% (112/117) | +0 |
| CC | 90.4% (106/117) | 91.5% (107/117) | **+1** |
| DIV | 90.4% (106/117) | 91.5% (107/117) | **+1** |
| Solution | 100% (117/117) | 100% (117/117) | +0 |
| Agency | 90.4% (106/117) | 91.5% (107/117) | **+1** |
| Location | 53.9% (63/117) | 54.7% (64/117) | **+1** |
| Full combo | 51.3% (60/117) | 52.1% (61/117) | **+1** |

*Note: Per-segment gains are all from MERHEB (Row 1) moving from default (999999/000/00000/10100) to golden-matching (160013/192/00000/40100).*

## Match Method Shift (v12 → v13)

| Method | v12 | v13 | Delta |
|--------|-----|-----|-------|
| emp_no_direct | 4 | 4 | 0 |
| v2_L1 (Form Emp No) | 34 | 34 | 0 |
| v2_L1.5 (Email) | 2 | 2 | 0 |
| v2_L2 (MSG filename) | 2 | 2 | 0 |
| v2_L4 (GDS fuzzy) | 30 | 30 | 0 |
| v2_L7.5 (Reverse Mgr) | 0 | **6** | **+6** |
| v2_L8 (Cache) | 4 | 4 | 0 |
| v2_L9 (Sponsorship) | 27 | 27 | 0 |
| allocation/team_pool | 7 | 7 | 0 |
| not_found | **7** | **1** | **-6** |

## EMPLOYEE_NOT_IN_MASTER Flag

| Version | Count |
|---------|-------|
| v12 | 34 |
| v13 | 33 |
| Delta | **-1** |

Only 1 line (MERHEB) had EMPLOYEE_NOT_IN_MASTER removed (replaced by segment override). The 5 HESHAM ALI lines retain the flag because their pools failed the CC majority threshold.

## J26-788 Regression Check

| Metric | v12 | v13 |
|--------|-----|-----|
| Total lines | 103 | 103 |
| emp_no_direct | 91 | 91 |
| team_pool | 10 | 10 |
| not_found | 2 | 2 |
| EMPLOYEE_NOT_IN_MASTER | 2 | 2 |
| Golden fixture regression | 100% pass | 100% pass |

**Zero regression on J26-788.** ✅

## MERHEB Line Detail (the canonical fix)

| Segment | v12 (not_resolved) | v13 (L7.5) | Golden | Match? |
|---------|-------------------|------------|--------|--------|
| Company | 03 | 03 | 03 | ✅ |
| Location | 20100 | **40100** | 40100 | ✅ |
| Account | 60301003 | 60301003 | 60301003 | ✅ |
| CC | 999999 | **160013** | 160013 | ✅ |
| DIV | 000 | **192** | 192 | ✅ |
| Solution | 00000 | 00000 | 00000 | ✅ |
| Agency | 00000 | 00000 | 00000 | ✅ |
| Project | 00000 | 00000 | 00000 | ✅ |
| Intercompany | 00 | 00 | 00 | ✅ |
| Future1 | 000000 | 000000 | 000000 | ✅ |
| **Full combo** | **MISS** | **MATCH** | — | ✅ |
