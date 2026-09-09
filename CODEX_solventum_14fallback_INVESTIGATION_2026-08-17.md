## Solventum Wave 2 `trx_fallback` investigation

Read-only investigation completed. No workspace files were edited, and Gemini was not called.

I regenerated the live/cached line reconciliation using `/tmp/solventum_wave2_live_extraction.json`:

- Output: `/tmp/solventum_fallback_investigation.xlsx`
- Audit: `/tmp/solventum_fallback_investigation_reconciliation.json`
- Result: 86 rows
- `line_matched`: 10 TRXs
- `trx_fallback`: 14 TRXs

## Key risk signal

All 14 fallback TRXs happen to equal the clerk’s result:

- Fallback happens to be correct: **14 of 14**
- Fallback masks a Wave 2 clerk difference: **0 of 14**
- Rows covered by these fallbacks: **67**
- Comparison: exact row count and item/manufacturer, quantity, and UOM multiset per TRX

This explains why the final workbook matches the clerk, but it does not validate the fallback mechanism. In Wave 2, the clerk retained every Sales row for these 14 TRXs, so unconditional TRX inclusion happened to produce the right result.

## Root-cause buckets

| Primary reason | Count | TRXs |
|---|---:|---|
| Tied duplicate/aggregated Sales candidates | 7 | `2600014042`, `2600015947`, `2600015963`, `2600016032`, `2600016282`, `2600016384`, `2600016726` |
| Insufficient POD identifiers | 4 | `2600015669`, `2600015967`, `2600015968`, `2600017290` |
| Contradictory document evidence | 1 | `2600016310` |
| POD scope/extraction filtering gap | 1 | `2600016255` |
| Quantity aggregation plus non-item/UOM ambiguity | 1 | `2600017490` |

Several transactions exhibit secondary causes as well, especially missing lots combined with aggregated quantities.

## Per-TRX findings

| TRX | Concrete reason line matching failed | Clerk equality |
|---|---|---|
| `2600014042` | POD has one `6-UR-2` line for quantity 50. Sales has two otherwise identical `6-UR-2` rows with the same lot, quantities 10 and 40. Quantity 50 matches neither individual row, producing an exact tie. POD also reports `PACK`/`EACH` where Sales uses `Box-20`/`Box-1`, though that is not the decisive failure. | Yes, 7/7 rows |
| `2600015669` | Both POD lines contain only GTIN `4215242402101`, generic description “DUAL CURE ADHE RESIN LUT,” quantity, and `EA`. No catalog/manufacturer code or lot was captured. Scores remain below the matcher’s minimum despite quantities 600 and 2500 aligning uniquely with Sales. | Yes, 2/2 |
| `2600015947` | POD aggregates repeated catalog codes and supplies no usable lot: `7018A1E` quantity 100 against five Sales rows, and `7018A2E` quantity 100 against two. Description and code scores are identical across candidates. Extractor warning says the apparent batch `01-01-1` was rejected as invalid. | Yes, 10/10 |
| `2600015963` | POD aggregates `914022` into 780 against Sales rows 745 and 35, and `914031` into 445 against 10 and 435. Extracted lot `01-01-1` is an invalid placeholder, leaving identical code/description candidates tied. | Yes, 7/7 |
| `2600015967` | POD has GTIN, generic crown description, quantity, and `EA`, but no catalog/manufacturer code or lot. Description-plus-quantity scores are only 52–56, below the minimum assignment threshold. | Yes, 2/2 |
| `2600015968` | The `E-UR-7` line can be identified from description, but the `E-UR-6` line contains only GTIN, generic description, quantity, and `EA`; its score is 52 and therefore ineligible. One unassignable POD line makes the whole TRX incomplete. | Yes, 2/2 |
| `2600016032` | POD aggregates `6-LL-6` quantity 100. Sales splits the same catalog and same lot into quantities 75 and 25. Both candidates receive identical code, lot, and description scores, so assignment is tied. | Yes, 3/3 |
| `2600016255` | POD extraction contains four lines: the relevant `8692SF` line, two unrelated instrument lines, and “Delivery Charges.” Sales has only the single `8692SF` chargeback row. The current matcher requires every extracted POD line to map to a Sales line, so the three out-of-scope lines force an incomplete assignment. | Yes, 1/1 |
| `2600016282` | Several POD lines are aggregated while the apparent lot is the invalid placeholder `01-01-1`: `ND-96` quantity 30 versus four Sales lots, `6-UL-3` quantity 150 versus 120+30, and `6-UL-4` quantity 405 versus 150+255. Same-code candidates tie. | Yes, 9/9 |
| `2600016310` | The mathematical assignment is unique, but a controlled warning deliberately forces fallback. The PDF contains contradictory evidence: a rejection form says the shipment cannot be delivered, pick-slip markings conflict with the receipt, and one pick-slip item is absent from the receipt. | Yes, 4/4 |
| `2600016384` | POD aggregates quantities by catalog without lots: `6-UR-5` 555 across seven Sales rows, `6-UR-6` 330 across two, and `6-UR-7` 125 across three. Every same-code Sales candidate has the same score, creating many tied assignments. | Yes, 14/14 |
| `2600016726` | POD has a single aggregated `56950` quantity 450 with no lot. Sales has two `56950` rows, quantities 360 and 90 with different lots. Both candidates tie because aggregate quantity matches neither row and no lot distinguishes them. | Yes, 2/2 |
| `2600017290` | Sales contains two completely duplicate `46957` rows, each quantity 10 with the same lot. POD has one aggregate quantity 20 line, but extraction missed catalog/manufacturer identity and captured invalid lot `01-01-1`; description similarity is below threshold and tied across both duplicates. | Yes, 2/2 |
| `2600017490` | POD aggregates `61030` into quantity 600, while Sales has 50 and 550. With no POD lot, both same-code Sales rows tie because the matcher only rewards exact per-row quantity. A separate “Delivery charge” line also has no eligible Sales match, independently making the assignment incomplete. | Yes, 2/2 |

## Forward risk

Yes: a partial delivery following any of these patterns can be silently over-included.

When line reconciliation is ambiguous, incomplete, contradicted, or polluted by an extra extracted line, `--line-fallback trx` discards the line-level result and emits **every Sales row for that TRX**. It does not require that each emitted row have corresponding POD evidence.

The current design overclaims POD support whenever:

- A POD delivers only a subset of a multi-line TRX and the delivered lines cannot be assigned uniquely.
- Delivered quantities are aggregated across several Sales lots or rows.
- Lot or catalog identifiers are missing or lost during vision extraction.
- Duplicate Sales rows have identical identifiers.
- The PDF contains freight, delivery charges, other-vendor goods, or other lines outside the chargeback population.
- A single weak or extraneous POD line makes an otherwise useful assignment incomplete.
- Documents disagree about receipt, rejection, or delivery status.
- The extractor returns no usable lines or sufficiently weak lines.

For example, if a future counterpart of `2600016384` delivered only the aggregated `6-UR-5` quantity, fallback would include all 14 Sales rows—including unrelated `6-UR-6`, `6-UR-7`, `915100`, and `46957` rows. Nothing in the generated workbook identifies those rows as unsupported; the warning exists only in the separate reconciliation report.

## Recommended improvements

### 1. Make fallback visibly exceptional

**High impact, low effort**

- Do not treat `trx_fallback` rows as silently POD-supported.
- Produce a separate exception sheet/file listing the TRX, fallback reason, affected rows, POD lines, and unmatched candidates.
- Require explicit reviewer approval before fallback rows enter a claimable/final workbook.
- At minimum, fail the production run when any `trx_fallback` exists unless an explicit reviewed override is supplied.

This is the most important safety improvement.

### 2. Prefer safe partial reconciliation

**High impact, low-to-medium effort**

- Emit only confidently matched POD-backed rows.
- Keep unmatched Sales rows in an exception queue, not in the supported output.
- Do not let an unrelated freight or instrument line invalidate otherwise strong matches.
- Clearly distinguish `matched`, `unmatched_sales`, `unmatched_pod`, and `excluded_nonchargeback_line`.

The existing `partial` machinery is a useful starting point, but unmatched Sales rows should not be silently retained as supported.

### 3. Support aggregate-to-split matching

**High impact, medium effort**

Recognize cases where one POD line equals the sum of multiple same-item Sales rows:

- 50 = 10 + 40
- 780 = 745 + 35
- 445 = 10 + 435
- 100 = 75 + 25
- 450 = 360 + 90
- 600 = 50 + 550

Require a strong common item identity and exact quantity conservation. Record the relationship as an audited one-to-many match rather than forcing one-to-one assignment.

### 4. Improve lot capture and validation

**High impact, medium effort**

- Explicitly extract supplier batch/lot cells at full image resolution.
- Preserve raw lot text alongside normalized lot.
- Reject placeholders such as `01-01-1`, but escalate missing lots when duplicate same-code Sales candidates exist.
- Consider targeted second-pass extraction for lot columns rather than rerunning the entire document.
- Add deterministic partial-lot normalization only where provenance supports it.

Lots would resolve many of the tied candidates.

### 5. Filter POD lines by chargeback scope

**Medium-to-high impact, low-to-medium effort**

- Classify freight/delivery charges and unrelated non-Solventum goods as non-matchable document context.
- Do not require those lines to map to candidate Sales rows.
- Preserve them in the audit as excluded lines so filtering remains transparent.
- Use GTIN/catalog mappings to distinguish controlled Solventum products from unrelated instruments.

This directly addresses `2600016255` and part of `2600017490`.

### 6. Extend the controlled GTIN/catalog table

**Medium impact, medium effort**

Add verified mappings for GTINs currently extracted without usable catalog codes, including the crown and resin examples in `2600015669`, `2600015967`, and `2600015968`. Every mapping should retain source and review provenance.

### 7. Treat contradictory delivery evidence as a hard review stop

**High safety impact, low effort**

For cases like `2600016310`, never convert a controlled contradiction warning into unconditional full-TRX support. Require a reviewer to select the authoritative receipt evidence and document the decision.

## Bottom line

Wave 2’s 14 fallbacks are all clerk-correct, but only because the clerk also retained all Sales lines for those transactions. The current fallback is therefore **output-compatible with this wave but not evidence-safe**. The safest immediate change is operational: flag or stop on every `trx_fallback`, keep fallback rows out of claimable output until reviewed, and use partial confident matches plus an exception queue.
