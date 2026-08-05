## Verdict: DON’T SHIP

The basic warn/block plumbing works, but the duplicate-Ref implementation does not cleanly match the stated policy, and the tests leave important paths unproven.

### Key findings

1. **High — repeated event Ref.No can still hard-block without a duplicate Ticket**

In [jawal-evidence-check.ts](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts), `duplicateRefCompoundKey()` builds a key from whichever fields happen to be populated. If two rows share a Ref.No and only one additional populated field—such as description or amount—matches, `compoundFirst` exists and the Ref.No is pushed as a blocking duplicate.

That conflicts with the stated behavior that repeated event Ref.No should be downgraded to WARN while duplicate Tickets remain the hard-block condition. It also creates false-block risk for event lines that naturally share an event name or amount.

If compound matching is intentionally another hard-block policy, it needs a precise definition and dedicated tests without duplicate tickets. Otherwise, Ref.No repetition should always warn and Ticket duplication should independently block.

2. **Medium — the “compound details” test does not isolate that path**

The test at approximately lines 381–400 uses the exact same Ticket on both rows. Therefore it triggers both:

- the compound Ref.No block; and
- the duplicate Ticket block.

Both use `JAWAL_REF_DUPLICATE`, so the assertion cannot prove which rule caused the error. This fixture cannot validate compound-Ref escalation independently.

Likewise, the duplicate-Ticket test only checks the combined `findings` array. It does not assert:

- `result.error` is non-null;
- the blocking finding has `ticket` populated;
- `error.details.duplicateRefs` contains the Ticket;
- no warning was incorrectly substituted.

3. **Medium — next-day lookup is fixed only for a single sheet**

Commit `438e121` correctly replaces the invalid array-index lookup with:

```ts
lines.find((candidate) => candidate.row === first)
```

That fixes ordinary single-sheet spreadsheets. However, `row` is only a sheet-relative row number. When multiple sheets are extracted, different rows can have the same number, so this lookup may select a row from the wrong sheet.

Consequences are currently limited to incorrect “exactly one day later” messaging—the warn/block decision does not depend on this date check—but the displayed audit explanation can be wrong. Findings also lack sheet identity, making row references ambiguous generally.

4. **Medium — warning audit data is returned but not durably preserved**

Within `JawalEvidenceValidation`, audit information is reasonably preserved:

- all findings remain in the top-level `findings`;
- warning Ref.No values appear in `warning.details.duplicateRefs`;
- blocking Ticket/compound values appear in `error.details.duplicateRefs`;
- mixed results retain both `error` and `warning`.

However, the API submission gate only checks `evidence.error` and then discards `evidence.warning`. Therefore repeated Ref warnings are shown by the client before submission but are not persisted or returned as part of the successful server submission path. If “preserve the audit trail” means durable submission auditing, this change does not achieve it.

5. **Low — date handling is brittle**

The API and browser parse XLSX with `raw: true`. Excel dates may therefore arrive as numeric serials rather than ISO strings. `parseComparableDate()` does not decode Excel serial dates, so real next-day rows may receive the generic warning message instead.

The ISO parser also relies on `Date.UTC`, which normalizes invalid dates rather than rejecting them. This affects warning wording, not enforcement.

### What is correct

- Exact duplicate Tickets are still routed through `pushBlock()`.
- Ordinary repeated prefix/event Ref.No values with different compound keys route through `pushWarning()`.
- The server blocks only on `error`, so warning-only validation can proceed.
- The web UI now displays Jawal warnings.
- Blocking and warning findings are separated correctly while retaining a combined findings list.
- The account/type/OPEX missing-identifier change correctly exposes structurally invalid rows that were previously skipped.
- No new obvious injection, traversal, or file-handling vulnerability is introduced.

### Test assessment

The tests cover the happy-path warning, next-day warning text, and a duplicate-Ticket scenario, but coverage is not strong enough for the policy boundary. Missing cases include:

- same Ref.No + same description/amount but different Tickets, proving whether it must warn or block;
- duplicate Ticket with distinct Ref.No and otherwise valid evidence, asserting `error` and `error.details.duplicateRefs`;
- mixed warning Ref.No plus an unrelated blocker, asserting both audit channels survive;
- `warning.details.duplicateRefs`;
- repeated Ref.No across multiple sheets with identical row numbers;
- real XLSX numeric date values;
- API-service and submission-gate tests demonstrating warnings pass while Tickets block.

The change should not ship until the compound escalation policy is reconciled with the stated requirement and the tests isolate the warning and blocking paths.
