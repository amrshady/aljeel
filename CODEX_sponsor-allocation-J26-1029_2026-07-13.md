Read-only audit complete. No files were edited.

## Root cause

This is not a family/booking-group collapse or a SPLIT regression. In J26-1029:

- `cluster_unified = 0`
- `booking_group_propagated = 0`
- The incorrect employee numbers already exist in `Spreadsheet-J26-1029-FILLED-v30.xlsx`.
- Both SPLIT workbooks preserve those values unchanged.

The primary cause is an intentional post-v16 policy reversal: current code tells the LLM and deterministic resolvers that sponsorship rows must carry the OPEX requester/salesman employee number. Because every line associated with one OPEX folder sees the same requester, the entire event receives one employee number.

The original “sponsorship emp_no always blank” hard rule is not enforced. It has been explicitly disabled.

## Exact code path

### 1. Routing and evidence grouping

Every cascade row already on account `60307021` is routed for review at [run_v30.py:4090](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4090).

Invoice-reference and shared-folder resolution then associate the line with a common OPEX/event folder. All lines in that folder consequently see the same requester or salesperson.

Observed trace examples:

- SIS folder → `1001422`
- CRM folders → `1001762`
- EP folders → `1000433`

This happens before workbook writing or splitting.

### 2. LLM path: SIS and most CRM rows

The full-evidence prompt explicitly says that Scenario C sponsorship rows should use the requesting employee as `Employee No` at [full_evidence_agent_v30.py:564](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:564), especially line 567.

The v16 classification hint reinforces that behavior:

- Requester should be kept as sponsorship `emp_no`: [run_v16.py:788](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:788)
- “Mandatory … requester … never blank”: [run_v16.py:801](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:801)

The LLM output is accepted into `final["emp_no"]` at [run_v16.py:756](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:756), then copied into `hybrid_rows` at [run_v30.py:4235](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4235).

That is the path producing:

- SIS event rows → `1001422`
- CRM-2026-31/32/38 → `1001762`
- Some EP rows without a deterministic shortcut → `1000433`

The traces explicitly say these values came from the OPEX requester, not the passenger.

### 3. Deterministic sponsorship shortcut: EP rows

When Call 1 identifies a sponsorship requester in Manpower, v30 calls `resolve_sponsorship_from_master()` at [run_v30.py:1597](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1597).

That imported v16 function explicitly returns:

```python
"emp_no": requesting_emp_no
```

at [run_v16.py:617](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:617), lines 625–635.

V30 then defensively stamps the requester again at [run_v30.py:1611](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1611).

This is the exact path responsible for the EP-2026-19/20 rows carrying `1000433`.

### 4. LLM catch-all stamps requester again

Even after overlays, v30 fills a blank sponsorship employee number from `requesting_no` at [run_v30.py:1705](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1705).

Therefore a correct blank returned by an LLM would be overwritten.

### 5. OPEX salesman logic

`_apply_multi_salesman_from_opex()` at [run_v30.py:1320](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1320) treats the OPEX salesman allocation table as Employee No output:

- Multiple salesmen become comma-separated `emp_no`.
- One salesman is inserted when `emp_no` is blank.

It is invoked from both sponsorship resolution paths at [run_v30.py:1630](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1630) and [run_v30.py:1713](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1713).

This design conflates:

- OPEX requester/salesman allocation metadata
- The Oracle line’s Employee No field

It also discards the form’s salesperson allocation amounts. If multiple employees are found, `split_multi_emp.py` divides the line equally at [split_multi_emp.py:276](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:276), whether or not the OPEX form specified equal amounts.

### 6. Event-folder overlay

The late OPEX event overlay also writes the requester into `emp_no` and copies their home segments at [run_v30.py:4595](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4595), especially lines 4614–4628.

This is another independent path that can recreate the defect.

## Hard-rule regression

Confirmed.

The source header still claims:

> Sponsorship rows → emp_no always blank

at [run_v16.py:25](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:25).

But `enforce_sponsorship_rules()` explicitly states that the rule was reversed and now does nothing at [run_v16.py:817](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:817).

V30 additionally documents that its old cascade blanking pass was removed at [run_v30.py:4138](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4138).

The batch confirms the regression:

- The v15.11.2 input contains five existing `60307021` rows, all with Employee No blank.
- V30 changes those EP rows to `1000433`.

There is also contradictory live documentation:

- The QA rule correctly says sponsorship `emp_no` must be blank at [qa_agent.py:64](/home/clawdbot/.openclaw/workspace/aljeel/scripts/qa_agent.py:64).
- `PIPELINE.md` labels that rule stale and describes the requester-populated behavior as canonical at [PIPELINE.md:212](/home/clawdbot/.openclaw/workspace/aljeel/PIPELINE.md:212).

## CC, DIV, Solution and Agency assignment

The GL segments suffer from a related but separate precedence problem.

### Current precedence

1. Extract the OPEX form agency.
2. Find every Manpower row belonging to that agency.
3. If they all share one code set, apply that Manpower code set.
4. Otherwise fall back to the requester’s home segments.

This is implemented in:

- [run_v16.py:540](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:540)
- [run_v16.py:617](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:617)
- [run_v30.py:1098](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1098)

The code explicitly says form Division and Solution are ignored at [run_v16.py:541](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:541).

Consequences in this batch:

- Fujifilm/SIS becomes the consistent Fujifilm Manpower set: `160011 / 196 / 00000 / 10041`.
- Abbott is inconsistent across CRM/HF/EP solutions, so it falls back to the requester’s home record.
- EP requester `1000433` yields solution `10064`.
- CRM requester `1001762` yields solution `10017`.

Thus the output can look event-correct by coincidence, while actually being requester-home-derived.

### Nested-folder parsing defect

The deterministic OPEX parser uses `_find_opex_pdfs()`, which scans only files directly inside the selected folder at [run_v30.py:679](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:679).

J26-1029 stores the relevant PDFs one directory deeper, for example:

```text
25jun/EP-2026-20/Opex Refine - Amended EP-2026-20/OPEX-EP-2026-20-J-2026-135.pdf
27jun/CRM-2026-31/Opex - ... CRM-2026-31/OPEX-CRM-2026-31-J-2026-103.pdf
24jun/SIS-14-2026/DBE - Training .../OPEX-SIS-14-2026-J-2026-123.pdf
```

The full-evidence agent tolerates this structure, but `_parse_opex_event_segments()` does not. Consequently the deterministic late pass often cannot read the actual form and relies on LLM/requester fallback instead.

### SIS serial omission

The serial regex omits `SIS` at [run_v30.py:226](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:226). That is why the observed SIS sponsorship rows retain `OPEX Serial = N/A`.

One evidence clarification: the rows reported as SIS-15 are actually tied by the workbook’s `Invoice Ref No` and traces to `SIS-14-2026`—including 26-961, 26-970 and 26-971. The two true `SIS-15-2026` invoice-reference rows are employee travel rows `4860300449/450`, currently account `60301003`, employee `1000986`.

## SPLIT behavior

The splitter is not the origin of the reported single-number defect.

It reads the already-populated v30 Employee No at [split_multi_emp.py:267](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:267). It splits only comma-separated values and otherwise preserves the cell.

For sponsorship rows that do split, it intentionally preserves the parent event segments at [split_multi_emp.py:281](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:281) and [split_multi_emp.py:300](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:300).

The unsplit, pre-hardening SPLIT, and final SPLIT workbooks all contain the same reported `1001422`, `1001762`, and `1000433` assignments.

## Precise proposed diff plan

### 1. Restore the hard invariant in `run_v16.py`

Change `resolve_sponsorship_from_master()`:

```diff
- "emp_no": requesting_emp_no,
+ "emp_no": "",
```

in both return branches.

Replace the no-op `enforce_sponsorship_rules()` with a real invariant:

```python
if (
    classify.get("row_type") == "sponsorship"
    or final_account == "60307021"
    or cascade_account == "60307021"
):
    final["emp_no"] = ""
```

Account should be checked after all account overlays as well, so forced or late-created sponsorship rows are covered.

Update `_build_classify_hint()` so requester identity is evidence/context only and the mandatory output is `emp_no=""`.

### 2. Update the full-evidence prompt

At `full_evidence_agent_v30.py` Scenario C:

```diff
- Use the requesting Al Jeel employee / sponsor number ...
+ Employee No must be an empty string for external-party sponsorship rows.
+ Requester/salesman identities are evidence metadata only.
```

Keep the requester available for resolving missing allocation evidence, but never expose it as the line Employee No.

### 3. Remove all v30 requester restamping

Delete or neutralize:

- Requester stamp at lines 1612–1614.
- LLM catch-all at lines 1705–1711.
- Event-overlay requester assignment at lines 4615–4620.

The overlay may retain requester identity in a private field such as `_sponsorship_requesting_emp_no` for traceability.

### 4. Stop writing salesmen into Employee No

Refactor `_apply_multi_salesman_from_opex()` to store:

```python
final["_sponsorship_salesmen"] = [...]
final["_sponsorship_allocations"] = [...]
```

Do not mutate `final["emp_no"]`.

If form allocations need separate accounting rows, implement that as a dedicated sponsorship allocation splitter using the exact form amounts—not through the Employee No column and not with equal division.

### 5. Add a final v30 invariant immediately before writing

After `apply_sponsorship_event_segments()` and `inherit_ancillary_event_allocations()`, before `write_v15_12_xlsx()`:

```python
for row in hybrid_rows:
    if row["account"] == "60307021":
        row["emp_no"] = ""
```

This is necessary because v30 has several late paths that can create sponsorship rows after the per-row resolver.

It should also add a trace flag such as `SPONSORSHIP_EMP_NO_CLEARED` when a nonblank value was corrected.

### 6. Fix form-segment precedence

Change `apply_sponsorship_event_segments()` to:

1. Use explicit parsed OPEX fields first: CC, DIV, Solution, Agency.
2. Fill only missing form fields from an unambiguous agency mapping.
3. Use requester-home fields only as a last-resort, field-by-field fallback.
4. Flag every fallback field for review.

Remove the current early `continue` after applying agency-derived codes, because it prevents explicit form values from winning.

### 7. Support nested OPEX evidence folders

Change `_find_opex_pdfs()` to use the same logical evidence traversal as `full_evidence_agent_v30.iter_evidence_files()`, or explicitly search the single descriptive child folder.

This makes `_parse_opex_event_segments()`, requester extraction, serial extraction and allocation-table extraction operate on the same evidence set as the LLM.

### 8. Add SIS serial support

```diff
- r"\b(CE|CRM|HF|EP|AATS)-\d+-\d+\b"
+ r"\b(CE|CRM|HF|EP|SIS|AATS)-\d+-\d+\b"
```

### 9. Make SPLIT defensive

In `split_multi_emp()`:

- If `Account == 60307021`, clear Employee No.
- Never split sponsorship lines based on comma-separated Employee No.
- Preserve the already-resolved event GL segments.
- Leave future exact OPEX allocation splitting to a purpose-built routine.

### 10. Tests

Add regression tests covering:

- `enforce_sponsorship_rules()` blanks requester and LLM-provided employee numbers.
- Every final `60307021` row has blank Employee No.
- A late event-overlay sponsorship row is blanked before write.
- Nested OPEX PDFs are discovered.
- Explicit form DIV/Solution/Agency/CC beat requester-home values.
- Only missing form fields use fallback.
- `SIS-15-2026` serial extraction succeeds.
- SPLIT does not create employee-attributed sponsorship rows.
- J26-1029 regression fixtures for SIS, CRM and EP produce blank Employee No while preserving their respective event GL segments.
