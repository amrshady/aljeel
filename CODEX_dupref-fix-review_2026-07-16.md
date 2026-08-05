Verdict: **SHIP**

No blocking or major regressions found in the follow-up commits.

1. **Resolved — Ref.No warning vs ticket block**

At `origin/main:packages/shared-types/src/jawal-evidence-check.ts:891`:

- `duplicateRefCompoundKey()` and its compound escalation map are gone.
- Repeated canonical letter-prefix Ref.No values always call `pushWarning()`.
- Matching description, amount, date, or other incidental fields cannot escalate the Ref.No to a block.
- Exact duplicate tickets independently call `pushBlock()` and add the ticket to `blockingDuplicateRefs`.

This correctly implements: repeated event/group Ref.No → **WARN**; duplicate ticket → **BLOCK**.

2. **Resolved — tests isolate the rules**

The tests now cover the requested distinctions:

- Same Ref.No, different tickets, including matching beneficiary/amount → warning only and `error === null` (`jawal-evidence-check.test.ts:360`).
- Duplicate ticket with distinct Ref.No values → block, with `error.details.duplicateRefs === ['6905428831']` (`:382`).
- Mixed warning and block → ticket appears in the error details while the repeated Ref.No remains in warning details (`:403`).

These are materially better than the prior test that accidentally exercised both duplicate rules through the same ticket.

Minor test-quality note: the ticket-block fixtures may also produce downstream folder findings because there is no separate evidence folder for every distinct Ref.No. The duplicate-ticket finding is generated first and the assertions correctly validate its code/details, so this does not invalidate the duplicate-policy coverage. Completely self-contained evidence folders would make the isolation stronger.

3. **Resolved — multi-sheet next-day lookup**

At `jawal-evidence-check.ts:895`, `seenRefs` now stores `{ row, date }`. The next-day comparison uses `first.date` directly rather than searching all extracted lines by a sheet-relative row number.

Therefore, duplicated row numbers across worksheets can no longer select the wrong sheet’s date. Displayed row numbers remain sheet-relative and potentially ambiguous to a human, but the validation decision itself is now correct.

There is no explicit multi-sheet regression test for this scenario; the implementation nevertheless directly removes the faulty lookup.

4. **Resolved — warning audit persistence**

At `origin/main:apps/api/src/invoices/invoices.service.ts:380`:

- The successful Jawal validation retains `evidence.warning`.
- The SUBMIT audit event stores `jawalEvidenceWarning` with its code, message, and details (`:444–462`).
- Blocking evidence errors still exit before submission and auditing.
- Commit `2bbd7f1` supplies the required Prisma `InputJsonValue` typing.

Thus Ref.No warnings are persisted on the successful submission path rather than discarded.

There is currently no `InvoicesService.submit()` test asserting the audit payload. That is a coverage gap, but the implementation path is straightforward and correct.

Overall, the four prior review findings are resolved. The new duplicate-policy tests look valid, `git diff --check` reports no patch-format problems, and I found no new ship-blocking bug in the follow-up. Tests were reviewed from `origin/main` but not executed because the requested source is not checked out and this was a strictly read-only review.
