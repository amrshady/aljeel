# v13 Change Log — Layer 7.5: Reverse Manager Lookup

**Date:** 2026-05-22  
**Author:** Malik (sub-agent)  
**Scope:** Single new resolution layer + re-run both batches

## What Changed

### New: Layer 7.5 — Reverse Manager Lookup

**File:** `scripts/employee_resolver_v2.py` — new function `_layer7_5_reverse_manager()`

**Trigger:** When a passenger's Form Emp No (from Oracle Fusion form) is NOT in Manpower as an employee BUT IS present as a Manager No for other employees.

**Algorithm:**
1. **Path A:** Form Emp No appears as `manager_no` for ≥1 Manpower employee
2. **Path B:** Email username (e.g. `mmerheb`) matches a Line Manager name in Manpower
3. **Path C:** GDS-normalized pax name fuzzy-matches a Line Manager name (≥80 threshold)

**Segment pooling (independent per segment):**
- **CC:** majority vote, ≥50% threshold required
- **DIV:** majority vote, ≥50% threshold required
- **Agency:** majority vote, ≥70% threshold required, else `00000` (General)
- **Solution:** always `00000` (managers are cross-cutting)
- **Location:** first non-HQ (non-10100) location among reports, else 10100 → Smart Location rule downstream

**When pool fails (no CC or DIV majority):** returns `REVERSE_MANAGER_NO_MAJORITY` flag — informational, line remains unresolved.

### Modified: `scripts/process_batch.py`

Added segment override handler: when `v2_result.segment_overrides` is present (from L7.5 resolution), overrides `resolve_line`'s default segments with the pooled values. Also reclassifies account (DIV-based: 888/190 → G&A 60301004, else S&M 60301003).

### Modified: `PROCESS/run_jawal_batch.sh`

Version bumped from `v12` to `v13`.

### Added to `ResolutionResult`

New `segment_overrides` field (dict or None) — carries pooled CC/DIV/Agency/Solution/Location when L7.5 resolves a manager.

## Files Modified

1. `scripts/employee_resolver_v2.py` — L7.5 function + ResolutionResult extension + cascade insertion
2. `scripts/process_batch.py` — segment override application block
3. `PROCESS/run_jawal_batch.sh` — version v12 → v13
