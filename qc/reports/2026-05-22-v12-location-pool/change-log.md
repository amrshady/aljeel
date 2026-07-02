# v12 Change Log (2026-05-22)

## Fix A: Smart Location Resolution
**File:** `scripts/cost_center_resolver.py`

**Problem:** Manpower Location column uses 10100 (HQ) as a placeholder for most employees,
but the golden (human-resolved) combos never use 10100 — they use 20100 (Riyadh), 40100 (Jeddah),
or 30100 (Dammam). The 40100 and 30100 codes in Manpower ARE reliable (93-100% match vs golden),
but 10100 is not.

**Rule implemented:**
- If Manpower Location is 40100 or 30100 -> use directly (reliable)
- If Manpower Location is 10100 (HQ placeholder) -> default to 20100 (Riyadh)
- If Manpower Location is 0 or null -> default to 20100 (Riyadh)
- If employee not in Manpower -> use 20100 (was 10100 before)

**New flag:** `LOCATION_HQ_DEFAULTED_TO_RIYADH` — added when 10100 is overridden to 20100.

**Impact:** Location accuracy improved from 46.2% to 54.7% (+8.5pp).

---

## Fix B: Need-to-allocate Team Pool Resolver
**File:** `scripts/allocation_resolver.py` (Tier 3: `_tier3_hierarchy`)

**Problem:** When a "Need to allocate" manager has multiple usable subordinates, v11 returned
MULTI_ALLOCATION_PENDING_REVIEW and used the manager's OWN segments. This was a missed
optimization — many managers' direct reports share the same (CC, DIV, Agency) segments.

**Rule implemented:**
1. Collect all "Can Be used" subordinates, recursing through sub-managers up to depth 3
2. Find the most common (CC, DIV, Agency) tuple among usable subordinates
3. If the best tuple has >50% of votes -> resolve using that tuple
4. If no clear majority (<= 50%) -> return MULTI_ALLOCATION_PENDING_REVIEW (no regression)
5. If 0 usable subordinates at any depth -> ALLOCATION_TARGET_MISSING

**New flag:** `RESOLVED_VIA_TEAM_POOL` — added when team pool resolves segments.

**>50% threshold rationale:** In the J26-640 golden, employee 1000430 had 38 usable subordinates
spread across 11 agencies with no majority (best was 13/38 = 34%). The golden used the employee's
OWN segments (Agency=10200), not any subordinate's. Forcing resolution at 34% would regress
Account and Agency accuracy. The threshold prevents this.

**Impact:** 7-10 additional lines resolved per batch. Account/Agency accuracy preserved at 95.7%/90.6%.

---

## Fix C: DIV 192/194/196 Name Lookup from Manpower
**File:** `scripts/code_name_lookup.py`

**Problem:** DIV codes 192, 194, 196 exist in Manpower (col 10 "New Division") with names
"Dental & Medical Solutions", "IVD Solutions", "Capital Equipment", but the DIV master tab
in the reference file doesn't include them. This caused the Block 2 "Contribution" column
to show `#N/A` for ~40 lines per batch.

**Rule implemented:**
- When expanding a combo for Block 2, use Manpower div_name (from Employee.div_name) as
  primary source for the "Contribution" column
- Fall back to DIV master tab lookup only if Manpower div_name is blank
- Added `manpower_div_name` field to `ResolvedLine` dataclass to carry this through

**Impact:** 36+ lines per batch now show proper DIV names instead of `#N/A`.
The MANPOWER_DIV_NOT_IN_MASTER flag still fires (for validation tracking) but the
Contribution column is no longer blank.
