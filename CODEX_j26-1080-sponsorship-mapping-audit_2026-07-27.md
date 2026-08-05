## Findings

The two defects are confirmed. They share one underlying cause: the current v30 implementation deliberately reversed the older “sponsorship Employee No must be blank” policy and now uses the output `emp_no` field as temporary/requester/allocation metadata. A later location patch then relies on that populated output field and a hard-coded, stale master workbook.

No files were modified.

### Defect 1 — sponsorship requester written to Employee No

There are several independent write paths.

1. The sponsorship master shortcut resolves the requester and returns it as the row’s `emp_no`:

- [`scripts/run_v16.py:617`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:617) defines `resolve_sponsorship_from_master()`.
- [`scripts/run_v16.py:619`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:619) looks up `requesting_emp_no` in Manpower.
- [`scripts/run_v16.py:625`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:625) and [`scripts/run_v16.py:631`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:631) explicitly return `"emp_no": requesting_emp_no`.
- CC/DIV/solution/agency are copied from the requester at [`scripts/run_v16.py:633`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:633)-[`636`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:636).

`run_v30.py` invokes this shortcut at:

- [`scripts/run_v30.py:2340`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2340)-[`2355`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2355).

It correctly retains the requester separately in `_sponsorship_requesting_emp_no` at line 2355, but it does not remove the requester from the public `emp_no` field.

2. The supposed sponsorship blanking overlay no longer blanks anything:

- [`scripts/run_v16.py:809`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:809) still labels the section “enforce sponsorship blank emp_no”.
- [`scripts/run_v16.py:811`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:811)-[`813`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:813) defines `enforce_sponsorship_rules()` as an unconditional no-op: `return final`.

That function is called after both the shortcut and the LLM path at [`scripts/run_v30.py:2351`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2351) and [`scripts/run_v30.py:2438`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2438)-[`2439`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2439), but it cannot enforce the locked rule.

3. A later v30 pass explicitly replaces the requester with OPEX allocation-table employee numbers:

- [`scripts/run_v30.py:1938`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1938) defines `_apply_multi_salesman_from_opex()`.
- [`scripts/run_v30.py:1987`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1987)-[`1989`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1989) stores private allocation metadata.
- [`scripts/run_v30.py:1992`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1992)-[`1994`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1994) then intentionally writes those employee numbers into `final["emp_no"]`.
- The late authoritative pass applies this to every settled `60307021` row at [`scripts/run_v30.py:2018`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2018)-[`2066`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2066).
- It runs immediately before workbook generation at [`scripts/run_v30.py:5658`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5658)-[`5660`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5660).

The writer persists `emp_no` at [`scripts/run_hybrid_v15_12.py:200`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_hybrid_v15_12.py:200)-[`207`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_hybrid_v15_12.py:207) and [`scripts/run_hybrid_v15_12.py:230`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_hybrid_v15_12.py:230)-[`234`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_hybrid_v15_12.py:234).

4. Stage 1 has the same reversed policy:

- Requester discovery from form/message/PDF is implemented in [`scripts/process_batch.py:389`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:389)-[`511`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:511).
- `_apply_shared_opex_sponsor_segments()` copies requester location and other segments at [`scripts/process_batch.py:514`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:514)-[`528`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:528).
- It explicitly writes the requester into `r.emp_no` at [`scripts/process_batch.py:529`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:529)-[`533`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:533).
- The ordinary sponsorship-form fallback similarly writes `resolved.emp_no = req_emp_int` at [`scripts/process_batch.py:1385`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1385)-[`1407`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1407).
- The workbook writer states that the old blank rule was reversed and always writes `r.emp_no` at [`scripts/process_batch.py:2130`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:2130)-[`2137`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:2137).

Thus this is not an ordering accident. The blanking overlay was deliberately converted into a no-op, and both Stage 1 and v30 now intentionally populate the column.

The full-evidence prompt also encodes the conflicting behavior at [`scripts/full_evidence_agent_v30.py:564`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:564)-[`571`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:571): it asks the model to output OPEX allocation-table employee numbers. Private allocation metadata is reasonable, but it should not be represented by the Oracle Employee No field under the locked rule.

## Defect 2 — HF Distribution Combination location

The batch artifact confirms:

- Rows 74 and 77 have `Location` column = `40100`.
- Their Distribution Combination segment 2 is `10100`.
- Employee No is `1002483`.

The inconsistency is introduced after the normal row/combo writer.

1. During sponsorship segment resolution, requester home location is available:

- `_manpower_home_segments()` prioritizes `_sponsorship_requesting_emp_no` and reads master location at [`scripts/run_v30.py:1169`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1169)-[`1183`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1183).

2. But the event-segment overlay only uses requester location when the existing row location is blank:

- [`scripts/run_v30.py:1569`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1569)-[`1573`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1573).

For HF, the row already contained `40100`, so that pass preserved it. The normal writer therefore initially created a combo using `40100` at [`scripts/run_hybrid_v15_12.py:235`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_hybrid_v15_12.py:235)-[`243`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_hybrid_v15_12.py:243).

3. A late XLSX-only patch then overwrites combo segment 2:

- [`scripts/run_v30.py:5973`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5973)-[`6010`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6010).
- It hard-codes `qc/master-data/Aljeel_Lookups-v2.xlsx` at line 5980.
- It assumes employee number is physical column 16 and combo is column 14 at lines 5992-5993.
- If Employee No is in that hard-coded master, it replaces only combo part 2 with the master location at lines 5997-6006.
- It does not update the separate `Location` column.

In the hard-coded `Aljeel_Lookups-v2.xlsx`, employee `1002483` has location `10100`, so the late patch changes the combo from `40100` to `10100`. Employee `1002484` is `40100`, explaining why EP remains `40100`; employees `1001762` and `1000640` are `10100`, explaining the CRM combo values.

There is also a master-data discrepancy: the repository’s current [`qc/master-data/master-data-003.xlsx`](/home/clawdbot/.openclaw/workspace/aljeel/qc/master-data/master-data-003.xlsx) also reads `1002483` as `10100`, not `40100`. If another supplied Master-data-003 version says `40100`, it is not the file v30 loads. The pipeline’s active master is fixed by [`scripts/full_evidence_agent_v30.py:47`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:47) and loaded at [`scripts/full_evidence_agent_v30.py:105`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:105)-[`138`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:138).

## Minimal low-risk fixes

1. Employee No:

- Keep requester/allocation employees only in private metadata such as `_sponsorship_requesting_emp_no` and `_sponsorship_allocations`.
- After all sponsorship segment and allocation derivation is complete, but before `write_v15_12_xlsx()`, set `row["emp_no"] = ""` for every settled `account == "60307021"`.
- Restore `enforce_sponsorship_rules()` as a defensive blanking guard as well.
- Apply the equivalent final guard in `process_batch.py` before its writer.
- Do not delete `_sponsorship_allocations`; it is still needed for audit details and any split calculations.

2. Location:

- Eliminate or constrain the XLSX-only location rewrite at lines 5973-6010.
- Resolve sponsorship location in `hybrid_rows` before blanking public `emp_no`, using `_sponsorship_requesting_emp_no` to access the same canonical Manpower record used for CC/DIV/agency.
- Set both `row["location"]` and the rebuilt Distribution Combination from that one value.
- Do not derive sponsorship location from the public Employee No cell, positional columns, or a separately hard-coded workbook.
- First reconcile which master is authoritative for `1002483`: the checked repository masters currently say `10100`, contrary to the stated `40100`.

## Regression coverage and risk

The current golden/QC suite does not cover these contracts adequately.

- [`qc/jawal_golden_check.py:16`](/home/clawdbot/.openclaw/workspace/aljeel/qc/jawal_golden_check.py:16)-[`22`](/home/clawdbot/.openclaw/workspace/aljeel/qc/jawal_golden_check.py:22) explicitly says it does not rerun live pipeline code.
- It compares aggregate counts only, not row-level Employee No or location/combo agreement.
- Its expected snapshot actually has `blank_emp_no: 0` at [`qc/jawal_golden_expected.json`](/home/clawdbot/.openclaw/workspace/aljeel/qc/jawal_golden_expected.json), reflecting the reversed policy.
- [`qc/tests/test_derived_fields_sync.py:49`](/home/clawdbot/.openclaw/workspace/aljeel/qc/tests/test_derived_fields_sync.py:49)-[`58`](/home/clawdbot/.openclaw/workspace/aljeel/qc/tests/test_derived_fields_sync.py:58) tests construction of a sponsorship combo, but not requester-derived location or blank Employee No.
- The QC gate merely emits a soft flag for a populated sponsorship employee at [`qc/qc_gates.py:156`](/home/clawdbot/.openclaw/workspace/aljeel/qc/qc_gates.py:156)-[`158`](/home/clawdbot/.openclaw/workspace/aljeel/qc/qc_gates.py:158); it does not enforce blankness.

The proposed changes are low risk for accounting segments if private requester/allocation metadata is preserved. The main regression risk is code that currently abuses public `emp_no` for later location or allocation processing—especially the late location rewrite. Therefore the requester-derived location must be finalized before blanking, and new row-level tests should assert:

- `account == 60307021` implies output Employee No is blank.
- Requester metadata remains available internally.
- Location column equals combo segment 2.
- A requester with location `40100` produces `40100` in both places.
- CC/DIV/solution/agency remain unchanged.
