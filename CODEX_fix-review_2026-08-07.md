## Verdict: NO-GO

The edits are likely to improve the historical J26-640 golden, but they are not safe for production as written.

The blocking issue is fix #2b: the blanket sponsorship blanking contradicts the newer, explicit “Labadi RULE 1” production requirement that sponsorship rows carry the requesting AlJeel employee number. J26-640’s historical truth expects blanks, while current production code expects zero blank employee numbers. This policy conflict must be resolved before paying for another golden run.

### 1. Correctness

Fix #1 mostly does what its comments claim:

- Unique passenger-name, invoice-ref employee, employee-filename, and rail matches bypass `trips_match`.
- Multiple candidates use `trips_match` as a tie-breaker.
- Empty candidate lists are handled safely.
- No evident `None` dereference or indexing exception was introduced.
- The file parses successfully.

However, two correctness caveats exist:

- In `resolve_invoice_ref_folder`, the ambiguous fallback is `folders[0]`, not an explicitly sorted deterministic result. Its stability depends on upstream `all_folders`/index insertion order.
- In `find_folder_v25`, the multi-folder fallback is only entered when `len(pc_emp_nos) == 1`. Multiple name matches without exactly one PC employee token still return `None`; therefore the comment’s broad “inconclusive tie-breaker falls back” claim is narrower than the actual behavior.

Fix #2a correctly separates filename-derived employee indexing from the broader route hint. Folder/file text remains available to `trips_match`, but employee numbers from body text no longer enter `emp_filename`.

Fix #2b mechanically blanks both:

- The workbook `Employee No` cell.
- `hybrid_row["emp_no"]`.

It runs after booking-group propagation, which is appropriate for preventing propagation from restoring the employee number. Requiring `"Employee No"` in the `required` set has one new side effect: on any schema missing that column, the function now skips the existing annual-to-sponsorship account guard too.

### 2. Fix #1 side effects

Yes, unique-but-incorrect folders can now be accepted.

Examples:

- A passenger’s name appears in one unrelated or stale evidence filename.
- An employee number appears in only one currently unclaimed folder, but that folder represents another trip.
- A rail passenger has one employee-associated rail folder from a different route/date.
- Evidence is incomplete or duplicated across roots in a way that leaves only one apparent candidate.

The original staged `trips_match` changes were explicitly introduced as a hard evidence gate for:

- `EVIDENCE_TRIP_IDENTITY_MISMATCH`
- `EVIDENCE_SAME_EMPLOYEE_MULTIPLE_TRIPS`

That protects against employee/name identity being mistaken for trip identity. The new fallback partially reverses that protection.

The highest-risk branch is multiple employee folders where no trip matches, or more than one matches: returning `folders[0]` reintroduces the exact “same employee, wrong trip” class the account-fixes work intended to stop. A better policy would distinguish:

- Unique high-confidence identity plus absent/unparseable route → potentially accept.
- Explicit route/transport contradiction → reject.
- Multiple candidates with no unique trip winner → remain ambiguous, not choose the first.

Current `trips_match` conflates “route unavailable” and “route contradicts,” which explains J26-640’s regression, but unconditional fallback is too broad.

### 3. Fix #2a side effects

`filename_hint_parts` contains:

- The logical folder basename.
- Every basename yielded by `fea.iter_evidence_files`.

That iterator covers merged logical folders and either the folder’s immediate children or the immediate files inside its single evidence-child directory. It does not recursively harvest arbitrary deeper descendants, although that matches the project’s logical-evidence abstraction.

A legitimate body-text case can break: before this patch, body text was indexed when a PDF/MSG filename contained `personal contribution` or `approved`. If the employee number existed only inside such an approval document—not its filename—the employee-ref fallback will disappear.

Rail/voucher evidence is less directly affected because the rail booking index is separate, but an employee-number fallback for a rail/voucher folder can still be lost if the number exists only in document content.

I found no evidence proving a named benchmark depends on body-only employee indexing. This therefore needs targeted non-API fixture/index testing, especially for approval documents.

### 4. Fix #2b — highest priority

The claimed hard rule is not consistently true in the current codebase.

Historical golden evidence supports blank sponsorship employee numbers:

- J26-640 truth reportedly has 104 sponsorship rows with blank employee numbers.
- Older regression reports also describe sponsorship employee numbers as intentionally blank.

But newer production code explicitly reverses that convention:

- [`process_batch.py`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:542) says sponsorship rows carry the OPEX requestor’s employee number.
- [`process_batch.py`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1880) says shared-OPEX sponsorship rows must not be blanked.
- [`process_batch.py`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:2162) says Employee No is always written, including sponsorship.
- Its final QC expects zero blank employee numbers.

Therefore:

- For the historical J26-640 scoring contract: the guard is likely correct.
- For current J26-815+ production policy: the guard is directly contradictory and potentially destructive.
- Personal-contribution rows are unaffected if correctly classified as `21070229`.
- Mixed OPEX rows finally classified as `60307021` will be blanked even when the employee represents the legitimate OPEX requestor/allocation owner.

Ordering is otherwise technically correct: the guard runs after overlays, output writing, location rewriting, and booking-group propagation. Later stages do not repopulate Employee No. They normalize segments, sync descriptions, prefix sponsorship descriptions, and run fraud detection. Fraud detection receives the now-blank `hybrid_rows` value, so this change also affects downstream fraud context rather than being merely an output-format adjustment.

### 5. Cross-batch risk

| Fix | J26-593 | J26-550 | J26-589 | J26-640 | J26-815+ production |
|---|---|---|---|---|---|
| #1 trip demotion | NEEDS-TEST | NEEDS-TEST | NEEDS-TEST | Likely beneficial | RISKY |
| #2a basename-only index | NEEDS-TEST | NEEDS-TEST | NEEDS-TEST | Likely beneficial | NEEDS-TEST |
| #2b sponsorship blanking | Likely benchmark-safe | Likely benchmark-safe | Likely benchmark-safe | SAFE for historical truth | **RISKY / policy violation** |

J26-640 alone is not sufficient. At minimum, re-score all four benchmarks because fix #1 affects general invoice-ref and missing-evidence resolution, not merely the J26-640 special passenger fallback.

Before any production rollout, also run non-paid, deterministic tests covering:

- Same employee with multiple trips.
- Unique name/employee candidate with an explicit route contradiction.
- Employee number only inside an approved PDF/MSG body.
- Shared-OPEX sponsorship with a requestor employee number.
- A J26-815+ workbook under the current “Employee No always populated” contract.

### 6. Interaction between fixes

There is no direct exception or ordering conflict.

There is an indirect semantic interaction:

1. Fix #2a reduces employee-folder candidates.
2. Fix #1 then treats a surviving single candidate as authoritative without route corroboration.
3. That can turn an incomplete index into a wrong unique match.
4. If the resulting classification is sponsorship, fix #2b erases the employee number, making the incorrect evidence association harder to diagnose in the final workbook and changing downstream fraud inputs.

Recommendation: do not spend the golden run yet. First reconcile whether production follows historical golden blanking or the newer Labadi RULE 1, and tighten fix #1 so explicit trip contradictions still fail while merely missing route metadata can fall back.
