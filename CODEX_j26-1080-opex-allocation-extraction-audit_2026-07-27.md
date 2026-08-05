## Root cause

CRM-2026-39 was not lost because the PDF was unreadable or because the allocation-table parser cannot handle three employees. The current parser reads the real PDF correctly and returns all three rows:

- `1002317 / Yazan Alkhatib / 35,000.00`
- `1001959 / Zyade Alsayed / 35,000.00`
- `1002119 / Naser Balbisi / 35,000.00`

The failure is an evidence-association/account-gating defect:

1. Initial ticket-content discovery associated all four ticket lines with the overly broad folder `raw/01-07jul`, because the invoice PDF at that level contains those ticket numbers.
2. Exact invoice-ref resolution could correctly resolve `CRM-2026-39` to the nested folder, but the correction is only applied when the initial folder is blank.
3. Because the broad folder was nonblank, the nested OPEX folder was never supplied to classification.
4. Call 1 classified the rows as `employee` based only on the passenger-name format.
5. Call 2 actually returned sponsorship for rows 4–5, but the “employee can never be sponsorship” overlay changed `60307021` back to travel account `60301003`.
6. The late authoritative allocation pass only processes rows already carrying account `60307021`, so it skipped all four CRM-2026-39 lines despite having successfully indexed the nested PDF.

This is a circular gate: the form is needed to establish sponsorship, but the form-allocation pass is only allowed to run after sponsorship has already been established.

## Evidence from the actual batch

The generated workbook has:

- Rows 4–5: `Invoice Ref No = CRM-2026-39`, account `60301003`, allocation blank.
- Rows 6 and 9: displayed OPEX serial `CRM-2026-39`, but invoice refs `ce-20-2026` and `SIS-14-2026`; account remains `60301003`.
- All four have blank Employee No and OPEX Allocation Details.

The run trace confirms rows 4–5:

- Call 1 used `/raw/01-07jul`, not the CRM event folder.
- Call 1 labeled them `employee`.
- Call 2 returned account `60307021`.
- The final result was changed to `60301003`.

See [step-trace-v30.jsonl](/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-1080/output/step-trace-v30.jsonl:1) and line 4 of the same file.

A direct read-only execution against the real PDF produced all three exact allocation tuples. Its embedded text is nonempty and well structured, so OCR failure and table-shape mismatch are ruled out.

## End-to-end code path

### 1. Evidence and OPEX-form discovery

General full-evidence discovery is shallow per logical folder:

- `iter_evidence_files()` inspects direct children, with one special single-child descent: [full_evidence_agent_v30.py:239](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:239).
- `collect_evidence()` sends direct `.msg` bodies and PDF text to the LLM: [full_evidence_agent_v30.py:364](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:364).
- Ticket-content PDF matching may select the broad folder containing the invoice: [full_evidence_agent_v30.py:308](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:308).

`run_v30.py` augments this with a recursive directory scan:

- Every directory directly containing evidence is added: [run_v30.py:4716](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4716), especially [run_v30.py:4740](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4740).
- OPEX PDFs within a selected folder are found recursively: [run_v30.py:771](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:771).
- PDFs are indexed by canonical event serial: [run_v30.py:273](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:273) and [run_v30.py:288](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:288).
- `CRM-2026-39` normalizes to `CRM39`: [run_v30.py:242](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:242).

Against the live tree, the index contains the exact nested PDF under key `CRM39`.

The invoice-ref index also correctly resolves `CRM-2026-39` to:

`.../CRM-2026-39/OPEX_CSP_CRM-2026-39`

via [run_v30.py:2732](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2732) and [run_v30.py:2766](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2766).

### 2. Precise association failure

`process_row_v25()` obtains both the initial classifier folder and the exact invoice-ref folder at [run_v30.py:2133](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2133) and [run_v30.py:2142](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2142).

The defect is the condition at [run_v30.py:2148](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2148):

```python
if ref_folder and ref_status != "REF_FUZZY" and not classify_folder_str:
```

Because `classify_folder_str` was the broad `/raw/01-07jul` folder, the exact CRM-2026-39 folder could not replace it.

The shared-OPEX fallback is similarly limited to an empty classifier folder at [run_v30.py:2220](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2220).

### 3. Account reversal

The generic classifier derives row type from the evidence it was given at [run_v16.py:439](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:439) and [run_v16.py:472](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:472).

When Call 1 says `employee`, `apply_overlays_v16()` forcibly replaces a Call-2 sponsorship result with a travel account:

- [run_v16.py:831](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:831)
- Exact reassignment: [run_v16.py:835](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:835)

That explains the trace showing Call 2=`60307021`, final=`60301003`.

### 4. Allocation-table extraction

The active v30 extractor is not `opex_pdf_parser.py`. It is:

- Deterministic PDF text extraction: [run_v30.py:1847](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1847).
- It searches for `Event Allocation Details` / `Amount to Allocate`: [run_v30.py:1863](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1863).
- It loops over every employee line and appends every row with its following amount: [run_v30.py:1873](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1873).
- OCR fallback also accumulates multiple unique employees: [run_v30.py:1776](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1776).
- A final LLM fallback explicitly requests all salesmen: [run_v30.py:714](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:714), especially [run_v30.py:737](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:737).

Therefore, the current active allocation extractor does support multiple employees and does not reduce CRM-2026-39 to the first employee.

There are older/simpler single-employee paths that must not be mistaken for the authoritative table parser:

- `_extract_opex_emp_no()` returns the first regex match: [run_v30.py:693](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:693).
- `process_batch.py` shared-OPEX resolution returns the first resolved form/requester employee: [process_batch.py:389](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:389), with immediate returns at [process_batch.py:423](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:423) and [process_batch.py:475](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:475).
- Standalone PDF discovery there is nonrecursive: [process_batch.py:469](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:469).
- `opex_pdf_parser.py` asks for header-level fields and participants but has no allocation-row schema: [opex_pdf_parser.py:113](/home/clawdbot/.openclaw/workspace/aljeel/scripts/opex_pdf_parser.py:113).
- It parses only the first successful attached PDF: [opex_pdf_parser.py:220](/home/clawdbot/.openclaw/workspace/aljeel/scripts/opex_pdf_parser.py:220).

Those paths can collapse to a requester/first employee, but the late v30 table pass is intended to supersede them.

### 5. Mapping into Oracle output

The late allocation pass:

- Runs after account overlays: [run_v30.py:2018](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2018).
- Critically skips every non-`60307021` row: [run_v30.py:2030](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2030).
- Associates rows through normalized event keys and the event-PDF index: [run_v30.py:2042](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2042).
- Joins all allocation employee numbers into Employee No: [run_v30.py:1987](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1987), specifically [run_v30.py:1992](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1992).
- Writes the exact allocation tuple JSON to OPEX Allocation Details: [run_v30.py:1644](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1644).
- Is invoked immediately before workbook generation: [run_v30.py:5658](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5658), with allocation details stamped at [run_v30.py:5675](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5675).

`split_multi_emp.py` then:

- Parses OPEX Allocation Details for sponsorship rows: [split_multi_emp.py:340](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:340).
- Requires the Employee No list to match the tuple list: [split_multi_emp.py:346](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:346).
- Creates proportional amounts from the form amounts: [split_multi_emp.py:363](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:363).
- Preserves event-level segments during expansion: [split_multi_emp.py:384](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:384).

## Caches

No stale OPEX parse cache caused this failure.

- The real PDF SHA-256 is `2cb80a2276b0a88611fc4e301e0fa04e4e6a72a48ffbe7aa823bc9ce4938795c`.
- There is no corresponding entry under `extracted/opex-pdf-cache`.
- The only current OPEX cache entry has SHA `556641...` and belongs to an unrelated PCS/AATS form.
- `full-evidence-agent-cache` contains no CRM-2026-39/ticket entry.
- The trace explicitly reports `from_cache: false`.
- `batches/jawal-J26-1080/ai-poc-cache` is the upstream invoice extraction cache; it contains the invoice rows and refs but not OPEX allocation parsing.

For a regression rerun, `--no-cache` is still advisable, but no existing allocation cache must be deleted to expose this defect. The in-memory `_OPEX_EVENT_INDEX_CACHE` and allocation cache at [run_v30.py:285](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:285) and [run_v30.py:2028](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2028) disappear when the process exits.

## Minimal low-risk fixes

1. Exact-ref folder precedence

Change the condition at `run_v30.py:2148` so an exact `REF_FOLDER` may replace a nonempty classifier folder when that current folder does not itself own the exact event ref/OPEX form. Keep `REF_FUZZY` non-authoritative.

In practical terms:

- Exact `CRM-2026-39` folder beats broad `/raw/01-07jul`.
- Do not blindly replace a valid exact ticket/event folder.
- Collect evidence recursively through `_find_opex_pdfs()` or use the already indexed PDF list so one additional nested subfolder is harmless.

2. Remove the circular account gate

Before the skip at `run_v30.py:2031`, compute the row’s canonical event key. If an exact event-key OPEX PDF exists, parse its allocation table and treat the form as authoritative sponsorship evidence. Set account `60307021` and proceed with the existing allocation logic.

This is safer than broadly weakening the “employee cannot be sponsorship” overlay: only rows with an exact serial-linked Sponsoring Payment Form are promoted.

Alternatively, pass the exact event form into Call 1 before `apply_overlays_v16()`, so it correctly classifies the row as sponsorship. A defensive late-pass promotion is still recommended because it prevents future classifier errors from suppressing an authoritative form.

3. Preserve all allocation rows

Continue using `_extract_sponsorship_allocations_from_opex_pdf()` as the authoritative source. Do not source Employee No from `_extract_opex_emp_no()`, `process_batch._find_sponsoring_employee_from_shared_opex()`, or the requester fields returned by `opex_pdf_parser.py`.

For CRM-2026-39, the parent v30 row should carry:

```text
Employee No = 1002317,1001959,1002119
OPEX Allocation Details =
[
  {"emp_no":"1002317","name":"Yazan Alkhatib","amount":"35,000.00"},
  {"emp_no":"1001959","name":"Zyade Alsayed","amount":"35,000.00"},
  {"emp_no":"1002119","name":"Naser Balbisi","amount":"35,000.00"}
]
```

The split stage should then emit one segment row per employee, allocate each ticket-line amount in the documented 1:1:1 ratio, preserve the header/event Division/Agency/Solution mapping, and derive employee-dependent master segments only where policy requires them.

4. Serial variants on sibling rows

Rows 6 and 9 cannot rely on their invoice refs because those refs identify different events. Their already-established OPEX serial `CRM-2026-39` should be allowed to drive the exact event index. The order should be:

- authoritative row/event OPEX serial;
- exact invoice ref if consistent;
- participant/ticket association;
- otherwise review on conflict.

Do not silently map `ce-20-2026` or `SIS-14-2026` to CRM39 merely because they are nearby.

## Tests and regression risk

There is substantial multi-employee coverage:

- Nested OPEX discovery: [test_sponsor_allocation_rules.py:38](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:38).
- Three-employee event propagation: [test_sponsor_allocation_rules.py:68](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:68).
- Real three-employee PDF fixtures: [test_sponsor_allocation_rules.py:97](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:97) and [test_sponsor_allocation_rules.py:121](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:121).
- Scanned multi-employee forms: [test_sponsor_allocation_rules.py:131](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:131).
- Split allocation conservation and segment preservation: [test_sponsor_allocation_rules.py:330](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:330).

All 27 tests in that file currently pass.

The missing regression case is precisely this failure mode: a row initially assigned to a broad nonempty folder, with an exact event-ref folder one or two levels deeper, and account initially/finally reverted to travel before the late allocation pass. Add a CRM-2026-39-style test asserting that exact indexed form evidence overrides the broad folder and promotes the row to sponsorship before allocation.

Regression risk is low if promotion requires an exact canonical event-key match and an actual parsed Sponsoring Payment Form. It becomes high if the fix merely treats any nearby OPEX PDF or mismatched invoice ref as authoritative.
