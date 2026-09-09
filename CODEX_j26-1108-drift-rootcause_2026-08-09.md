# Root-cause report

## Executive conclusion

The four rows were not rejected by the new trip-identity gate, and they were not actually converted to account-level travel rows. All four still have final account `60307021`.

The scorer labels them “pipeline-only travel” because their sponsorship logical keys no longer match truth. The immediate mismatch is the Description prefix:

| Event | Truth/baseline prefix | Regressed prefix |
|---|---|---|
| 26-1001 | `CE-202-26-...` | `CRM-2026-40-...` |
| 26-1004 | `CE-202-26-...` | `HF-2026-29-...` |
| 26-1005 | `CE-202-26-...` | `CRM-2026-40-...` |
| 26-1009 | `CE-202-26-...` | `CRM-2026-42-...` |

Because the scorer removes only the row’s `OPEX Serial` (`CE-202-26`) from the Description, it removes the baseline prefix but cannot remove the new invoice-reference prefix. The four rows consequently miss their sponsorship keys and fall through into travel pairing.

For 26-1001, 26-1004, and 26-1005, there is a second substantive regression: the new ancillary-row branch rebinds the row from the CE-202-26 sponsorship form to its invoice-reference event folder, replacing the two CE allocation employees with the CRM/HF folder’s one employee.

The principal responsible change is therefore the new “allow ticketless ancillary rows through stage 3d when `found_folder` exists” condition—not `trips_match`, `trip_identity_state`, or the employee-master blanking rule.

---

## 1. Row-level trace

Workbook row numbers below refer to the output workbook.

### 26-1001 — Muzun Alzahrani hotel, row 34

Baseline:

- Description: `CE-202-26-MUZUN ... (26-1001)`
- OPEX serial: `CE-202-26`
- Invoice ref: `CRM-2026-40`
- Employees: `1002075,1001986`
- Agency: `10100`
- Account: `60307021`

Regressed:

- Description: `CRM-2026-40-MUZUN ... (26-1001)`
- OPEX serial remains `CE-202-26`
- Employees change to `1000640`
- Agency changes to `10072`
- Account remains `60307021`

New path:

1. `_row_event_key()` chooses Invoice Ref No before the row’s OPEX serial at [run_v30.py:377](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:377), specifically the ordering at lines 388–395. Thus the initial sponsoring-form lookup selects `CRM-2026-40`.
2. `_build_sponsoring_form_folder_index()` indexed that folder from its OPEX form at [run_v30.py:2049](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2049).
3. Main stores it in `_sponsoring_form_folder` at [run_v30.py:5562](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5562).
4. The row has no ten-digit ticket, only `26-1001`. Before groupA, stage 3d returned immediately on `if not ticket_no: continue` (HEAD~1 lines 5676–5677).
5. GroupA changed that to `if not ticket_no and not found_folder: continue` at [run_v30.py:5988](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5988). Because `found_folder=CRM-2026-40`, the row now proceeds.
6. Stage 3d overwrites `_evidence_folder` with CRM-2026-40 at [run_v30.py:6003](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6003) and [run_v30.py:6053](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6053).
7. `apply_sponsorship_allocations()` then uses that existing exact invoice-reference folder through `_sponsorship_event_folder_for_row()` at [run_v30.py:2213](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2213). Exact non-SIS invoice references are treated as authoritative at [run_v30.py:1446](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1446).
8. `_apply_multi_salesman_from_opex()` parses the CRM form and replaces the CE allocation with employee `1000640`; entry point is [run_v30.py:2106](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2106).
9. Final Description prefixing prefers Invoice Ref No over OPEX Serial at [run_v30.py:6621](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6621), producing `CRM-2026-40-...`.

No function returned `None`, and neither trip-identity flag fired. The failure is an affirmative but wrong folder rebind.

### 26-1004 — Dr Jehad Alburaiki hotel, row 37

Baseline:

- Description prefix: `CE-202-26`
- Employees: `1002075,1001986`
- Agency: `10100`

Regressed:

- Description prefix: `HF-2026-29`
- Employee: `1002483`
- Agency: `10072`
- Account still `60307021`

The path is identical to 26-1001:

- `_row_event_key()` selects invoice ref `HF-2026-29`.
- `_sponsoring_form_folder` becomes `OPEX_HF-2026-29`.
- The new [run_v30.py:5988](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5988) condition admits this ticketless hotel row.
- Stage 3d replaces the prior CE evidence binding.
- `apply_sponsorship_allocations()` parses the HF form and emits `1002483`.
- Final prefixing writes `HF-2026-29-...`.

Again, there is no `None` return and no identity-mismatch flag.

### 26-1005 — Dr Muzun registration, row 41

Baseline:

- Prefix: `CE-202-26`
- Employees: `1002075,1001986`
- Agency: `10100`

Regressed:

- Prefix: `CRM-2026-40`
- Employee: `1000640`
- Agency: `10072`
- Account still `60307021`

The same new ticketless-event path applies:

- Invoice ref wins in `_row_event_key()`.
- CRM-2026-40 is stored as `_sponsoring_form_folder`.
- The changed stage-3d condition admits the row despite the absence of a ten-digit ticket.
- CRM evidence replaces CE evidence.
- CRM allocation employee `1000640` replaces the CE allocation pair.

The “registration” wording does not cause the failure. The employee-registration pass requires a manpower name match and otherwise continues at [run_v30.py:5920](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5920). The decisive mutation is later in stage 3d.

### 26-1009 — Rawa/Manal/Atheer hotel, row 56

Baseline and regressed allocation values remain:

- Account `60307021`
- Employees `1002075,1001986`
- OPEX serial `CE-202-26`
- Agency `10100`

The actual regression here is only the logical Description identity:

- Baseline: `CE-202-26-MS RAWA ...`
- Regressed: `CRM-2026-42-MS RAWA ...`

CRM-2026-42 does not contain an `OPEX-*.pdf`, so `_build_sponsoring_form_folder_index()` does not index it under the requirement at [run_v30.py:2059](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2059). Consequently, this row does not undergo the same CRM allocation replacement as the first three.

Its CE allocation survives, but final Description stamping still prefers the populated Invoice Ref No at [run_v30.py:6646](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6646), yielding the mismatching CRM prefix.

One important repository-history qualification: the “prefer Invoice Ref No” prefix code is not part of `git diff HEAD~1`; it exists on both sides of that one-commit comparison. Nevertheless, the frozen baseline artifact contains CE prefixes. Thus the baseline artifact was produced under different effective prefix behavior or was subsequently curated. The observable regression is real, but 26-1009’s prefix-only change cannot be attributed solely to a changed line in the groupA commit.

---

## 2. Responsible changes

### Primary cause: ticketless ancillary sponsorship admission

The direct groupA regression is:

```python
# HEAD~1
if not ticket_no:
    continue

# groupA
if not ticket_no and not found_folder:
    continue
```

Current location: [run_v30.py:5988](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5988).

This causes hotel, registration, and similar `26-NNN` rows to enter an overlay originally designed around ticket-owned travel rows. Worse, `found_folder` is based on `_row_event_key()`, whose first candidate is Invoice Ref No rather than the already-set sponsorship/OPEX identity.

The following line also changed from an unconditional scan to `bool(ticket_no) and ...` at [run_v30.py:5995](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5995), but that is supporting logic rather than the initiating cause.

### Secondary cause: invoice-ref-first event precedence

`_row_event_key()` checks:

1. Invoice Ref No
2. row OPEX serial
3. cascade OPEX serial
4. Description

at [run_v30.py:388](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:388).

That precedence makes CRM/HF the selected form folder even when the row already has authoritative CE-202-26 sponsorship allocation identity.

This ordering predates the immediate groupA commit, but groupA exposed it to the four ticketless rows by widening stage 3d.

### Trip-identity changes: not causal for these four events

`trip_transport_type()`, `trips_match()`, and `trip_identity_state()` are at:

- [run_v30.py:168](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:168)
- [run_v30.py:192](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:192)
- [run_v30.py:201](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:201)

They are not invoked for exact event references such as CRM-2026-40 and HF-2026-29. The identity filtering in `resolve_invoice_ref_folder()` applies only when `ref_no` is a six- or seven-digit employee number, beginning at [run_v30.py:3098](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3098). Event references follow a separate exact/canonical branch.

The output rows also contain neither:

- `EVIDENCE_TRIP_IDENTITY_MISMATCH`
- `EVIDENCE_SAME_EMPLOYEE_MULTIPLE_TRIPS`

Therefore, the suspected route-corridor rejection did not occur here.

### Invoice-reference index changes: not the rejecting mechanism

`build_invoice_ref_folder_index()` did change substantially at [run_v30.py:2970](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2970), but the relevant CRM/HF event-folder matching remains affirmative. The folders were accepted, not rejected.

The problem is that accepted invoice-reference folders were allowed to supersede CE sponsorship identity.

### Employee blank-if-not-in-master: not causal

`blank_jawal_emp_not_in_master()` runs only after sponsorship allocation at [run_v30.py:6253](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6253). All resulting employee numbers here exist in Manpower, and none of the four rows carries `EMP_NOT_IN_MASTER`.

It neither changes account/Description/OPEX serial nor explains the missing sponsorship groups.

---

## 3. Why evaluated truth rows fell from 102 to 94

Yes: the eight-row loss is exactly the four missing sponsorship logical groups multiplied by two truth allocation rows per group.

Each golden group has two truth rows:

- employee `1002075`, 75%
- employee `1001986`, 25%

The scorer builds sponsorship identity from:

```text
OPEX serial + logical Description + Invoice Ref
```

at [score_against_truth.py:318](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:318) and [score_against_truth.py:326](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:326).

Because the regressed Description begins with CRM/HF while `OPEX Serial` remains CE-202-26, `_logical_description()` cannot strip the prefix. The resulting key does not equal truth.

Then:

- The four truth groups are recorded as unmatched truth at [score_against_truth.py:472](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:472).
- Each contributes two truth rows with no pipeline pairing: `4 × 2 = 8`.
- Evaluated count therefore becomes `102 − 8 = 94`.
- The four unmatched pipeline rows are excluded from sponsorship selection and passed into travel pairing by [score_against_truth.py:502](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:502). That is why reports call them pipeline-only “travel,” despite their workbook account being `60307021`.

The integrity changes reconcile exactly:

- N:1 sponsorship groups: `11 → 7`, because four groups cease matching.
- Virtual sponsorship allocations: `16 → 11`:
  - 26-1001, 1004, and 1005 each regress from two CE employees to one CRM/HF employee: `−3`.
  - 26-1009 retains two employees but its entire group no longer enters sponsorship pairing: `−2`.
  - Total: `−5`.

This is not silent row filtering in the loader. It is logical-key orphaning followed by the scorer’s policy of treating nonmatching pipeline rows as travel candidates.

---

## 4. Minimal safe fix directions

1. Restrict the new ticketless stage-3d path.

   A ticketless `26-NNN` row should not be rebound merely because `_sponsoring_form_folder` exists. Require that the row is still unresolved/travel and has no authoritative sponsorship allocation or OPEX serial. In particular, do not overwrite a settled `60307021` row whose OPEX identity is already CE-202-26.

2. Separate invoice reference from sponsorship allocation identity.

   Invoice Ref No can identify the supplier event document without necessarily identifying the accounting allocation form. `_row_event_key()` should not let Invoice Ref No supersede an already-established row/OPEX serial for sponsorship allocation lookup.

3. Make Description prefix consistent with scorer identity.

   For sponsorship rows, prefix with the same canonical identity represented by `OPEX Serial`, or teach the scorer to remove both recognized OPEX and Invoice Ref prefixes. The safer pipeline fix is to keep the Description prefix and OPEX serial internally consistent.

4. Do not change `trips_match()` for this regression.

   Hotel/registration/ground rows already produce `UNKNOWN`, rather than `MISMATCH`, when no route corridor exists at [run_v30.py:208](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:208). Relaxing it would not fix these four event-reference rows.

5. Keep the employee-master rule unchanged.

   It is downstream, additive, and unrelated to this failure.

No files were modified.
