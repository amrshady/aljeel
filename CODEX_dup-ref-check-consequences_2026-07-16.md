The duplicate-Ref.No check is not in the legacy `scripts/` / `qc/` reconciliation catches. It lives in the newer Jawal upload evidence gate in the adjacent application repository. It is a pre-submission hard validation, not a reconciliation output catch.

## Exact location

Primary implementation:

- [`jawal-evidence-check.ts:724`](</home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:724>) — `validateJawalEvidencePack()`.
- [`jawal-evidence-check.ts:827`](</home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:827>)–893 — Gate B1a duplicate logic:
  - `seenRefs` / `seenTickets`: 827–830.
  - Duplicate prefixed Ref.No detection: 832–862.
  - Duplicate ticket detection: 865–893.
  - Emits `JAWAL_REF_DUPLICATE`, defined at lines 9–25.
- [`jawal-evidence-check.ts:1024`](</home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1024>)–1046 — any finding becomes a non-null validation error; `duplicateRefs` is included in `error.details`.

The intended rule is documented at [`jawal-evidence-checker-rules-v2-focused.md:30`](</home/clawdbot/.openclaw/workspace/aljeel/knowledge/jawal-evidence-checker-rules-v2-focused.md:30>)–49, especially line 45: duplicate Ref/Ticket within the batch is a BLOCK.

Tests are at [`jawal-evidence-check.test.ts:300`](</home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.test.ts:300>)–354. They explicitly allow repeated employee-number Ref.No values but expect duplicate letter-prefix serials and tickets to fail.

## 1. AP risks guarded against

Removing both duplicate checks would eliminate two distinct controls:

- Duplicate ticket protection: an airline ticket number should identify a specific issued ticket. Reappearance can mean the same underlying charge was submitted twice. This is the strongest direct double-payment control.
- Duplicate event/reference protection: repeated event serials can indicate a copied line or resubmitted expense. It is weaker than ticket uniqueness because event references naturally group several charges.
- Resubmission visibility: a repeated identifier currently forces the vendor/AP reviewer to resolve the collision before submission rather than allowing it silently into processing.
- Audit trail: the finding records `code`, `rule`, row, Ref.No/Ticket, message, and the aggregate `duplicateRefs`. Full removal means there is no structured record that the duplicate was detected, reviewed, or accepted.

Important limitation: this check is within the uploaded batch only. It does not consult finalized historical batches. Cross-batch protection is separate and ticket-based in [`cross_batch_fraud.py:91`](</home/clawdbot/.openclaw/workspace/aljeel/scripts/cross_batch_fraud.py:91>)–133, function `run_cross_batch_fraud()`, category `CROSS_BATCH_DUPLICATE_TICKET`, severity `HARD`.

## 2. Downstream behavior and outputs

For the upload gate:

- Every finding is effectively BLOCK severity; the function states this at [`jawal-evidence-check.ts:723`](</home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:723>)–725. There is no WARN tier or per-finding `severity` field.
- A duplicate produces:
  - `code = JAWAL_REF_DUPLICATE`
  - `gate = B`
  - `rule = B1a`
  - `ref` or `ticket`
  - `row`
  - human-readable `message`
  - `error.details.duplicateRefs`
- Client-side submission stops at [`page.tsx:154`](</home/clawdbot/.openclaw/workspace/aljeel-repo/apps/web/src/app/[locale]/invoices/new/page.tsx:154>)–179.
- Server-side submission independently stops with HTTP 422 at [`invoices.service.ts:389`](</home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:389>)–397.
- UI rendering consumes the findings and `duplicateRefs` at [`format-error.ts:155`](</home/clawdbot/.openclaw/workspace/aljeel-repo/apps/web/src/lib/format-error.ts:155>)–179.

Removing only the Ref.No branch would therefore:

- Stop event-reference duplicates from contributing to the BLOCK count.
- Remove those values from `details.duplicateRefs`.
- Remove their row-level messages from the UI.
- Potentially turn a failing pack into `{error: null, findings: []}` when no other validation issue exists.

It would not directly change reconciliation workbook columns such as `QC Catches`, `Row Status`, or accounting segments. Those belong to the Python pipeline. It also would not remove `CROSS_BATCH_DUPLICATE_TICKET`, `DUP_ROUTE_STRICT`, or their `HARD`/`HIGH`/`MEDIUM` flags.

## 3. Current false positives

The Ref.No rule only checks normalized letter-prefix serial equality:

```text
normalized Ref.No already seen in another row
```

It does not consider ticket, passenger, amount, beneficiary, charge type, or whether the rows belong to one group/event.

That makes references such as `EP-2026-18`, `HF-2026-27`, and `CRM-2026-39` poor uniqueness keys. They are event/OPEX grouping identifiers, not necessarily individual payable-item identifiers. A single group booking can legitimately contain:

- Multiple passengers with distinct tickets.
- Outbound and return legs.
- Ticket, hotel, transport, and ancillary lines.
- Several employees allocated under one OPEX form.
- Split or change-related charges.

The J26-954 trace demonstrates the pattern for `EP-2026-18`: six distinct tickets are bundled under the same shared OPEX folder at [`nohup-J26-954-v30.out:140`](</home/clawdbot/.openclaw/workspace/aljeel/qc/reports/nohup-J26-954-v30.out:140>)–145. `CRM-2026-39` similarly covers multiple tickets and event expenses at lines 152–154 and shared multi-salesman allocation at lines 229–232.

Thus the current rule conflates “same event” with “same payable.” It correctly exempts numeric employee Ref.No values, but it does not exempt event serials—the exact class most likely to repeat legitimately. For a reference occurring six times, it emits five duplicate findings, since every occurrence after the first is flagged.

## 4. Safer alternatives

Best approach: retain strict duplicate-ticket blocking, but treat event Ref.No differently.

- Warn-only event-reference duplicates: allow submission after acknowledgment while retaining `JAWAL_REF_DUPLICATE` in the audit report. This requires adding a real WARN/acknowledgment path because the current checker is pure pass/fail.
- Compound-key blocking:
  - `Ref.No + amount + beneficiary/passenger`
  - Preferably also ticket number or service/expense date.
  - Block when the compound key repeats; warn when only Ref.No repeats.
- Group-aware policy:
  - Recognized OPEX/event serial repeated with different tickets/passengers → expected group booking, INFO or no finding.
  - Same event serial plus same ticket → BLOCK.
  - Same event serial plus same beneficiary, amount, date, and charge type → BLOCK or high-confidence warning.
- Cross-batch compound history: retain a historical fingerprint such as supplier + ticket, or supplier + Ref.No + beneficiary + amount + date, so genuine resubmissions remain detectable.

Recommendation: do not fully remove duplicate detection. Keep exact duplicate tickets as hard BLOCK, downgrade repeated event Ref.No values to WARN, and escalate to BLOCK only when a transactional compound key also matches. This preserves the double-payment and audit-trail control without rejecting normal multi-passenger/event billing.
