# Read-only investigation result

## Recommendation

Do **not** adopt “numeric Amount AND resolved Cost Center AND resolved DIV.”

It would delete two legitimate, reconciled golden allocation rows:

- Invoice `03110`, JQ `JQ-26115838`, amount `416.67`
- Invoice `03309`, JQ `JQ-26115886`, amount `287.50`

Both have blank resolved CC **and** blank resolved DIV. Neither is Warehouse. Dropping either breaks its invoice reconciliation.

The safest predicate is:

```text
numeric amount
AND
at least one real, row-local join key:
    canonical JQ
    OR explicit invoice in that source row
    OR invoice token in Description/Comments
```

Crucially, “explicit invoice” must mean the source row’s own invoice cell—not the parser’s inherited `current_inv`.

This predicate drops the two observed Grand Total rows because they have an amount but no row-local invoice, canonical JQ, or invoice-bearing description. It keeps all 183 golden rows, including all five legitimate blank-JQ Warehouse rows.

No files were edited and nothing was deployed.

---

## 1. The two golden blank-CC rows

The locked baseline identifies the keys as `03110` line 1 and `03309` line 2 in [qc/asateel_golden_expected.json](/home/clawdbot/.openclaw/workspace/aljeel/qc/asateel_golden_expected.json). I reconstructed the 183-row golden result in memory from the existing 92 cached extractions, default Expenses Format, current SO_Detail cache, and `build_rows`; it reproduced exactly:

```text
183 rows
92 invoices
2 blank CC
2 blank DIV
```

There are no other empty CC or DIV values in the golden set.

| Golden output row | Supplier source | Warehouse? | CC | DIV | Agency | Amount | Result if CC+DIV required |
|---|---|---:|---:|---:|---:|---:|---|
| `03110`, line 1 | Excel row 61, `JQ-26115838` | No | blank | blank | `10009` Ivoclar | `416.67` | **Dropped** |
| `03309`, line 2 | Excel row 162, `JQ-26115886` | No | blank | blank | `99999` Others | `287.50` | **Dropped** |

### Invoice `03110`

Source row 61 contains:

```text
Invoice:       03110
Description:   Transportation / 03110
JQ:            JQ-26115838
Agency:        Ivoclar Digital
Division text: DMS
Cost Center:   Sales
Solution:      Dental Technologies
Amount:        416.666...
```

After lookup resolution:

```text
Cost Center code: blank
Cost Name:        Sales
DIV code:         blank
Agency:           10009
Agency resolution: supplier_fallback_conflict
Status:           YELLOW
```

Invoice `03110` has three net allocation units of `416.67` each. Removing the first would leave approximately `833.34` instead of the reconciled `1,250` net / `1,437.50` gross.

### Invoice `03309`

Source row 162 contains:

```text
Description:   Transportation / 03309
JQ:            JQ-26115886
Agency:        Others
Division text: Lab
Cost Center:   Sales
Solution:      General Lab
Amount:        287.50
```

After lookup resolution:

```text
Cost Center code: blank
Cost Name:        Sales
DIV code:         blank
Agency:           99999 Others
Agency resolution: supplier_fallback_blank
Status:           YELLOW
```

Invoice `03309` has four net allocation units of `287.50`. Removing this row would leave `862.50` instead of the reconciled `1,150` net / `1,322.50` gross.

### Are they blank by design?

Not specifically under either cited exception:

- They are **not Warehouse**.
- They have nonblank canonical JQs.
- They do **not** use the blank-JQ Warehouse path.
- Option-A does not manufacture missing CC/DIV codes. It preserves/inherits the supplier allocation block; here the supplier texts `Sales`, `DMS`, and `Lab` did not resolve into CC/DIV codes.

Therefore, these are legitimate monetary/JQ rows with tolerated unresolved organizational segments. They are part of the locked reconciled golden behavior, but they are not examples of a designed Warehouse blank.

The code explicitly continues processing incomplete supplier allocations as `supplier_expenses_format_unresolved` at [asateel_poc.py:2318](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2318)–[2348](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2348).

---

## 2. Legitimate empty-DIV cases

### Golden set

Exactly two legitimate rows have empty DIV:

1. `03110` / `JQ-26115838` / agency `10009`
2. `03309` / `JQ-26115886` / agency `99999`

Both also have empty resolved Cost Center.

### Blank-JQ Warehouse rows

The golden set has five legitimate blank-JQ rows:

| Invoice | Source row | CC | DIV | Agency | Amount |
|---|---:|---:|---:|---:|---:|
| `03043` | 12 | `140040` | `190` | `10200` | `1,850` |
| `03045` | 15 | `140040` | `190` | `10200` | `2,650` |
| `03130` | 74 | `140040` | `190` | `10200` | `2,450` |
| `03139` | 89 | `140040` | `190` | `10200` | `2,300` |
| `03243` | 149 | `140040` | `190` | `10200` | `1,850` |

Thus blank-JQ Warehouse rows intentionally lack a JQ, but **do not** intentionally lack DIV: the Warehouse pin supplies CC `140040` and DIV `190`. See the locked Warehouse rule at [asateel-runbook.md:105](/home/clawdbot/.openclaw/workspace/aljeel/knowledge/asateel-runbook.md:105) and blank-JQ rule at [asateel-runbook.md:110](/home/clawdbot/.openclaw/workspace/aljeel/knowledge/asateel-runbook.md:110).

### Placeholder agencies

Placeholder agency is independent of DIV:

- Runbook §5 says CC/DIV should remain populated when agency is `00000`/`99999`; only agency is expected to be placeholder: [asateel-runbook.md:126](/home/clawdbot/.openclaw/workspace/aljeel/knowledge/asateel-runbook.md:126).
- Golden `03309` is an actual exception where agency is `99999` **and** CC/DIV are unresolved, but the missing DIV is not caused by the placeholder-agency rule.
- The code permits incomplete supplier allocation rows to survive as YELLOW/unresolved; it does not require DIV before emission.

### Recent batch outputs

I inspected the stored Oracle workbooks generated July 27–August 4:

- Western 9: no blank CC/DIV rows
- Projects 18: no blank CC/DIV rows
- Central 18: no blank CC/DIV rows
- Central 17: no blank CC/DIV rows
- [Central Admin 11](/home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-ادارة%2011-26/Central-26-2026_Oracle-upload.xlsx): one blank CC/DIV row—the leaked `52,200` footer
- [Eastern 8](/home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-الشرقية%208-2026/Eastern-2026-2026_Oracle-upload.xlsx): one blank CC/DIV row—the leaked `34,400` footer

Therefore:

- Recent stored batches contain **no identified legitimate blank-DIV rows**.
- The golden set nevertheless proves that legitimate blank-DIV rows exist and are locked behavior.
- Blank-JQ and placeholder-agency status cannot safely be used as a proxy for DIV completeness.

---

## 3. Candidate predicates and exact golden impact

All counts below are against all 183 golden supplier allocation units.

| Candidate predicate | Golden rows dropped | Exact impact |
|---|---:|---|
| Amount + resolved CC + resolved DIV | **2** | `03110/JQ-26115838`; `03309/JQ-26115886` |
| Amount + resolved DIV | **2** | Same two rows |
| Amount + (CC or real agency), excluding `00000`/`99999` | **1** | `03309/JQ-26115886` |
| Amount + (CC or any nonblank resolved agency), including `99999` | **0** | No golden loss |
| Amount + canonical JQ | **5** | Legitimate blank-JQ Warehouse invoices `03043`, `03045`, `03130`, `03139`, `03243` |
| Amount + (source JQ or any description) | **0** | No golden loss, but arbitrary signature text could pass |
| **Amount + row-local join key** | **0** | Recommended |

### Why “resolved DIV only” is unsafe

It rejects both legitimate unresolved golden rows. It also couples row identity to allocation quality: an actual transaction with a lookup problem disappears instead of remaining visible as YELLOW/RED.

### Why “CC or valid agency” is not safest

It is ambiguous around placeholders:

- If `99999` is invalid, it drops golden `03309`.
- If `99999` is accepted, golden passes, but the predicate still uses allocation resolution to decide whether a source row exists.
- Future legitimate rows with unresolved CC and agency could be silently lost rather than flagged.

### Why “any description” is insufficient

It passes golden, and the current Grand Total rows have no source description. But signature/footer rows may contain arbitrary descriptive text. A generic nonblank-description test would admit those variants.

### Recommended predicate

Conceptually:

```python
has_numeric_amount = rec.get("amount") is not None

has_row_local_join_key = (
    canonical_source_jq
    or explicit_source_invoice_cell
    or invoice_token_from_description
)

valid_supplier_row = has_numeric_amount and has_row_local_join_key
```

Expected impact:

| Dataset | Rows dropped |
|---|---:|
| Golden legitimate rows | **0** |
| Golden blank-JQ Warehouse rows | **0** |
| Central leaked Grand Total | **1** |
| Eastern leaked Grand Total | **1** |

The parser already computes `header_inv` and `description_inv` at [asateel_poc.py:1635](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1635)–[1643](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1643), but it currently stores only the resulting inherited `row_inv`. To distinguish a true row-local invoice from fill-down, the record would need to preserve the original `header_inv` or an equivalent boolean.

This directly addresses the actual defect: `current_inv` fill-down gives footers an invoice association, while the footer has no real join key of its own.

---

## 4. Locked-rule interactions

| Locked rule | Interaction/risk |
|---|---|
| Supplier-authoritative agency | **Direct.** Filtering a supplier row removes the authoritative allocation row before agency resolution. Do not use agency completeness as row identity. |
| Warehouse DC pin | **Direct and high risk.** Blank-JQ Warehouse rows must survive the filter before `is_warehouse_cc` and `finalize_distribution()` can pin CC/DIV/DC. |
| No row expansion | **Direct cardinality risk.** A wrongly dropped supplier unit reduces the real per-JQ row count and allocation total. The filter must not become an implicit row-contraction rule. |
| Employee No = SPERSON | **Direct for JQ rows.** Dropping a legitimate JQ row also removes its SO_Detail/SPERSON-derived employee output. A row-local JQ predicate aligns with this rule. |
| SO_Detail v2 agency matrix | **Direct for nonblank JQs.** The matrix executes only after row acceptance. Filtering on resolved agency could bypass conflict/blank/placeholder fallback cases that the matrix explicitly preserves. |
| Blank-JQ not dropped | **Most directly affected.** A JQ-only predicate drops five golden Warehouse rows. The recommended invoice/description alternatives preserve them. |
| Option-A CC/DIV inheritance | **Direct conceptual conflict.** A pre-filter requiring CC/DIV prevents downstream inheritance or unresolved-row handling from occurring. Allocation completeness must not decide source-row existence. |
| Severity monotonic | **Indirect but important.** A filtered row has no severity at all. Deleting an incomplete allocation can hide a YELLOW/RED condition and falsely improve status counts while breaking reconciliation. |

## Final decision

Reject the finance proposal as written. It regresses the locked golden set by exactly two legitimate rows and breaks two reconciled invoices.

Use a **row-identity predicate**, not an allocation-completeness predicate:

> Keep a numeric-amount row when it has a canonical JQ, an explicit source-row invoice, or an invoice token in its own description. Reject numeric rows whose only invoice association came from header fill-down.

That is the narrowest predicate supported by the observed failure mechanism and has zero golden-row loss.
