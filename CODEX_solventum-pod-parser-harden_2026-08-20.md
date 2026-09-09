Implemented the scanned-POD hardening locally. No deploys or service restarts were performed.

Files touched:

- `apps/api/src/ap/solventum-pod-parse.ts`
  - Normalizes Arabic-Indic digits and conservative OCR substitutions such as `O/0`, `I/l/1`, and `S/5`.
  - Handles split values such as `3 O E A`.
  - Adds multiline scanned-row extraction anchored on quantity/UOM.
  - Extracts nearby manufacturer/catalog and labelled lot/batch values.
  - Adds embedded-text garbage detection.
  - Preserves legitimate `3MOC-`/`3MOR-` prefixes during OCR correction.

- `apps/api/src/ap/local-solventum-pod.extractor.ts`
  - Digital text now needs to be sufficiently long, readable, and parse into delivered lines.
  - Falls through to OCR when digital text is junk or parses no lines.
  - Changed Tesseract segmentation from `PSM.SINGLE_BLOCK` to `PSM.AUTO`, better suited to tables and bilingual layouts.
  - Removed filename-only zero-quantity success responses.
  - Throws on genuine no-quantity extraction, allowing composite Gemini fallback.
  - Bumped local cache entries to v5 and invalidated potentially corrupt v4 results.

- `apps/api/src/ap/gemini-solventum-pod.extractor.ts`
  - Gemini no longer consumes stale local-extractor cache entries.
  - Cached Gemini lines are validated for plausible delivered quantities before reuse.

- `apps/api/src/ap/solventum-pod-parse.spec.ts`
  - Added scanned bilingual multiline OCR coverage.
  - Covers Arabic digits, split quantity/UOM, OCR substitutions, catalogs, and lots.
  - Added garbage embedded-text-layer detection coverage.

`composite-solventum-pod.extractor.ts` did not require modification: once local extraction throws instead of returning zero-quantity filename lines, its existing opt-in `GEMINI_API_KEY` fallback works correctly.

Validation:

- Full API suite: **92/92 tests passed**
- Parser suite after final adjustments: **11/11 passed**
- TypeScript type-check: passed
- `git diff --check`: passed

Diff summary:

```text
4 files changed, approximately 140 insertions and 40 deletions
```

Existing unrelated working-tree changes were left untouched.
