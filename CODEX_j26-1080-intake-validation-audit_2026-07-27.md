## Audit conclusion

J26-1080 was accepted because the intake version in use at the time did not validate Jawal evidence completeness or preserve/inspect the uploaded folder hierarchy.

The old submit gate only required:

- At least one document.
- At least two `.xlsx` files.
- Valid invoice math when portal invoice lines existed.
- No duplicate invoice number.
- Asateel-specific manifest validation—but no equivalent Jawal validation.

It did not compare spreadsheet tickets to evidence, check ticket-numbered folders, or require approval/OPEX documents. Therefore a batch containing the spreadsheets plus any collection of flat PDFs satisfied submission validation.

Important current-state finding: this gap has since been addressed in the repository. Commit `4e27e38` (“Add Jawal evidence-pack validation to invoice submit gate,” dated 2026-07-14) introduced the Jawal checker. The current code should reject a J26-1080-shaped upload. If a similarly malformed batch can still submit today, production is likely running an older revision, the supplier is not configured with `erpIntegration = JAWAL`, or the stored document paths are not reaching this code as expected.

## 1. Intake and submission flow

### Draft creation

`POST /invoices` creates or resumes the draft:

- Controller: [invoices.controller.ts:17](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.controller.ts:17)
- Service: [invoices.service.ts:103](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:103)

Current Jawal-specific draft validation checks only the batch identifier format, such as `J26-1080`, at [invoices.service.ts:107](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:107). Draft creation does not—and should not necessarily—require complete evidence.

### File upload

There are two upload paths:

- Presigned flow:
  - `POST /invoices/:id/documents/upload-url`
  - `POST /invoices/:id/documents/complete`
- Multipart fallback:
  - `POST /invoices/:id/documents`

They are declared at [documents.controller.ts:45](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.controller.ts:45).

Uploads validate access, invoice editability, size, storage key, document type, and basic registration/deduplication. The current implementation preserves the submitted relative path in `Document.fileName` through `sanitizeEvidenceRelativePath()` at [documents.service.ts:80](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.service.ts:80), [documents.service.ts:161](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.service.ts:161), and [documents.service.ts:253](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.service.ts:253).

Before commit `4e27e38`, `sanitizeFileName()` discarded every directory component and retained only the basename. The browser uploader also sent `file.name`, not the relative path. Consequently:

```text
J26-1080/6905655845/approval.msg
```

was registered as effectively:

```text
approval.msg
```

That made a structural intake check impossible because folder identity had already been lost.

### Submit

The supplier submission endpoint is:

- `POST /invoices/:id/submit`
- Controller: [invoices.controller.ts:78](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.controller.ts:78)
- Service: [invoices.service.ts:416](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:416)

The current submit sequence is:

1. Validate status transition.
2. Load all attached documents.
3. Check Jawal batch-ID format.
4. Run generic document-presence validation.
5. For Jawal suppliers, parse and validate the uploaded evidence pack.
6. Validate portal invoice-line arithmetic, if lines exist.
7. Check duplicate file hashes and invoice number.
8. Set `SUBMITTED`, then immediately `UNDER_REVIEW`.

The generic document check is at [invoices.service.ts:461](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:461). Its implementation only checks document count and normally two `.xlsx` files; Jawal explicitly skips that generic `.xlsx` count rule at [invoice-submit.ts:22](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/invoice-submit.ts:22).

### Reconciliation trigger

Submission itself does not launch Jawal reconciliation. The run is dispatched only after AP changes the invoice to `APPROVED`:

- [ap.service.ts:276](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/ap.service.ts:276)
- [ap.service.ts:288](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/ap.service.ts:288)

Jawal staging occurs at [jawal-integration.service.ts:203](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/jawal-integration.service.ts:203), followed by the `/jawal/run` call at [jawal-integration.service.ts:241](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/jawal-integration.service.ts:241).

## 2. Were the required checks present?

### At the time represented by the pre-`4e27e38` submit code

No.

| Requirement | Old intake behavior |
|---|---|
| Every ticket has matching evidence | Not checked |
| Ticket-numbered folder exists | Not checked |
| Flat PDFs rejected | Not checked |
| Supporting evidence per ticket | Not checked |
| Approval email per travel ticket | Not checked |
| OPEX per event/sponsorship line | Not checked |
| Spreadsheet-to-folder reverse coverage | Not checked |
| Directory hierarchy retained | No; paths were flattened |
| Basic workbook presence | Only the generic “two `.xlsx` files” count |

Thus the old behavior was essentially: accept any file collection containing the required workbook count, regardless of whether those files could satisfy reconciliation.

### In current repository code

Yes, provided the supplier record is configured as `JAWAL`.

`InvoicesService.submit()` invokes the Jawal checker at [invoices.service.ts:489](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:489) and blocks on `evidence.error` at [invoices.service.ts:491](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:491).

The server-side checker:

- Locates a spreadsheet: [jawal-evidence-check.service.ts:36](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:36)
- Requires `Ref.No` and `Ticket` columns: [jawal-evidence-check.service.ts:95](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:95)
- Parses its rows and inspects file bytes: [jawal-evidence-check.service.ts:64](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:64)
- Runs shared structural/completeness rules: [jawal-evidence-check.service.ts:146](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:146)

The shared checker now blocks:

- Empty/invalid files: [jawal-evidence-check.ts:799](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:799)
- Empty spreadsheet or identifier-less rows: [jawal-evidence-check.ts:868](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:868)
- Malformed or duplicate tickets: [jawal-evidence-check.ts:901](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:901)
- Missing matching evidence folder for each row: [jawal-evidence-check.ts:983](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:983)
- Missing supporting document: [jawal-evidence-check.ts:1024](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1024)
- Missing OPEX for event/sponsorship lines: [jawal-evidence-check.ts:1035](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1035)
- Missing `.msg`/`.eml` or OPEX for travel lines: [jawal-evidence-check.ts:1057](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1057)
- Evidence folders absent from the spreadsheet: [jawal-evidence-check.ts:1075](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1075)

Flat files have no recognized evidence-folder segment, so a batch of root-level passenger PDFs produces `JAWAL_FOLDER_MISMATCH` for the corresponding spreadsheet lines.

The web UI also performs the same check before upload/submit at [page.tsx:158](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/web/src/app/[locale]/invoices/new/page.tsx:158), but the API check remains the authoritative guard against direct API bypass.

## 3. Exact gap that allowed J26-1080

The incident required two coupled gaps:

1. **Loss of structure during upload.**  
   Relative paths were discarded and only basenames were stored. The system could not tell whether `MR_AAMIR_SHARIF-86YW8B.pdf` came from a ticket folder or directly from the batch root.

2. **No spreadsheet-to-evidence completeness validation at submit.**  
   Submit counted documents/workbooks but did not parse the Jawal workbook, enumerate its 79 ticket rows, or require a usable evidence group for every row.

Because validation was aggregate rather than per ticket, “some evidence exists” was indistinguishable from “every invoice line has the required evidence.” The reconciliation engine was the first component to apply the stronger structural contract, so the defect appeared only downstream and gated all rows.

## 4. Recommended minimal intake guard

The correct placement is exactly at the supplier-facing submit boundary, after documents are loaded but before the invoice status is changed:

- Orchestration: [invoices.service.ts:432](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:432)
- Jawal branch: [invoices.service.ts:489](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:489)
- Vendor-specific inspection service: [jawal-evidence-check.service.ts:33](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:33)

A minimal, non-breaking guard should:

1. Apply only when `supplier.erpIntegration === 'JAWAL'`.
2. Preserve each file’s normalized relative path during upload.
3. Parse the authoritative Jawal workbook and extract every `Ref.No`/`Ticket` row.
4. For each canonical ticket/ref, require a recognized matching evidence folder.
5. Require at least one usable supporting document in that folder.
6. Enforce `.msg`/`.eml` or OPEX for travel lines and OPEX for event/sponsorship lines.
7. Return HTTP 422 with all missing tickets/folders and document-type failures.
8. Leave legitimate duplicate/shared-event exceptions as warnings where policy requires.
9. Run server-side for both portal and direct API submissions; client-side validation should only provide earlier feedback.

That is substantively what current `JawalEvidenceCheckService` and `validateJawalEvidencePack()` now implement. The operational follow-up is therefore to confirm the revision deployed when J26-1080 was submitted and verify that Jawal Travel’s supplier row is actually routed as `JAWAL`. No files were modified.
