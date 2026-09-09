## Forensic conclusion

This is a genuine value regression, not a scorer/header/dtype artifact.

The bad workbook contains materially different segment and employee values. The scored columns remain aligned at the same coordinates, and `score_against_truth.py` reads them correctly by header name.

A second important finding: the stated “identical METHOD breakdown” is only true for the inherited `Resolution Layer` / `Agent Match Method` fields. The final `Agent Method` field is very different:

- Good: `cascade=110`, `llm_agent=7`
- Bad: `cascade=19`, `llm_agent=67`, `hybrid_overlay=9`, `missing_evidence_gate=22`

That 91-row method change closely matches the broad value rewrite. The good workbook largely preserved the v15.11.2 cascade; the bad run actively reprocessed most rows.

## Workbook diff

Both workbooks have 117 data rows, in the same order, with unchanged descriptions and tickets.

Headers:

- Scored fields remain fixed:
  - P: Employee No
  - Q: Company
  - R: Location
  - S: Account
  - U: Cost Center
  - W: DIV
  - Y: Solution
  - AA: Agency
- The bad workbook adds one trailing column at BH/column 60: `OPEX Allocation Details`.
- Nothing was inserted before the scored fields.
- No scored-field number formats changed.

Changed cells by important column:

| Column | Changed rows | Main pattern |
|---|---:|---|
| Employee No | 75 | Mostly blank → employee number |
| Cost Center | 49 | 22 blanks; many sponsorship CCs replaced by employee/master CC or `000000` |
| DIV | 49 | 22 blanks; many `170` → `000`, plus employee/master DIV |
| Solution | 44 | 22 blanks; often `10050`/`10017` → `00000` |
| Agency | 30 | 22 blanks plus employee/master agency substitutions |
| Account | 26 | 22 blanks plus four genuine account substitutions |
| Location | 1 | `20100` → `10100` |
| Distribution Combination | 82 | Rebuilt from the changed segment cells |
| GL Description | 72 | Rebuilt from the changed combination |
| Agent Method | 91 | Cascade preservation replaced by active resolution/gating |
| QC Catches | 22 | New `MISSING_EVIDENCE(HARD)` |
| Trip Purpose | 49 | Mostly `UNKNOWN` → `BUSINESS_TRIP` |
| Agent Flags | 102 | Resolution provenance changed broadly |

The 22 missing-evidence rows have all five allocation fields physically blanked:

```text
Account = None
Cost Center = None
DIV = None
Solution = None
Agency = None
Agent Method = missing_evidence_gate
QC Catches = MISSING_EVIDENCE(HARD)
```

Other representative genuine substitutions include:

- `60301004 → 60301003`
- `21070229 → 60301004`
- `60308009 → 60307021`
- `160014 / 170 / 10050 → 000000 / 000 / 00000`
- Good blank employee → passenger/requestor employee number on 69 rows
- Existing employees were replaced on several rows, e.g. `1001811 → 1001089`

The bad workbook is also much farther from the unchanged v15.11.2 cascade:

| Field | Cascade → Good changes | Cascade → Bad changes |
|---|---:|---:|
| Employee No | 2 | 76 |
| Account | 2 | 25 |
| Cost Center | 4 | 52 |
| DIV | 5 | 52 |
| Solution | 1 | 44 |
| Agency | 4 | 32 |

This establishes that the golden’s high score came mainly from preserving the locked cascade values, while the bad execution reapplied downstream resolution.

## Dtype/format assessment

There are dtype differences, but they do not explain the score collapse:

- Good blank employee cells are numeric-typed empty cells; bad employee numbers are strings.
- The scorer’s `_norm_emp()` deliberately normalizes numeric/string employee representations.
- Segment values are normalized with `str(v).strip()` and leading-zero removal.
- Therefore values such as numeric `888` versus string `"888"`, or `"00000"` versus numeric `0`, score equivalently.
- The 22 newly blanked cells appear as `inlineStr` empty cells, but `_norm()` intentionally treats either `None` or empty strings as `"0"`. They fail because truth contains nonzero segment values, not because of their Excel type.
- No number-format differences were found in any coordinate.

Conclusion: category **(a), genuine wrong values written**, not category **(b), column/header/dtype artifact**.

## Code attribution

### 1. Primary branch change: trip-identity filtering in `run_v30.py`

The highest-confidence causal change is the new trip-matching layer beginning at [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:160):

- `trip_transport_type()`
- `_trip_corridor()`
- `trips_match()`
- `_is_rail_row()`

`trips_match()` requires:

1. Identical inferred transport type, and
2. At least two shared route codes.

It is now imposed on previously accepted passenger-name and employee-filename evidence paths around [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:494) and [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3585).

When no route-complete match survives, the code reaches the hard gate and explicitly clears all five segments around [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3651). This directly explains the 22-row blanking block.

The matcher is particularly brittle for:

- Voucher/ancillary rows with no IATA corridor.
- Evidence filenames without a complete route.
- Folder hints containing unrelated transport tokens.
- Round trips expressed differently between description and evidence.
- Evidence whose correct association is established by ticket/ref/name but whose filenames do not repeat two route codes.

### 2. Expanded evidence indexing increases ambiguity and changes folder ownership

`build_invoice_ref_folder_index()` changed `emp_filename` from one folder per employee to a list and now indexes employee numbers from a large combined hint, including filenames and extracted evidence text, at [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2934).

The especially risky addition is:

```python
for emp_m in EMP_FILENAME_RE.finditer(hint):
    emp_filename.setdefault(emp_m.group(1), []).append(folder)
```

This can associate a requestor/approver/PC employee appearing anywhere in evidence text with the folder. `resolve_invoice_ref_folder()` then demands a unique trip match at [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3046).

This combination can:

- Turn a previously deterministic folder into a multi-folder ambiguity.
- Reject a correct event/sponsorship folder for lacking route text.
- Expose individual PC/passenger evidence and allow the downstream resolver to populate an employee/master allocation where the locked truth expects sponsorship and blank employee.

It is the best explanation for the combination of 22 hard blanks and widespread requestor/passenger employee assignments.

### 3. The invoice-reference classifier change is not the broad regression

The staged changes in [cost_center_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:379) and [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1105) only pass `invoice_ref_text` into `classify_account()` and recognize recruitment keywords there.

Evidence against this as the root cause:

- It can only introduce account `60308007`.
- The bad diff does not show a broad wave of new `60308007` values.
- It cannot directly change CC, DIV, solution, agency, or employee number.
- `run_v30.py` consumed the same already-created v15.11.2 workbook; `process_batch.py` was not rerun as part of that v30-only execution.

It may affect future cascade generation, but it did not cause this observed systemic v30 diff.

### 4. `backfill_invoice_ref_nos()` and write ordering are not supported as causes

`backfill_invoice_ref_nos()` is unchanged relative to `HEAD`; only its surrounding consumers changed. For this batch, its hard-coded candidate names are `invoice.xlsx` and `invoice-source.xlsx`, while the available source is named `INV-30 APR 26 AL JEEL.xlsx`. No matching candidate was found in either the batch directory or mounted J26-640 directory.

Therefore it would return without filling anything in this environment.

Likewise:

- No scored column was inserted or shifted.
- The extra `OPEX Allocation Details` column is appended at the end.
- GL/combo synchronization merely propagates already-changed segment values; it is downstream damage, not the origin.

## Ranked root-cause hypotheses and minimal fixes

1. **Trip-identity filtering rejects previously valid evidence, triggering the 22-row hard gate.**  
   Confidence: very high for the blanked rows.  
   Minimal fix: apply `trips_match()` only when choosing among multiple otherwise-valid trip folders. Do not require two route-code intersections for a unique ticket/ref/event/name match, and treat unavailable route evidence as “not disambiguating” rather than mismatch.

2. **Expanded employee indexing and trip filtering change which evidence folder is claimed, causing individual employee/master resolution to overwrite locked sponsorship allocations.**  
   Confidence: high for the broad employee and segment rewrite.  
   Minimal fix: restrict `emp_filename` indexing to explicit PC/approval filenames as before; do not harvest arbitrary employee numbers from full PDF/MSG text. Preserve event/ref-folder precedence over employee fallback.

3. **A missing preservation guard allows active v30 results to overwrite the locked cascade on 91 rows.**  
   Confidence: high from artifact evidence, though not attributable to one newly added line alone.  
   Minimal fix: restore the golden behavior: retain cascade allocation and blank employee unless a narrowly authorized overlay has authoritative evidence. Add a regression assertion that J26-640 changes from v15.11.2 are limited to the known golden delta.

4. **Invoice-reference recruitment plumbing changes account classification.**  
   Confidence: low for this incident.  
   Minimal fix if retained: only consult `invoice_ref_text` for a validated textual reference field, with tests showing that numeric/event references cannot alter classification accidentally.

5. **Header shift or dtype mismatch.**  
   Confidence: ruled out.  
   No fix needed.

## Provenance warning

The supplied artifacts do not support the claim that the final method breakdown is identical. They support identical inherited resolver layers, but the actual final `Agent Method` changes on 91/117 rows. The good artifact is essentially a cascade-preserving June workbook later backed up under an August filename; the bad artifact is an August active reprocessing result.

That distinction is central: the score did not collapse while executing the same final row behavior. It collapsed because the bad run changed which downstream v30 actions were applied to most rows. No files were modified and no pipeline/API calls were made.
