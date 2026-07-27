# Codex Brief — P&T Mappings managed table (replace Book1.xlsx)

## Scope guard (NON-NEGOTIABLE)
This feature applies to **P&T (PROJECTS) invoice types ONLY**. It must NOT
change resolution, allocation, or UI behavior for any other invoice/vendor
type (regular Asateel, Jawal, JJ, etc). The only pipeline artifact it may
affect is `pipelines/lookups/asateel_projects_labadi_v1.json`, which is
already gated behind `mode == projects-labadi-v1` (project/PROJECTS mode
only). Do not touch the non-project Asateel path.

## Goal
Replace the human-edited `Book1.xlsx` (Labadi Asateel PROJECTS allocation
workbook) with a managed table in the AP Clerk web UI. AP clerks maintain the
data via a form/grid instead of an Excel file. On every save, the app
regenerates `pipelines/lookups/asateel_projects_labadi_v1.json`
**byte-compatibly** with the current `build_lookup()` output. The Python
pipeline contract is UNCHANGED — it keeps reading that JSON. This is
"Option #2": table owns editing, JSON stays the interface.

## Repos / paths
- Web (Next.js, next-intl `[locale]`): `apps/web/src/app/[locale]/...`
- API (NestJS + Prisma): `apps/api/`, schema `apps/api/prisma/schema.prisma`
- Pipeline (separate, DO NOT rewire): `../aljeel/scripts/asateel_project_allocation.py`
  (`build_lookup`, `_master_indexes`, `_unique_alias`), master file
  `../aljeel/qc/master-data/Aljeel_Lookups-v2.xlsx`, output lookup
  `../aljeel/pipelines/lookups/asateel_projects_labadi_v1.json`.

## Data model (Prisma) — P&T scoped
Add tables (names indicative; match existing conventions):
- `PtAgencyMapping`: id, agencyName (unique, from Book1), managerName,
  managerEmpNo, resolutionMode enum(`AGENCY`|`SALESMAN`),
  agencyCode (resolved from master, cached), createdAt/By, updatedAt/By.
- `PtSalesmanMapping` (for SALESMAN-mode agencies, BMX today): id,
  agencyMappingId (FK), lineHeadName, lineHeadEmpNo, salesmanName,
  salesmanEmpNo, createdAt/By, updatedAt/By.
  (Line heads are a grouping within an agency; model as lineHead fields on
  each salesman row, or a parent `PtLineHead` table — your call, but the UI
  is line-head-centric: a line head owns many salesmen.)
- `PtMappingAudit`: row-level change log (who/when/old→new/action).

Seed/migration: one-time import of current Book1 = 8 AGENCY-mode agency rows
(Bio-Rad, Solventum, Dirui, Deroyal, Medsource, Steris, Abbott, Vygon) +
BMX as SALESMAN mode with 3 line heads (Elsayed Ewis 1000290 / Mahmoud
Elshamaly 1001686 / Esra Alfaris 1002165) and their ~12 salesmen. Prefer
seeding by parsing the existing JSON lookup so codes/aliases match exactly.

## agency_code resolution (CRITICAL — matches build_lookup today)
- Clerks enter the agency **name**, manager name, manager emp_no. They NEVER
  hand-type agency_code.
- On save, resolve agency_code by the SAME unique-alias join `build_lookup`
  uses against master `Aljeel_Lookups-v2.xlsx` (normalize name → unique
  master agency code). Reuse the Python (`_master_indexes`/`_unique_alias`)
  as the resolver of record — call it as a subprocess/CLI from the API rather
  than reimplementing the normalization in TS (avoids drift). Expose a small
  Python entrypoint if needed; do not fork the normalization logic.
- **Option (a) hard-block:** if a name does not resolve to exactly ONE master
  code (unknown, or ambiguous/multiple), REJECT the save with a clear error.
  Mirrors today's error-on-ambiguity.
- Manager-home-agency mismatch = NON-blocking WARNING surfaced in the UI
  (same 4 warnings build_lookup emits today, e.g. "10072 Abbott: manager
  1000593 has Manpower home agency 10200 S&M").

## JSON regeneration (on every successful save)
- Regenerate `asateel_projects_labadi_v1.json` so its structure/ordering match
  current `build_lookup()` output (agency_rules sorted by agency_code,
  agency_aliases, employee_strategy `agency_manager` vs `bmx_junior_to_head`,
  precedence/provenance/statistics/validation blocks). Safest path: drive the
  existing Python `build_lookup` from generated inputs, OR add a builder that
  reads the DB and emits the identical schema. Provenance source_sha256 will
  change (no more Book1 file) — keep the field but document the new source as
  the managed table; keep master_sha256 accurate.
- Add a verification: after regen, run the pipeline's own load/validate
  (`load_lookup`) to confirm the JSON parses and passes its invariants before
  committing the save. If regen fails validation, roll back the save.

## UI — one P&T-scoped page
- New nav item "P&T Mappings" in the AP Clerk interface (NOT the Dashboard;
  dedicated page under `[locale]`). Role-gate like existing AP clerk pages.
- Surface 1: **Agency mappings** flat grid (8 rows) — agencyName, managerName,
  managerEmpNo, resolved agencyCode (read-only, shown after resolve).
  Add/edit/delete. Live save.
- Surface 2: **Salesman-mode (BMX)** grouped, line-head-centric — list of line
  heads, each expandable to its salesmen; add/edit/delete at line-head and
  salesman level.
- Show validation errors (hard block) and warnings (non-block) inline on save.
- Keep an "Import from Excel" button as transitional bulk/seed path (accepts a
  Book1-shaped .xlsx, runs the same resolve+validate, previews a diff before
  applying). This is the fallback, not the primary interface.
- Bilingual EN/AR consistent with existing pages.

## Audit
Every create/edit/delete writes PtMappingAudit (user, timestamp, field,
old→new). Show a simple history view or at least persist it.

## Out of scope / do NOT
- Do NOT modify non-project Asateel allocation, Jawal, or JJ.
- Do NOT change the Python allocation logic/precedence — only the JSON's
  producer changes; the consumer stays identical.
- Do NOT deploy. Report the diff, migrations, and how to run the seed.

## Deliverables
1. Prisma schema + migration + seed (from existing JSON lookup).
2. API endpoints (CRUD + resolve/validate + regen-on-save + audit).
3. Web page (nav item, two surfaces, import button, EN/AR).
4. The regen path proven against current JSON (diff should be structurally
   equivalent for the seed data).
5. Short REPORT.md: files touched, how to run migration+seed, how regen works,
   any deviations. Report diff; do not deploy.
