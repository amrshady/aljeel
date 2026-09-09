# Read-only design and feasibility report

No files were edited.

## Executive conclusion

Line-level reconciliation is feasible, and Wave 2’s 90→86 row discrepancy is entirely attributable to TRX `2600015875`: all other 23 POD-backed TRXs have identical Sales/clerk row counts.

However, the existing Gemini extractor is not reusable as-is. It provides a useful PDF-to-JSON/API pattern, but its schema, TRX handling, and exact-text matching caused the prior production-style E2E run to return zero rows.

A robust implementation should:

- Treat the `2600…` TRX from the filename as authoritative packet metadata.
- Extract item identifiers, lot, delivered quantity, and UOM from the document without asking Gemini to infer the sales TRX.
- Match within that filename TRX using normalized manufacturer/catalog code and lot, with description similarity as supporting evidence.
- Reconcile quantities after unit/pack conversion.
- Preserve today’s filename/TRX behavior unless an explicit line-level flag is enabled.
- Fail closed or fall back per-PDF when extraction is unreliable, with an audit trail.

Reproducing exactly 86 rows is high-confidence after golden-data tuning. Reproducing every clerk field transformation reliably with the current extractor is not.

## 1. Current Python flow

The implementation is [solventum_chargeback.py](</home/clawdbot/.openclaw/workspace/aljeel/scripts/solventum_chargeback.py>).

Its flow is:

1. CLI accepts:

   - `--sales`
   - one or more `--pods` PDF files/directories
   - `--out`

2. `expand_pod_arguments()` expands directories to their immediate `.pdf` children. It does not recurse.

3. `collect_pod_trx_numbers()` examines filenames only. It extracts every isolated ten-digit token matching `2600\d{6}`. PDF contents are never opened.

4. `_open_sales_workbook()` reads the workbook bytes into `BytesIO`, then opens it read-only and with formulas resolved to cached values. This also permits OOXML content whose filename happens to end in `.xls`; true BIFF `.xls` is unsupported.

5. `generate_chargeback()` requires a worksheet named `Sheet2`, reads its first row as the header, and verifies all 11 output columns exist.

6. It creates a new workbook with `Sheet1` and these columns:

   `TRX #`, `TRX Date`, `Order Type`, `Account Name`, `Ship Address`, `Item Description`, `Manufacturer`, `Agency`, `Lot Number`, `Quantity`, `UOM`.

7. For every Sales Sheet row:

   - Normalizes numeric TRX values to plain strings.
   - Retains the row if its TRX appears in the filename-derived set.
   - Copies the 11 fields unchanged except for stripping leading `3MOC-` or `3MOR-` from Manufacturer.

8. It saves the output and returns the retained-row count.

Consequently, line identity, lot, quantity, and POD contents play no role.

The current test in [test_solventum_chargeback.py](</home/clawdbot/.openclaw/workspace/aljeel/tests/test_solventum_chargeback.py>) explicitly locks in this limitation: Wave 2 expects the 86-row sample but asserts that derivation produces 90 rows.

## 2. Wave 2 findings

I inspected:

- All 24 files under `wave2_pods`
- `JUNE SALES 2026.xlsx`, `Sheet2`
- The clerk’s `Chargeback report supported by PODs attached 2nd Wave.xlsx`
- The generated 90-row workbook

The coverage sets are consistent:

- 24 POD PDFs
- 24 unique filename TRXs
- 24 clerk TRXs
- The filename and clerk TRX sets are identical
- Clerk: 86 rows
- Sales rows for those 24 TRXs: 90
- Only `2600015875` differs in row count: Sales has 10, clerk has 6

### TRX 2600015875

Sales has these ten lines:

| Manufacturer | Sales quantity | Sales UOM | Clerk result |
|---|---:|---|---|
| 56872 | 20 | Box-1 | Omitted |
| 56949 | 20 | Each | Omitted |
| 1954 | 3000 | Box-1 | Kept as 2000 |
| 1470B2 | 30 | Bag-1 | Kept as 30 |
| 1470A2 | 30 | Bag-1 | Kept as 30 |
| 56950 | 20 | Each | Omitted |
| 1470A1 | 20 | Bag-1 | Kept as 20 |
| 56863 | 10 | Box-1 | Omitted |
| 4870A2 | 2 | Bag-1 | Replaced by POD’s 56921 kit, quantity 5 |
| 1470A3 | 60 | Bag-1 | Kept as 60 |

The focal POD has exactly six receipt lines:

- 1470A2 — 30 EA
- 1470A1 — 20 EA
- 1470A3 — 60 EA
- Polishing/celluloid item — 20 EA
- 56921 light-cure luting composite kit — 5 EA
- 1470B2 — 30 EA

Thus the six-line clerk result follows the POD, including two nontrivial transformations:

1. The polishing line becomes quantity 2,000, apparently converting 20 delivered packs/units using a 100-unit pack factor.
2. The Sales `4870A2` line is not merely filtered. The clerk replaces it with the POD’s `56921 KIT`, quantity 5 and `kit-1`, while retaining the Sales lot `0012625407-7020140871`.

That second case means this cannot be modeled purely as “keep matching Sales rows and replace quantity.” It needs a reconciled output row that can combine Sales metadata with POD item facts, and it needs controlled handling for a strong lot match despite an item-code disagreement.

## 3. What can be extracted from the PDFs

### Text-layer results

`pdftotext` results across the 24 Wave 2 PDFs:

- 5 PDFs have meaningful extractable text:
  - `2600015875 checked.PDF`
  - `2600016033 checked.pdf`
  - `2600016726 checked.pdf`
  - `2600016855 checked.pdf`
  - `2600017291 checked.pdf`
- 19 PDFs return only one byte per page or similarly empty form-feed output. They are effectively scanned/image PDFs.

Therefore, `pdftotext` alone cannot support Wave 2. OCR or multimodal PDF vision is required for most packets.

### Focal PDF identifiers

`2600015875 checked.PDF` has a clean text layer. Its receipt table exposes:

- Trade Item No./GTIN, such as `4215245303301`
- English description
- Embedded manufacturer/catalog numbers in descriptions:
  - `1470A2`
  - `1470A1`
  - `1470A3`
  - `56921`
  - `1470B2`
- Delivered quantity
- UOM
- PO and supplier reference

It does not expose populated lot/batch, manufacturer, or catalog columns for these six rows.

Crucially, the document’s references are not the Sales TRX:

- PO: `4600162237`
- Supplier reference: `260009137`
- Filename: `2600015875 checked.PDF`

The filename must therefore remain the authoritative Sales TRX association.

### Identifier reliability

Recommended priority:

1. **Normalized manufacturer/catalog number** — usually the best product identity, e.g. strip `3MOC-`/`3MOR-` and compare `1470A2`, `1954`, `56921`.
2. **Lot/batch number** — strongest disambiguator when actually present on both sides.
3. **Description** — useful for extracting embedded codes and as a fuzzy supporting signal, but exact description equality is too brittle.
4. **Quantity and UOM** — reconciliation evidence, not primary identity. Quantity may differ legitimately or require pack conversion.
5. **Trade/customer item number** — capture it, but do not assume it equals Sales `Item Code`; the focal POD uses GTIN-style codes while Sales uses internal `J-MMM-...` codes.

Lot cannot be mandatory because it is absent from the focal receipt. Manufacturer/catalog cannot be mandatory either because some forms place it only inside the description.

## 4. Existing Gemini extraction path

The earlier extractor is:

[gemini-solventum-pod.extractor.ts](</home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/ap/gemini-solventum-pod.extractor.ts>)

The E2E report was produced by:

[solventum_e2e.ts](</home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/solventum_e2e.ts>)

These are in the sibling `aljeel-repo`, not this Python workspace’s `scripts` package.

### Reusable parts

- Direct multimodal PDF upload to Gemini
- JSON-only extraction prompt
- Flash-first, Pro-fallback model cascade
- SHA-256 extraction cache
- Per-line confidence and source-page evidence
- Dependency-injected extractor abstraction
- E2E instrumentation and raw-candidate reporting

### Problems requiring redesign

- Gemini is asked to infer `trx` from the document. It returned PO, supplier, invoice, Arabic, or delivery identifiers instead of the filename TRX.
- The schema requires strings for manufacturer, lot, and UOM, although these fields are legitimately absent. Gemini returned `null`, causing otherwise plausible extractions to be rejected.
- Reconciliation requires exact normalized TRX, exact description, and exact UOM before considering lot.
- Exact descriptions differ substantially between receipt, invoice, and Sales representations.
- The current E2E report shows all three packets rejected and zero generated rows, despite Gemini finding many plausible quantities and lots.
- The TypeScript extractor is not a drop-in dependency for the Python script.

Verdict: reuse the architecture and prompt/API approach, but not the existing schema or matching logic unchanged.

## 5. Proposed design

### Extractor interface

Introduce a Python protocol similar to:

```text
extract(pdf_path, authoritative_trx) -> PodExtraction
```

`PodExtraction` should contain:

- `authoritative_trx` — always derived from filename
- `document_references` — PO/invoice/supplier/delivery references, informational only
- `lines`
- `extractor/model`
- `confidence`
- warnings/errors

Each line should contain nullable:

- `catalog_code`
- `manufacturer_code`
- `trade_item_number`
- `customer_item_number`
- `description`
- `lot`
- `delivered_quantity`
- `uom`
- `pack_size`
- `source_page`
- field-level confidence/evidence

The extractor should receive the candidate Sales lines for that filename TRX in its prompt, but it must still report document evidence separately. Candidate context will help map GTINs and shortened descriptions without inventing unsupported rows.

### Matching strategy

Scope every match to the filename TRX, then perform one-to-one assignment.

Suggested scoring:

- Exact normalized lot, if both populated: very strong
- Exact normalized manufacturer/catalog code: very strong
- Manufacturer code extracted from description: strong
- Known GTIN/internal-item mapping: strong
- Description token similarity: supporting
- Compatible UOM/pack factor: supporting
- Quantity compatibility after conversion: validation/tiebreaker

Prefer `(catalog/manufacturer code + lot)` when available. If lot is absent, use catalog code plus description and UOM. Permit a separately flagged lot-anchored exception when the item identity conflicts, as appears necessary for the focal `4870A2`→`56921 KIT` clerk row.

Use a global one-to-one assignment within the TRX rather than greedy row order so repeated FILTEK descriptions do not consume the wrong shade.

### Quantity reconciliation

Keep these values distinct:

- Sales quantity
- Raw POD quantity/UOM
- Converted POD quantity in output/Sales units
- Applied conversion rule

Rules should be deterministic:

1. If UOMs and pack basis are equivalent, use POD quantity.
2. If the Sales or POD UOM encodes a pack size (`Box-100`, `Box-150`, etc.), normalize to base units before comparison.
3. Convert back to the intended output convention.
4. Never infer a multiplier solely because it makes Sales and POD quantities closer.
5. If no defensible conversion exists, mark the line ambiguous rather than silently substituting.

The focal 1954 rule needs a golden fixture confirming that `20 × 100 = 2,000`. The conversion source should be visible in the document, UOM metadata, a controlled catalog table, or an approved fixture—not an LLM guess.

### Integration flag and fallback

Add an opt-in CLI mode, for example:

```text
--match-level trx       # default/current behavior
--match-level line
```

Optionally add:

```text
--line-fallback trx|error
--extraction-cache DIR
--reconciliation-report PATH
```

Behavior:

- Default `trx`: identical to current implementation.
- `line`: extract and reconcile each PDF independently.
- `line` with `trx` fallback: if one PDF cannot be reliably extracted, retain current TRX-level output for that PDF and record the fallback.
- Strict production/audit runs should support `--line-fallback error` to prevent silently overclaiming POD support.

The workbook can remain at 11 columns, but a sidecar JSON/CSV audit report should contain source pages, match scores, conversions, fallbacks, and unmatched Sales/POD lines.

## 6. Test changes

The existing test should continue proving that default TRX mode produces 90 rows.

Add unit tests with an injected fake extractor—never live Gemini—for:

- Filename TRX overriding unrelated PO/supplier references.
- Nullable lot/manufacturer/UOM fields.
- `3MOC-`/`3MOR-` manufacturer normalization.
- Matching repeated descriptions by manufacturer shade/code.
- Lot-preferred matching.
- One-to-one consumption of Sales rows.
- Omission of four Sales-only lines.
- POD quantity replacing Sales quantity.
- Explicit pack conversion for the 1954 `3000 → 2000` case.
- The focal lot-anchored `4870A2 → 56921 KIT`, quantity `5`, exception.
- Ambiguous extraction and configured fallback/error behavior.
- Multiple TRX tokens in one filename/PDF packet.
- No duplicated output when several POD pages repeat the same delivery line.

The golden integration test should use all 24 filename TRXs plus committed/mock extraction JSON and assert:

- Default mode: 90 rows.
- Line mode: 86 rows.
- Exactly six rows for `2600015875`.
- The six focal manufacturer/quantity/UOM values match the clerk.
- All other 23 TRXs retain their expected row counts.
- Preferably all 86 projected rows match the clerk after normalizing the legacy `TRX Type`/`Order Type` header difference.

## 7. Confidence and risks

### Confidence

- **Explaining the 90→86 difference:** Very high. Only `2600015875` differs, by exactly four rows.
- **Producing an 86-row golden Wave 2 result with curated/mock extraction:** Very high.
- **Automatically extracting all 24 PDFs with multimodal vision:** Moderate to high, provided the schema is nullable, filename TRX is authoritative, and results are cached/reviewable.
- **Exact clerk reproduction with the existing Gemini extractor unchanged:** Very low; the previous E2E produced zero accepted rows.
- **Exact unattended reproduction on unseen POD formats:** Moderate until more golden packets establish conversion and exception rules.

### Principal risks

- Nineteen of 24 PDFs require OCR/vision.
- Document references are not Sales TRXs.
- Lot is frequently absent.
- Product codes may appear only inside descriptions.
- GTIN/customer numbers do not necessarily equal Sales `Item Code`.
- Repeated generic descriptions require shade/catalog-aware matching.
- Pack/UOM conversions can change quantities by factors of 100 or 150.
- One focal clerk row appears to correct the Sales item identity, not merely its quantity.
- Multi-page packets may contain orders, receipts, delivery notes, and duplicated representations of the same line.
- Gemini may return plausible but conflicting values between model tiers.
- Falling back to TRX-level inclusion preserves availability but can reintroduce unsupported rows; every fallback must be explicit.

Overall recommendation: proceed with implementation, but treat it as evidence-backed reconciliation with confidence thresholds and an audit report—not simply an OCR filter.
