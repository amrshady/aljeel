# Employee Resolution Cascade v2 — Build Report

**Generated:** 2026-05-21
**Batches tested:** J26-640, J26-788

## Executive Summary

### J26-640 (the hard batch)
| Metric | Before (v7) | After (v8) | Delta |
|--------|------------|------------|-------|
| Total lines | 117 | 117 | — |
| not_found | 72 (61.5%) | 8 (6.8%) | **-64 (-88.9%)** |
| emp_no_direct | 6 | 6 | — |
| name_fuzzy | 39 | — (replaced by L4) | — |
| Resolved via cascade | — | 103 | — |

### J26-788 (the easy batch)
| Metric | Before (v7) | After (v8) | Delta |
|--------|------------|------------|-------|
| Total lines | 103 | 103 | — |
| not_found | 2 | 2 | **No regression** |
| emp_no_direct | 99 | 99 | — |

## 10-Layer Resolution Cascade

| Layer | Name | Signal | Confidence | J26-640 Hits |
|-------|------|--------|------------|-------------|
| L0 | Direct emp_no | Spreadsheet column P | 1.00 | 6 |
| L1 | Form Emp No | Oracle Fusion Person Number | 1.00 | 36 |
| L1.5 | Email Match | @aljeel.com from .msg | 0.95-1.00 | 0* |
| L2 | MSG Filename | (NNNNNNN) in .msg filename | 0.98 | 3 |
| L3 | Ticket Folder Scan | Walk raw/date/ticket → .msg | 0.97 | 0 |
| L4 | GDS Fuzzy + Transliteration | rapidfuzz + Arabic→English normalization | 0.80-1.00 | 34 |
| L5 | Phonetic | Double Metaphone + transliteration | 0.75-0.95 | 0 |
| L6 | Arabic Name | Manpower Arabic Name column | 0.80-0.90 | 0 |
| L7 | Approver → Subordinate | Form approver → manager hierarchy | 0.63-0.90 | 0 |
| L8 | Cross-Batch Cache | Previously resolved passenger names | 0.93-0.95 | 0 |
| L9 | Sponsorship Auto-Route | External traveler / HCP detection | 0.80-0.95 | 30 |

*L1.5 shows 0 on first-batch run (no cache yet). On subsequent batches, learned emails resolve deterministically.

## Key Improvements in L4 (GDS Fuzzy)

The old `_fuzzy_name_match` function used basic token-set overlap. The new L4 uses:

1. **rapidfuzz** (token_set_ratio + token_sort_ratio) — much more robust than manual overlap
2. **Transliteration normalization** — handles Arabic→English variants:
   - ALANAZI ↔ ALENAZY (saved 6 FARHAN lines)
   - ALHAJJ → AL HAJJ (saved 1 HUSAM line)
   - SOBHI → SUBHI (saved 1 ALAAELDIN line)
3. **Article-splitting**: compound surnames like ALHAJJ split to "AL HAJJ" for matching
4. **Dual-path scoring**: raw fuzzy + normalized fuzzy, best score wins

## Sponsorship Auto-Routing (L9)

30 lines auto-routed to account 60307021 (Sponsoring Expenses):
- 12 lines: Airport ground services (pick up / drop off)
- 12 lines: Event/conference registrations (Heart Failure Barcelona, CardioMEMS, Prague Rhythm, HeartMate LVAS, DDW)
- 3 lines: Meeting room bookings
- 2 lines: Hotel bookings with OPEX reference
- 1 line: New employee annotation

## Email Layer (L1.5) — Cache Priming

### Coverage
- 46/117 lines in J26-640 had extractable @aljeel.com employee emails from .msg bodies
- 37 unique email→emp_no pairs derived and cached
- Extraction method: inner forwarded From: header (priority a)

### Deliverables for Laith
- `proposed-manpower-email-column.csv` — 37 rows: Emp No, Email
- If Laith adds this as a column to Manpower, L1.5 becomes deterministic (conf 1.0)
- Without Manpower column, L1.5 still resolves via learned cache (conf 0.95)

## Remaining not_found (8 lines)

| Row | Passenger | Reason |
|-----|-----------|--------|
| 0 | MERHEB/MOHAMAD MR | Emp 1002576 NOT in Manpower |
| 1 | ALWAKEEL/AMR MR | Not in Manpower |
| 8,9,29,112,113 | ALI/HESHAM MR (5 lines) | No "Hesham Ali" in Manpower |

**All 8 are genuinely absent from the 662-row Manpower master.** No further resolution possible without data update from HR.

## Files Modified/Created

### New files
- `scripts/employee_resolver_v2.py` — 10-layer cascade engine
- `scripts/email_resolver.py` — Email extraction + L1.5 + cache + reporting
- `cache/passenger_to_empno.json` — Cross-batch name cache (34 entries)
- `cache/email_to_empno.json` — Cross-batch email cache (36 entries)
- `cache/manpower_email_derived.json` — Proposed Manpower Email column (37 entries)
- `qc/reports/2026-05-21-resolver-v2/` — All reports

### Modified files
- `scripts/process_batch.py` — Wired v2 cascade + email extraction
- `scripts/cost_center_resolver.py` — No changes (stable)

### Dependencies added
- `rapidfuzz` (v3.14.5) — fuzzy string matching
- `metaphone` (v0.6) — phonetic encoding
