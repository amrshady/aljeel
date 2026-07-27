Implemented the managed P&T/PROJECTS mappings feature exactly within the requested scope. No deployment performed.

Key outcomes:

- Added Prisma models, audit tables, migration, and JSON-based seed.
- Added AP Clerk-only CRUD, resolve, validate, regenerate, audit, and Excel preview/apply APIs.
- Reused the existing Python `_master_indexes` / `_unique_alias` resolver.
- Added atomic regeneration with DB rollback and previous-byte restoration on failure.
- Added bilingual EN/AR P&T mappings page, navigation, agency grid, grouped BMX line heads/salesmen, and history.
- Preserved the unchanged Python consumer and all non-PROJECTS behavior.
- Verified 9 rules, 3 BMX heads, and 12 salesmen through the pipeline’s own `load_lookup`.

Migration:

- `20260726000000_pt_mappings_managed_table`

Commands:

```bash
pnpm --filter @aljeel/api prisma:migrate
pnpm --filter @aljeel/api prisma:seed
```

Verification passed:

- API and web typechecks
- API lint and targeted web lint
- API: 37 tests passed
- Web: 1 test passed
- Prisma client generation
- Seed structural/serialization compatibility
- Pipeline `load_lookup`
- `git diff --check`

Diff summary: 6 tracked files changed with 223 insertions and 12 deletions, plus the new migration, API module, Python adapter/verifier, web page/client, and report. The original untracked brief was preserved.

Full implementation notes are in [REPORT.md](/home/clawdbot/.openclaw/workspace/aljeel-repo/REPORT.md).

[status: done rc=0]
