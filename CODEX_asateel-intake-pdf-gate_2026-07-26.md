Implemented the Asateel intake PDF gate fix using approach (a): a TypeScript port of the pipeline regex and fill-down logic with parity tests.

Changed only:

- `packages/shared-types/src/asateel-invoice-manifest.ts`
- `packages/shared-types/src/asateel-invoice-manifest.test.ts`
- `apps/api/src/invoices/asateel-invoice-manifest.service.spec.ts`

Behavior now:

- Extracts `Transportation / NNNN[N]` using the pipeline-equivalent regex.
- Scans all four Expenses-Format description cells, capturing both `03786` and `04215` on one row.
- Implements header invoice fill-down, switching immediately at the next header.
- Normalizes Expenses-Format invoice numbers to five digits.
- Unions results with the existing Invoice No column extraction.
- Missing `03786.pdf` produces `ASATEEL_INVOICE_FILES_MISSING` listing `03786`.
- Adding `03786.pdf` clears the error.

Verification:

- Shared-types: 68 tests passed.
- API Asateel manifest tests: 5 passed.
- Web typecheck: passed.
- API typecheck: passed.
- `git diff --check`: passed.
- No deployment performed.

The worktree already contained unrelated PT-mappings changes; they were left untouched.

[status: done rc=0]
