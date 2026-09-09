Implemented a minimal async submit path without deploying.

What changed:

- Invoices with more than 100 documents now:

  1. Run inexpensive validation synchronously.
  2. Atomically transition to `SUBMITTED`.
  3. Return a fast HTTP 200 with `{ id, status: "SUBMITTED" }`.
  4. Perform storage/KB evidence validation in the background.
  5. Transition to `UNDER_REVIEW` and send the existing notification when complete.
  6. Transition to `REJECTED`, record the failure reason, and create an audit event if background processing fails.

- Small invoices retain the original synchronous behavior.
- Repeated submissions while `SUBMITTED`, or after reaching `UNDER_REVIEW`, are idempotent.
- The invoice detail page polls every three seconds while status is `SUBMITTED`, preventing a false timeout error and updating automatically to `UNDER_REVIEW` or `REJECTED`.
- Notification email remains fire-and-forget and is only triggered after successful processing.

Synchronous-flow trace:

- Load invoice and attachments.
- Load supplier configuration.
- Validate Jawal batch ID, required filenames, Asateel region, and invoice math.
- Previously, Asateel/Jawal validators then read files serially from KB/object storage. Jawal may read essentially every supported attachment, which causes the 400-file timeout.
- Check duplicate document checksums and invoice number.
- Transition `DRAFT → SUBMITTED → UNDER_REVIEW`.
- Write audit events.
- Start notification email without awaiting it.

Files touched:

- [invoices.service.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:42)
- [page.tsx](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/web/src/app/[locale]/invoices/[id]/page.tsx:58)

Verification:

- Invoice service tests: 19 passed.
- Web TypeScript check: passed.
- Diff whitespace check: passed.
- Full API typecheck is blocked by unrelated existing Solventum changes whose generated Prisma client lacks `solventumChargebackJob`.

Risk note: this deliberately uses an in-process background task to keep the diff small and avoid a schema migration. If the API process restarts during validation, the invoice can remain `SUBMITTED`. A production-grade follow-up should use a durable database/Redis/RabbitMQ job with startup recovery. No deployment was performed.
