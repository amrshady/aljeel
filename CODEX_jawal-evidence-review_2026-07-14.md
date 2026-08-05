## Review result

### 1. Jawal evidence-pack validation — FAIL

The submit gate is wired in, but the implementation does not fully meet the focused v2 specification.

Key discrepancies:

- Gate B1 never discovers or validates a numeric `*Amount` column. The header map only contains ref, ticket, description, account, type, and OPEX fields ([jawal-evidence-check.ts:358](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:358)). Rows missing both Ref.No and Ticket are discarded during extraction, so the later missing-identifier check cannot catch them ([jawal-evidence-check.ts:428](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:428), [jawal-evidence-check.ts:785](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:785)). This conflicts with spec B1 ([rules:32](/home/clawdbot/.openclaw/workspace/aljeel/knowledge/jawal-evidence-checker-rules-v2-focused.md:32)).

- Gate A is substantially incomplete:

  - `.eml` and images are not read at all; byte loading is limited to PDF, MSG, and spreadsheets ([jawal-evidence-check.service.ts:71](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:71)).
  - MSG is only checked for an OLE/ZIP signature, not parsed for sender, subject, and date ([jawal-evidence-check.ts:1033](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1033)).
  - Images are not decoded.
  - PDFs are not rendered or checked for page count, encryption, text, or OCR usability.
  - The PDF EOF test rejects a missing `%%EOF` only when the entire file is under 64 bytes, allowing normal-sized truncated PDFs ([jawal-evidence-check.ts:1021](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1021)).
  - Empty-folder detection is ineffective: it constructs counts exclusively from existing files, so every recorded count is necessarily positive ([jawal-evidence-check.ts:755](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:755)).
  - Partial-upload suffixes, Office lock files, zero-width/RTL characters, and NFC normalization are not implemented ([jawal-evidence-check.ts:242](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:242), [jawal-evidence-check.ts:259](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:259)).

- B1a is not consistently strict:

  - Ticket format accepts any 6–12 digits rather than a configured exact expected length ([jawal-evidence-check.ts:96](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:96)).
  - Arbitrary non-prefixed free-text refs are accepted as canonical ([jawal-evidence-check.ts:303](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:303)).
  - Duplicate numeric and free-text Ref.No values are deliberately allowed, contrary to the spec’s duplicate Ref/Ticket block ([jawal-evidence-check.ts:815](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:815)).

- B2 requires exact matching after case-folding and trimming, but implementation permits:

  - Prefix matches such as `key-*` and `key_*`.
  - Combined/adjacent ticket expansion.
  - Substring and shared-stem slug matching.
  - Employee-ID and passenger-name filename heuristics.

  Evidence: [jawal-evidence-check.ts:489](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:489), [jawal-evidence-check.ts:656](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:656). This conflicts directly with spec B2 ([rules:51](/home/clawdbot/.openclaw/workspace/aljeel/knowledge/jawal-evidence-checker-rules-v2-focused.md:51)).

- B3 can be satisfied by a `.msg`/`.eml` alone because email formats are classified as supporting documents ([jawal-evidence-check.ts:532](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:532)).

- OPEX recognition only checks whether the path contains “opex”; it does not require a PDF or validate form content ([jawal-evidence-check.ts:527](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:527)).

- Event/sponsorship OPEX and travel `.msg OR OPEX` branching is present ([jawal-evidence-check.ts:935](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:935)), but B5 does not verify that every event line is actually represented in the OPEX allocation. It merely repeats a missing-OPEX finding.

- The dual-XLSX rule is correctly skipped only for Jawal ([invoices.service.ts:368](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:368)).

### 2. Jawal/Asateel separation — PASS

Server-side supplier gating is explicit and mutually exclusive:

- Asateel manifest validation runs only for `erpIntegration === 'ASATEEL'` ([invoices.service.ts:379](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:379)).
- Jawal evidence validation runs only for `erpIntegration === 'JAWAL'` ([invoices.service.ts:389](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:389)).
- The dual-XLSX bypass is exactly `=== 'JAWAL'`; Asateel continues through the existing dual-XLSX check ([invoices.service.ts:368](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:368)).
- `SuppliersService` only exposes `erpIntegration`; it does not invoke or combine validation paths ([suppliers.service.ts:10](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/suppliers/suppliers.service.ts:10)).
- Both validators are injected independently ([invoices.module.ts:10](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.module.ts:10)).

No Jawal-rule leakage into the Asateel validator, or Asateel-rule leakage into the Jawal validator, was found.

### 3. Rename endpoint — PASS

The endpoint is correctly constrained:

- Supplier roles only at controller level ([documents.controller.ts:152](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.controller.ts:152)).
- Tenant ownership enforced in the document lookup ([documents.service.ts:363](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.service.ts:363)).
- Hard `JAWAL` supplier guard ([documents.service.ts:376](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.service.ts:376)).
- Only `DRAFT` and `REJECTED` statuses accepted ([documents.service.ts:59](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.service.ts:59), [documents.service.ts:382](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.service.ts:382)).
- Oracle uploads cannot be renamed ([documents.service.ts:389](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.service.ts:389)).
- The update changes only logical `fileName` and inferred `mimeType`; `storageKey` is untouched ([documents.service.ts:416](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/documents/documents.service.ts:416)).
- The JAWAL guard prevents any Asateel mutation.

### 4. Correctness/type/lint/build risk — FAIL

There are major correctness gaps listed under Goal 1, although no current TypeScript or lint failure remains after building the changed dependency first.

Targeted checks:

- Jawal validator tests: **23/23 passed**.
- `@aljeel/shared-types` build: **passed**.
- API typecheck after rebuilding shared-types: **passed**.
- Shared-types lint: **passed**.
- API lint: **passed**.
- No full build was run.
- Worktree remained clean.

Short bug list:

1. Missing numeric `*Amount`/billable-line enforcement.
2. Non-exact heuristic folder matching violates strict B2.
3. Gate A does not parse EML/MSG, decode images, or fully validate PDFs.
4. PDF truncation/EOF check is defective.
5. Empty-folder detection cannot fire.
6. Duplicate numeric/free-text refs are allowed.
7. Supporting-document check can be satisfied by approval email.
8. OPEX detection is filename-only and does not require a PDF.
9. Event completeness does not validate OPEX allocation coverage.
10. Filename safety/NFC requirements are incomplete.
