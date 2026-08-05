Implemented the separate opt-in Asateel project allocation mode: `projects-labadi-v1`. Standard/non-project behavior remains the default and unchanged.

Key behavior:

- Resolves canonical agency code first using exact code or normalized exact alias.
- Overrides employee based on the resolved agency.
- BMX maps 12 explicit juniors to 3 designated heads.
- No fuzzy runtime lookup or invented codes.
- Unknown/conflicting values become YELLOW review cases with audit explanations.
- Mode is restricted to `PROJECTS` invoices; `CENTRAL` and `ADMIN` reject it.

Lookup results:

- Source SHA-256: `a1a2cdee4863669cc625c122e9254fb2ca3af70fa43b5082bc2723ca3fc7a40c`
- 9 agency rules
- 8 direct agency-manager rules
- 3 BMX heads
- 12 BMX junior→head mappings
- 21 unique employee codes
- 0 errors, 0 ambiguities
- 4 intentional Manpower home-agency warnings:
  - Deroyal / `1000157`
  - Abbott / `1000593`
  - Medsource / `1000157`
  - Dirui / `1001982`

Files changed:

- [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py)
- [asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py)
- [asateel_projects_labadi_v1.json](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/lookups/asateel_projects_labadi_v1.json)
- [asateel_project_allocation.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/asateel_project_allocation.py)
- [import_asateel_project_allocation.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/import_asateel_project_allocation.py)
- [test_asateel_project_allocation.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_asateel_project_allocation.py)
- [asateel_project_labadi_workbook_cells.json](/home/clawdbot/.openclaw/workspace/aljeel/tests/fixtures/asateel_project_labadi_workbook_cells.json)
- [asateel-runbook.md](/home/clawdbot/.openclaw/workspace/aljeel/knowledge/asateel-runbook.md)

Validation:

- Focused project and existing trigger tests: `14 passed`
- Workbook regeneration: `LOOKUP OK`
- Python compilation: passed
- `git diff --check`: passed
- Mandatory golden gate: `GOLDEN OK`
  - 92 invoices
  - 188 rows
  - GREEN 3 / YELLOW 185 / RED 0
  - 92 reconciled / 0 mismatched
  - Standard allocation mode confirmed

Implementation footprint: 8 files, approximately `+1302/-5` lines including normalized JSON and fixtures.

No deployment or commit was performed. All pre-existing unrelated working-tree changes were preserved.
