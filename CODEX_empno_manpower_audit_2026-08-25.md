The dominant defect is not a surname-keyed dictionary, first-match-wins fuzzy logic, or the passenger cache. For this batch, the incorrect employee numbers already exist in Jawal’s source `Ref. No.` column. The converter copies that number into `Employee No`; `employee_resolver_v2.py` then accepts it unconditionally at L0, and `run_v30.py` may lock it because it matches the passenger’s name.

No files were changed.

## 1. RATL/CHARLES collapse

All four RATL rows already contain `1002405` in column 7 of `invoice-source.xlsx`. The converter:

- Reads source column 7 as `ref_no`: [convert_jawal_invoice.py:165](/home/clawdbot/.openclaw/workspace/aljeel/scripts/convert_jawal_invoice.py:165), [convert_jawal_invoice.py:176](/home/clawdbot/.openclaw/workspace/aljeel/scripts/convert_jawal_invoice.py:176).
- Extracts the leading numeric value: [convert_jawal_invoice.py:243](/home/clawdbot/.openclaw/workspace/aljeel/scripts/convert_jawal_invoice.py:243).
- Treats it as an employee number if present in Manpower: [convert_jawal_invoice.py:255](/home/clawdbot/.openclaw/workspace/aljeel/scripts/convert_jawal_invoice.py:255).
- Writes it into `Employee No`: [convert_jawal_invoice.py:289](/home/clawdbot/.openclaw/workspace/aljeel/scripts/convert_jawal_invoice.py:289).

The resulting `Spreadsheet-v4-input.xlsx` therefore already has `1002405` on tickets `4861063632`, `4861179591`, `4861179597`, and `4861179598`.

`employee_resolver_v2.py` then short-circuits before name, ticket, or cache matching:

- The cascade explicitly uses “first high-confidence hit wins”: [employee_resolver_v2.py:1364](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:1364).
- Any valid direct `emp_no_raw` is immediately returned as L0: [employee_resolver_v2.py:1397](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:1397).
- L1–L8 are consequently never reached: [employee_resolver_v2.py:1427](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:1427).

The output traces confirm this for all four rows:

```text
L0→direct emp_no_col=1002405
EMP_FROM_REF_NO: invoice Ref. No. emp_no=1002405 trusted
```

`run_v30.py` initializes its employee number directly from that cascade result at [run_v30.py:5589](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5589), and explicitly states that Jawal L0 is trusted at [run_v30.py:5616](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5616).

It then makes the mistake harder to correct: `1002405` belongs to “Charles Salim Ratl”, so the name-verification logic accepts it and applies `VERIFIED_EMP_LOCK`. The verifier requires surname plus a given-name token at [run_v30.py:3264](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3264), and the lock is applied before evidence processing at [run_v30.py:5627](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5627). Later LLM results cannot replace protected `emp_no` or segments: [run_v30.py:5743](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5743).

Thus the exact classification is:

- Not a dictionary overwrite.
- Not fuzzy first-match-wins.
- Not a cache hit.
- It is repeated source `Ref. No.` data, followed by L0 direct-value short-circuiting and a passenger-name-based v30 lock.

The architectural mistake is assuming “passenger whose name matches a Manpower employee” is necessarily the chargeable employee. The clerk’s mappings demonstrate that Jawal’s charge owner can vary by ticket even when the passenger string is identical.

Recommended fix:

- Treat Jawal identity as ticket/leg scoped: key authoritative mappings by ticket number, or by `(ticket, passenger, route/date)`, never passenger name alone.
- Do not grant L0 final authority merely because the leading `Ref. No.` exists in Manpower.
- Validate against ticket-specific approval/form/requester evidence.
- Do not use passenger-name agreement as a final lock when the charge owner may differ from the traveler.
- If authoritative evidence is unavailable or contradictory, leave the row for review instead of locking the passenger’s employee record.

## 2. MAHMOUD, ISMAIEL, BAHKALI, and BENSALEM

These four are also not fuzzy-match errors inside `employee_resolver_v2.py`. Their wrong employee numbers are already present in the source invoice:

| Ticket | Source/L0 employee | Matching Manpower name |
|---|---:|---|
| 4861063638 | 1000450 | Belal Issa Mahmoud |
| 4861129857 | 1001406 | Yasin Salahaldeen Osman Ismaiel |
| 4861129878 | 1002469 | Ariej Ibrahim Bahkali |
| 4861179590 | 1000569 | Fathi Salem Ben Salem |

Those source employee names closely or exactly match the passenger names, but the clerk’s employees—`1002098`, `1000613`, `1001957`, and `1000606`—are different people. This is evidence of the same conceptual error: matching the traveler to Manpower instead of resolving the ticket’s responsible employee.

The cascade traces are all L0, not L4/L5:

```text
L0→direct emp_no_col=...
EMP_FROM_REF_NO: invoice Ref. No. emp_no=... trusted
```

The actual fuzzy layer would iterate all Manpower employees, retain the highest and second-highest scores, reject margins under five points, and require a score of at least 80: [employee_resolver_v2.py:466](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:466), [employee_resolver_v2.py:531](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:531), [employee_resolver_v2.py:542](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:542). None of that executes after L0 succeeds.

The passenger cache is likewise not responsible. It is keyed only by normalized passenger name at [employee_resolver_v2.py:1053](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:1053), but it is consulted only at L8, after L0–L7: [employee_resolver_v2.py:1500](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:1500). Cache enrichment does overwrite one value per normalized name at [employee_resolver_v2.py:1342](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:1342), so it is unsafe for future same-name/multi-owner cases, but it did not cause these batch results.

Recommended fix:

- Separate `passenger_emp_no` from `responsible_emp_no` in the internal model.
- Never populate the latter using passenger-to-Manpower similarity alone.
- Make the cross-batch cache ticket/evidence-context aware, or restrict it to confirmed self-travel identities.
- Record source provenance such as `source_ref`, `ticket_form`, `approval_requester`, and `passenger_name_match`; only the first three should establish the charge owner.

## 3. Blank employees

`ALKHDRAWI/MARYAM` and both `ALGHAMDI/SAUD` rows actually have `1002648` and `1002712` in `invoice-source.xlsx`, respectively. Those employees are absent from the current `Aljeel_Lookups-v2.xlsx` Manpower sheet.

The converter deliberately discards a source number unless `employees.get(emp_no)` succeeds: [convert_jawal_invoice.py:255](/home/clawdbot/.openclaw/workspace/aljeel/scripts/convert_jawal_invoice.py:255), [convert_jawal_invoice.py:289](/home/clawdbot/.openclaw/workspace/aljeel/scripts/convert_jawal_invoice.py:289). Consequently:

- `1002648` becomes blank.
- Both `1002712` occurrences become blank.
- The resolver never receives those original source values as usable L0 employees.
- With no supporting evidence folders in this batch, the cascade ends as `not_resolved`.

This is a master-version/data-availability failure compounded by destructive normalization: the source identity is lost merely because it is absent from today’s Manpower lookup.

For `ALAGHA/AHMED`, `1000028` is present in Manpower, but v30’s missing-evidence handling later blanks employees that are not protected by its verified lock. The hard gate is invoked at [run_v30.py:5635](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5635), and its output writer blanks non-locked employee numbers at [run_v30.py:5077](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5077). That is why the v15 file retains `1000028` while the v30 output is blank.

Recommended fix:

- Preserve the raw source employee number in a separate field even when absent from Manpower.
- Mark it `EMP_NOT_IN_CURRENT_MASTER`; do not silently turn it into no identity.
- Use the master version effective for the invoice date, or maintain old/new employee-number aliases.
- Do not let “missing evidence folder” erase a valid source identity; it should blank unsupported allocation segments, not immutable invoice facts.
- Once `1002648`/`1002712` are resolved against the correct master, re-derive account and home segments. That explains the clerk’s changes from `21070229` to `60301003` and real cost centers.

## 4. Manpower Allocation Status

Confirmed: the output column is copied directly from the resolved employee’s Manpower `sol_flag`.

- `Employee.sol_flag` is populated from Manpower column 15: [cost_center_resolver.py:204](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:204).
- The resolved employee passes that flag through: [cost_center_resolver.py:587](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:587).
- An unresolved employee is explicitly assigned `"Need to allocate"`: [cost_center_resolver.py:598](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:598).
- The spreadsheet writer emits `r.sol_flag` directly into `Manpower Allocation Status`: [process_batch.py:2265](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:2265).

The cited wrong employees `1002405`, `1000450`, `1001406`, `1002469`, `1000569`, and `1000430` are all marked `"Need to allocate"` in the current Manpower sheet. The clerk replacements `1002098`, `1002096`, `1002391`, `1000613`, `1001957`, and `1000606` are `"Can Be used"`.

Therefore fixing employee identity flips most of these rows without a separate status rule change. Blank/not-in-master rows also default to `"Need to allocate"`, explaining much of the 20-versus-2 difference.

One caveat: the clerk reportedly leaves both children of `4861224651` as `"Need to allocate"`, although the current master marks `1001687` and `1001422` as `"Can Be used"`. That suggests either the clerk intentionally preserved the parent status or used a different master/version. The desired split-status behavior needs an explicit business rule.

## 5. Missing multi-employee split

`split_multi_emp.py` does not discover multiple employees. It only splits when:

- A sponsorship row has valid serialized OPEX allocations, or
- The existing `Employee No` cell contains comma-separated employee numbers.

That gate is at [split_multi_emp.py:340](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:340) through [split_multi_emp.py:376](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:376).

Ticket `4861224651` reaches it as a normal travel row with the single value `1000430`. Therefore line 370 immediately continues without splitting. The splitter has no ticket-specific evidence or logic capable of discovering `1001687,1001422`.

When multiple employees are supplied, equal splitting already exists at [split_multi_emp.py:159](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:159) and [split_multi_emp.py:375](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:375), so `5830 / 2 = 2915` would work correctly.

Also, `run_v30.py` does not itself call this splitter. The worker invokes it as a separate Stage 5 subprocess at [run_worker_v2.py:645](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_worker_v2.py:645).

Recommended fix:

- Resolve and serialize multi-employee ownership before Stage 5.
- Use a generic allocation structure for all rows, not only sponsorship/OPEX rows.
- Stamp `Employee No` as `1001687,1001422`, or add a normal-travel allocation-details field, before calling the splitter.
- Preserve explicit clerk/evidence ratios when available; otherwise use the existing equal split.

## 6. Zero-amount row

The zero row is emitted because there is no suppression rule:

- `_safe_float()` converts blank amounts to `0.0`: [convert_jawal_invoice.py:94](/home/clawdbot/.openclaw/workspace/aljeel/scripts/convert_jawal_invoice.py:94).
- `extract_invoice_lines()` appends every sequential invoice row without testing the amount: [convert_jawal_invoice.py:165](/home/clawdbot/.openclaw/workspace/aljeel/scripts/convert_jawal_invoice.py:165).
- The splitter only checks whether the row contains any data; it never deletes zero-value rows: [split_multi_emp.py:334](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:334).
- `run_v30.py` even treats zero amounts as possible reissue rows and inherits donor allocation when possible, rather than suppressing them: [run_v30.py:3777](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3777).

Recommended fix:

- Suppress lines whose posting amount is zero within currency tolerance before row-count and line-total calculation.
- Preserve them separately in audit diagnostics if traceability is required.
- If zero rows can represent reissues, distinguish “informational zero/reissue” from “posting line”; only the latter should reach the AP output.

Overall, the central correction is to stop equating traveler identity with charge-owner identity. This batch requires ticket-scoped ownership resolution, preservation of source employee numbers even when the current master lacks them, and explicit pre-split allocation metadata.
