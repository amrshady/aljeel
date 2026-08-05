Implemented and verified the Jawal batch-ID validation gate. No deployment, Wrangler command, commit, or push was performed.

Root cause confirmed: the Jawal folder name became `invoiceNumber` without format validation.

Task files touched:

- [invoice.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/invoice.ts)
- [invoice.test.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/invoice.test.ts)
- [invoices.service.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts)
- [invoices.service.spec.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.spec.ts)
- [page.tsx](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/web/src/app/[locale]/invoices/new/page.tsx)
- [en.json](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/web/messages/en.json)
- [ar.json](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/web/messages/ar.json)

Diff summary:

- Added the single shared `JAWAL_BATCH_ID_REGEX`, `isValidJawalBatchId()`, and `JawalBatchIdSchema`.
- API draft creation now checks user-supplied IDs only for Jawal suppliers.
- API submission revalidates stored Jawal IDs, excluding `DRAFT-` placeholders.
- Invalid IDs return HTTP 400 with `JAWAL_INVALID_BATCH_ID`, details, and the requested message. Existing global exception handling supplies `traceId`.
- Client blocks malformed Jawal folder names before any persistence request and displays localized inline feedback.
- Asateel behavior and existing evidence/XLSX/duplicate checks remain unchanged.
- Added helper/schema tests for `J26-1080`, `01-07jul`, `j26-1`, `J26-`, and `J26-12a`.
- Added API tests for HTTP 400, supplier scoping, submission validation, and placeholder exemption.

Validation passed:

- Shared-types tests: 5 passed
- API invoice-service tests: 15 passed
- Shared-types, API, and web typechecks
- `git diff --check`

The full worktree diff currently contains 12 files, approximately 378 insertions and 12 deletions. It also includes pre-existing Asateel-region and network-error changes in overlapping files; those were preserved and not reverted.
