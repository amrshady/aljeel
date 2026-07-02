# Consolidated Cross-Batch Rollup Report

**Generated:** 2026-05-21 | **Pipeline:** v7-validated | **Batches:** J26-640, J26-788

## Executive Summary

| Metric | J26-640 | J26-788 | Combined |
|--------|---------|---------|----------|
| Total lines | 117 | 103 | 220 |
| Clean (Post to GL) | 0 | 0 | 0 |
| Hard failures (REJECT) | 0 | 0 | 0 |
| Soft flags (HOLD) | 117 | 103 | 220 |
| HOLD rate | 100% | 100% | 100% |
| Period | 24-30 Apr 2026 | 01-07 May 2026 | 2 weeks |

### Key Finding
- **Zero hard failures** across both batches - all combos are structurally valid 10-segment codes
- **100% HOLD rate** in both batches due to soft flags (primarily MANPOWER_DIV_NOT_IN_MASTER and FORM_NOT_FOUND_IN_EMAIL)
- J26-640 has 72 EMPLOYEE_NOT_IN_MASTER (61.5% of lines) because most lines lack employee numbers in the raw invoice
- J26-788 has 99/103 lines resolved via emp_no_direct (96.1%) because v4 template pre-filled employee numbers

## Per-Batch Match Methods

| Method | J26-640 | J26-788 |
|--------|---------|---------|
| allocation_email_subordinate (hierarchy_single) | 0 | 2 |
| emp_no_direct | 6 | 99 |
| name_fuzzy | 39 | 0 |
| not_found | 72 | 2 |

## Cross-Batch Trends

### Top 10 Employees by Trip Count (Both Batches)

| Emp No | Name | Trips |
|--------|------|-------|
| 1000222 | AHMED/AHMED MOHAMED MR | 6 |
| 1001811 | ALEM/AHMED MR | 5 |
| 1000789 | ALBALAWI/SAUD MR | 5 |
| 1002217 | BIN RAJAB | 5 |
| 1000030 | SAAD/ASHRAF MR | 4 |
| 1000473 | SHAYEB/ABDALLAH MR | 4 |
| 1002405 | RATL/CHARLES MR | 3 |
| 1002119 | ALBALBESI/NASSER MR | 3 |
| 1002308 | AL DIGHRIR | 3 |
| 1000182 | ELKAHLOUT/NABEL MR | 3 |

### Top 10 Cost Centers by Spend (SAR)

| Cost Center | Total Spend (SAR) |
|-------------|-------------------|
| 999999 | 204,183.51 |
| 160012 | 75,626.99 |
| 250010 | 65,020.06 |
| 160013 | 31,670.03 |
| 160011 | 28,100.40 |
| 140020 | 13,600.00 |
| 160014 | 6,380.00 |
| 130040 | 5,380.00 |
| 140010 | 2,385.00 |
| 140030 | 1,830.00 |

### Account Distribution

| Account | J26-640 | J26-788 | Total |
|---------|---------|---------|-------|
| 60301003 | 106 | 90 | 196 |
| 60301004 | 6 | 5 | 11 |
| 60307021 | 5 | 8 | 13 |

### Same DIV/Agency/Solution Combos in Both Batches

**9 high-confidence patterns** appear in both batches:

| DIV | Agency | Solution |
|-----|--------|----------|
| 000 | 00000 | 00000 |
| 120 | 10206 | 00000 |
| 190 | 10200 | 00000 |
| 194 | 10111 | 00000 |
| 194 | 10126 | 00000 |
| 194 | 10153 | 00000 |
| 194 | 10155 | 00000 |
| 196 | 10081 | 00000 |
| 888 | 88888 | 00000 |

## Discrepancy Aggregation

### Employee Number Mismatches (15 total)

- **J26-640:** ALHAZZAA/KADI MS - RUH TIF RUH (6905318870)
- **J26-640:** ALZAHRANI/ALI MR - RUH YNB RUH (6905341954)
- **J26-640:** MAHMOUD/BELAL MR - RUH TIF (6905342011)
- **J26-640:** ABU DOGHMEH/SULTAN MR - RUH AUH BCN AUH RUH (6905369300)
- **J26-640:** AL KHUDHAYR/AHMED MR - DMM RUH AQI (6905369361)
- **J26-640:** ELSHAMALY/MAHMOUD MOFEED MR - JED RUH JED (6905397738)
- **J26-640:** MAHMOUD/MOHAMMAD MR - JED YNB JED (6905397761)
- **J26-788:** HADDAD/HAMZAH MR - RUH JED (6905478435)
- **J26-788:** HADDAD/HAMZAH MR - JED RUH (6905533359)
- **J26-788:** ALMADHUN/ABDULRAHMAN MR - JED ABT JED (6905569440)
- **J26-788:** SHAYEB/ABDALLAH MR - AHB RUH (6905569509)
- **J26-788:** KALTHOUM/ABDALLAH MR - JED RUH JED (6905569511)
- **J26-788:** SHAYEB/ABDALLAH MR - RUH GIZ (6905569512)
- **J26-788:** ABDULLATIF/SALEM MR - JED MED JED (6905569515)
- **J26-788:** ALJAMAL/MOHAMMED ABDULMAJEED MR - RUH AJF RUH (6905600626)

### FORM_DISAGREES / FORM_TRIP_VALUE_DIFFERS (94 total)

- J26-640: 40
- J26-788: 54

### MANPOWER_DIV_NOT_IN_MASTER (79 total)

- J26-640: 19
- J26-788: 60

### ALLOCATION_TARGET_MISSING (22 total)

- J26-640: 8
- J26-788: 14

## Flag Breakdown (Combined)

| Flag | J26-640 | J26-788 | Total |
|------|---------|---------|-------|
| FORM_NOT_FOUND_IN_EMAIL | 74 | 48 | 122 |
| FORM_TRIP_VALUE_DIFFERS | 40 | 54 | 94 |
| FORM_FUSION_CODES_LOGGED | 37 | 48 | 85 |
| MANPOWER_DIV_NOT_IN_MASTER | 19 | 60 | 79 |
| EMPLOYEE_NOT_IN_MASTER | 72 | 2 | 74 |
| ALLOCATION_TARGET_MISSING | 8 | 14 | 22 |
| FORM_EMP_NO_MISMATCH | 7 | 8 | 15 |
| MULTI_ALLOCATION_PENDING_REVIEW | 4 | 10 | 14 |
| EMPLOYEE_AS_SPONSORED | 5 | 8 | 13 |
| MANAGER_NOT_REALLOCATED | 2 | 3 | 5 |
| FORM_AGREES_WITH_MANPOWER | 3 | 1 | 4 |
| OPEX_PDF_PARSED | 2 | 0 | 2 |
| ALLOCATION_RESOLVED_HIERARCHY | 0 | 2 | 2 |
| SOLUTION_CODE_PENDING | 0 | 1 | 1 |

## Golden Fixture Cross-Check (J26-640 Only)

Pipeline output vs Laith's manual resolution:

- **Employee found (45 lines):** 82.2% match (exact + location-only drift)
- **Employee not found (72 lines):** 0% match (expected - no Manpower data to resolve)
- **8 non-location diffs** in found-employee group: all `name_fuzzy` matches where pipeline may have matched wrong employee
- **28 location-only drifts:** Manpower shows HQ (10100), golden shows regional (20100/30100/40100) - known systematic gap

## Updated Asks for Laith (Consolidated, Deduped)

1. **Employee numbers for J26-640:** 72/117 lines have no emp number in the invoice. Need Laith's team to provide emp numbers for unresolved lines (or confirm the Oracle template will pre-fill them)
2. **Location mapping:** Manpower uses HQ location (10100) for employees based in regional offices. Need authoritative location → Manpower mapping, or confirm Fusion's Location segment should be used
3. **DIV code gaps:** DIV codes 192, 194, 196 appear in golden but not in Master Data DIV tab. Need these added or confirmed as valid
4. **Fusion → Manpower code mapping:** See `fusion-mapping-empirical-v2.md` for the empirical table with confidence levels
5. **Sponsorship workflow:** 5 sponsorship cases in J26-640, 8 in J26-788 - need confirmation of correct account/cost center routing for sponsored travel

## J26-788 Rerun Validation

**Rerun is byte-identical to original** across all summary fields:
- total_lines, clean_lines, hard_failures, soft_flags: MATCH
- flag_breakdown: MATCH
- match_method_breakdown: MATCH
- account_breakdown: MATCH
- Confirms code stability - same input + same code = same output
