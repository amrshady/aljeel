Restored the AP Processed / Approved history feature from `stash@{0}` by hand. Stash was not popped/dropped.

Files touched:
- [ap.service.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/ap.service.ts)
- [ap.controller.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/ap.controller.ts)
- [ap.service.spec.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/ap.service.spec.ts)
- [page.tsx](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/web/src/app/[locale]/ap/review/page.tsx)
- [en.json](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/web/messages/en.json)
- [ar.json](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/web/messages/ar.json)
- [ap.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/ap.ts)

What changed:
- Added `PROCESSED_STATUSES = ['APPROVED', 'SCHEDULED', 'PAID', 'REJECTED']`.
- Added AP-only `view=processed` query parsing via `ApExceptionListQuerySchema`.
- Queue view keeps existing `UNDER_REVIEW` / `ON_HOLD` filter and `createdAt desc`.
- Processed view uses processed statuses and `updatedAt desc`.
- `/ap/exceptions` remains gated to `AP_CLERK`, `AP_APPROVER` only.
- Web AP review page now has `queue` / `processed` tabs, resets page on tab switch, sends `view`, and shows status only in processed view.
- Added `tabQueue`, `tabProcessed`, and `emptyProcessed` messages in English and Arabic.
- Added focused `ap.service.spec.ts` coverage for queue and processed filtering/sorting.

Conflict handling:
- Preserved current `main` Jawal/reconciliation behavior already present in HEAD.
- Did not bring in unrelated stash changes: auth provider, login, require-auth, api-client, upload/document work, invoice documents/list refactors, reconciliation panel refactors, etc.
- Did not touch `/auth/whoami` or Prisma schema. They were not required for this Processed feature to compile.

Verification:
- `pnpm --filter @aljeel/shared-types build` passed, needed because workspace imports shared-types from ignored `dist`.
- `pnpm --filter @aljeel/api test -- ap.service.spec.ts` passed: 7 tests.
- `pnpm --filter @aljeel/api build` passed.
- `pnpm --filter @aljeel/web build` passed.
- `pnpm --filter @aljeel/web typecheck` passed after the Next build regenerated `.next/types`.

Diff stat: 7 files changed, 163 insertions, 9 deletions.

Note: there is a pre-existing untracked directory `apps/api/prisma/migrations/20260705000000_add_jawal_integration/`; I did not touch it.
