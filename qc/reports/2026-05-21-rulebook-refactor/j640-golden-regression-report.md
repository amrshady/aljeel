# J26-640 Golden Fixture Regression Report

**Date:** 2026-05-21
**Fixture:** `qc/fixtures/golden-j640/jawal-J26-640-resolved.xlsx` (117 lines)
**Master Data:** `qc/master-data/master-data-003.xlsx` (662 employees)

---

## Result: 94.9% Exact Match (111/117)

| Metric | Value |
|--------|-------|
| Total lines | 117 |
| Exact combo match | 111 (94.9%) |
| Drifts | 6 (5.1%) |
| Drift segments | **Location only** (all other 9 segments: 100%) |
| Account match | 117/117 (100%) |
| CostCenter match | 117/117 (100%) |
| DIV match | 117/117 (100%) |
| Solution match | 117/117 (100%) |
| Agency match | 117/117 (100%) |

## Drift Analysis

All 6 drifts are on the **Location** segment only. The golden fixture has hand-corrected Location values that differ from what Manpower shows for these employees.

| Row | Passenger | Golden Location | Manpower Location | Emp No in Golden | Manpower Name |
|-----|-----------|-----------------|-------------------|------------------|---------------|
| 23 | ALHAZZAA/KADI MS | 40100 (Jeddah) | 10100 (HQ) | not set | fuzzy match |
| 45 | MAHMOUD/BELAL MR | 40100 (Jeddah) | 10100 (HQ) | not set | fuzzy match |
| 67 | ABU DOGHMEH/SULTAN MR | 20100 (Riyadh) | 10100 (HQ) | 1000182 | Nabel Elkahlout |
| 68 | AMER/MOSTAFA MR | 20100 (Riyadh) | 10100 (HQ) | 1000182 | Nabel Elkahlout |
| 84 | HASHAD/TAREK MR | 40100 (Jeddah) | 10100 (HQ) | not set | fuzzy match |
| 101 | ELSHAMALY/MAHMOUD MR | 20100 (Riyadh) | 10100 (HQ) | not set | fuzzy match |

### Root Cause

These 6 employees either:
1. Have their HR Location in Manpower set to 10100 (HQ default) but actually sit in regional offices
2. Were hand-corrected by Laith's team in the golden fixture based on actual assignment

### Recommendation for Laith

Ask Laith to confirm whether these employees' Location should be updated in Manpower. If Manpower is authoritative, the golden fixture Locations need correction. If the golden fixture is correct, Manpower needs updating.

## Validation Excel

Output: `output/Spreadsheet-J26-640-FILLED-validation.xlsx`
- Contains three added columns: Agent Combo (re-derived), Agent Gate Result, Combo Diff
- Green = exact match, Amber = Location drift (soft)
- All other reference tabs preserved intact
