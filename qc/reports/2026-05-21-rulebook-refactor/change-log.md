# Change Log — 2026-05-21 Rulebook Refactor

**Date:** 2026-05-21
**Scope:** Full 10-segment Distribution Combination per cost-center-rulebook-v1.md
**Previous:** v4 (2-segment: Account.CostCenter)
**New:** v5-rulebook (10-segment: Company-Location-Account-CostCenter-DIV-Solution-Agency-Project-Intercompany-Future1)

---

## New Files Created

| File | Purpose |
|------|---------|
| `scripts/cost_center_resolver.py` | Master data loader + employee resolution + 10-segment combo builder |
| `qc/qc_gates.py` | 13 hard gates (H1-H13) + 10 soft gates (S1-S10) per rulebook Section 4 |
| `scripts/process_batch.py` | Batch processor v5 — reads Oracle template, fills full combo |
| `scripts/validate_golden.py` | Golden fixture (J26-640) regression validator |
| `scripts/generate_j640_validation.py` | Generates J26-640 re-derivation Excel for audit |

## Files NOT Modified (preserved as-is)

| File | Reason |
|------|--------|
| `pipelines/jawal.py` | Main pipeline (ticket-folder matching) — operates independently |
| `scripts/build_oracle_files.py` | Dashboard data builder — separate concern |
| `scripts/discover.py` | File discovery layer — no changes needed |
| `qc/qc_gate.py` | Original QC gate (JSON output validation) — separate from combo gates |
| `qc/qc_review.py` | AI-powered QC review — separate layer |

## Architecture

```
Master Data (003).xlsx ──→ cost_center_resolver.py ──→ Manpower lookup
                                                         │
J26-640-resolved.xlsx  ──→ Reference tabs (INDEX,      │
  (INDEX, DIV, Agency,      DIV, Agency, Solution,      │
   Solution, CC Segment)     CC Segment)                 │
                                                         │
Spreadsheet-v4.xlsx ────→ process_batch.py ──────────→ v5 output
  (with emp_no,              │                           │
   descriptions,             └── qc_gates.py ──────→ Gate results
   v4 account codes)             (H1-H13, S1-S10)
```

## Key Design Decisions

1. **v4 Account Preservation:** When the keyword classifier defaults to Rule 6/99 (generic travel), we preserve the account code from v4's 2-segment combo. The v4 pipeline had access to more context (email body, .msg files) for account classification.

2. **Manpower CCs in Valid Set:** The Cost Center Segment master tab has 135 entries but is incomplete — CCs 160011, 160012, 160013 appear in Manpower (28 distinct CCs) and the golden fixture but not in the master. We extend valid_cost_centers with all Manpower-assigned CCs.

3. **DIV 192/194/196 → Soft Gate:** These DIV codes appear in Manpower but not the DIV master. Per rulebook, they're flagged S8 (MANPOWER_DIV_NOT_IN_MASTER) rather than rejected with H7.

4. **EP Solution → SOLUTION_CODE_PENDING:** 4 employees with Solution="EP" use code 00000 until Laith provides the EP code. Flagged S9.

5. **Fixed Tail:** Project=00000, Intercompany=00, Future1=000000 — hardcoded per Laith's instruction.
