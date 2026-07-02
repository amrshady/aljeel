# Output Restructure — Change Log (2026-05-22)

## What Changed

The v10 output Excel has been restructured from a flat ~43-column layout into **3 clearly separated blocks**:

### Block 1 — Oracle Fusion Template (cols A-P, 16 cols)
- **No change.** Identical to the original Oracle Fusion import template.
- Header row at row 3 (rows 1-2 per Oracle convention).
- Light blue header fill (`#D9E1F2`).

### Block 2 — Code & Description Expansion (cols Q-AE, 15 cols) — NEW
Each segment code from the 10-segment Distribution Combination is split out with its human-readable name:

| Col | Header | Source |
|-----|--------|--------|
| Q | Company | Always `03` |
| R | Location | From resolved line |
| S | Account | 8-digit account code |
| T | GL | INDEX tab lookup → account description |
| U | Cost Center | 6-digit CC code |
| V | Cost Name | Cost Center Segment tab lookup |
| W | DIV | 3-digit division code |
| X | Contribution | DIV tab lookup → division description |
| Y | Solution | 5-digit solution code |
| Z | Solution Name | Solution tab lookup |
| AA | Agency | 5-digit agency code |
| AB | Agency Name | Agency tab lookup |
| AC | Project | Always `00000` |
| AD | Intercompany | Always `00` |
| AE | Future 1 | Always `000000` |

- Failed lookups show `#N/A` (literal text, matches user screenshot convention).
- Light green header fill (`#C6EFCE`).
- Lookup tables loaded from `qc/fixtures/golden-j640/jawal-J26-640-resolved.xlsx`.

### Block 3 — Debug / Agent Columns (cols AF-BE, 26 cols)
All existing debug/agent columns moved here with `Row Status` first:

| Col | Header |
|-----|--------|
| AF | Row Status (GREEN/YELLOW/RED) |
| AG | QC Catches |
| AH | Agent Flags |
| AI | Agent Action |
| AJ-BE | (remaining debug columns — see headers) |

- Light gray header fill (`#E7E6E6`).

### Visual UX
- **Row 2** has bold block labels spanning each section: "ORACLE FUSION TEMPLATE" / "CODE & DESCRIPTION" / "DEBUG (delete before posting)"
- **Row 3** has color-coded headers per block
- **Row colors** (green/yellow/red) apply across ALL columns A-BE
- **Yasser/Laith workflow:** Select cols AF onwards → Delete → Save → Clean 31-col file matching the original golden Details tab layout

## Files Added
- `scripts/code_name_lookup.py` — standalone lookup module (9 account codes, 128 CC, 35 DIV, 296 solutions, 676 agencies)

## Files Modified
- `scripts/process_batch.py` — output write section restructured (backup: `process_batch.py.bak-pre-restructure-*`)

## No Changes To
- `PROCESS/run_jawal_batch.sh` — wrapper unchanged
- `PROCESS/PROCESS.md` — spec unchanged
- All QC modules, resolvers, caches — untouched
- Golden fixture regression — still 100% on both batches
