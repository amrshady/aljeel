# GL Account Map — Oracle Fusion AP coding reference

Placeholder for Oracle Fusion GL accounts referenced in batches. Populated as accounts appear in matched outputs.

Aljeel runs on Oracle Fusion for AP. This agent does NOT replace Oracle — it pre-resolves exceptions before invoices post and produces an Oracle-ready file that finance ingests as-is.

---

## Coded so far

(Empty — populate from Oracle PO-match reports as batches are processed.)

| Account Code | Description | Used by | Notes |
|---|---|---|---|
| | | | |

---

## How to populate

When a new batch's Oracle PO-match report contains a GL code not yet in this table:
1. Extract the GL code + description from the Oracle Excel
2. Append a row to the table above
3. Note which vendor / pipeline first used it
4. Flag any ambiguous mappings (e.g. "same description, different code across batches") in known-issues.md

---

## Standard catch-coding heuristics (vendor-side)

Even without the full Oracle GL master, certain catch types map to standard AP accounts:

| Catch | Likely Oracle account class | Reviewer should verify |
|---|---|---|
| Asateel ALLOC_MISMATCH | Suspense / pending allocation | Re-run allocation Excel |
| Asateel DUP_JQ_STRICT | AP control / payable | Verify before posting payment |
| Jawal NO_FOLDER | Travel expense | Block posting until evidence provided |
| Jawal PERSONAL_CONTRIB_SELF_APPROVAL | Employee receivable | Route to manager for approval |
| J&J quantity mismatch | Inventory variance | GR adjustment or vendor credit memo |

These are heuristics, NOT canonical coding. Aljeel finance owns the final account-code decision.
