# P&T mappings managed table

## Delivered

- Prisma models/enums for agencies, salesman rows, and field-level audit history.
- Migration `20260726000000_pt_mappings_managed_table`.
- Idempotent seed sourced from the existing PROJECTS JSON (9 agencies, 3 BMX line heads, 12 salesmen).
- AP Clerk-only Nest API for list, resolve, agency/line-head/salesman CRUD, audit, Excel preview/apply, and regeneration.
- Bilingual `/[locale]/ap/pt-mappings` page and AP Clerk navigation.
- Python adapter that imports the existing `asateel_project_allocation.py` resolver and validator; TypeScript contains no alias normalization.

## Migration and seed

```bash
pnpm --filter @aljeel/api prisma:migrate
pnpm --filter @aljeel/api prisma:seed
```

Run from the repository root with `DATABASE_URL` configured. The seed reads
`../aljeel/pipelines/lookups/asateel_projects_labadi_v1.json`.

## Regeneration and rollback

Every successful mutation/import snapshots the P&T tables, invokes
`apps/api/scripts/pt-mappings.py`, writes a temporary lookup, and calls the
pipeline's unchanged `load_lookup`. The validated file is atomically renamed
to `../aljeel/pipelines/lookups/asateel_projects_labadi_v1.json` inside the
database transaction. If generation, validation, or transaction commit fails,
the transaction rolls back and the prior lookup bytes are restored.

The adapter imports `_master_indexes`, `_unique_alias`, `normalize_alias`, and
`load_lookup` from the existing Python allocation module. Unknown/ambiguous
agencies and unknown employee numbers hard-block saves. Manager home-agency
mismatches are returned as UI warnings.

## Employee-number canonical name resolution (2026-07-26)

Manager, BMX line-head, and salesman identities now resolve solely by Manpower
employee number. A known employee number is accepted regardless of the typed
name, and the canonical Manpower name is persisted and shown after save.
Missing or unknown employee numbers remain hard errors; agency unique resolution
and non-blocking manager home-agency warnings are unchanged.

## Verification

```bash
pnpm --filter @aljeel/api prisma:generate
pnpm --filter @aljeel/api typecheck
pnpm --filter @aljeel/web typecheck
pnpm --filter @aljeel/api test
cd apps/api && node scripts/verify-pt-mappings.mjs
```

The verifier rebuilds from the current JSON seed, runs `load_lookup`, checks
UTF-8/LF/trailing-newline serialization, and proves structural equivalence.
The only intentional structural differences are managed-table provenance and
logical source locations; canonical rules, ordering, strategies, precedence,
statistics, validation, aliases, and employees remain compatible.

## Scope and deviations

The feature is isolated to `projects-labadi-v1` and only writes the existing
PROJECTS lookup artifact. No normal Asateel, Jawal, JJ, invoice allocation, or
pipeline consumer code was changed. No deployment was performed. There are no
functional deviations from the brief; provenance now identifies the managed
tables as requested.
