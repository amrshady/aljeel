Read-only audit complete. No files were changed.

## Finding

All five rows ultimately reach sponsorship account `60307021`; the drift is not caused by HF/CRM/airport rows missing sponsorship classification entirely.

The failure is in sponsorship evidence linkage and pass ordering:

1. Several `26-NNN` ancillary rows initially bind to an unrelated Personal Contribution folder/employee.
2. The sponsorship segment pass runs before the authoritative OPEX allocation-table pass.
3. Agency `10072` is not globally unique in Manpower: it has CRM, HF, and EP solution variants. The agency-only resolver therefore returns `AGENCY_CODES_INCONSISTENT`.
4. The fallback then uses the row’s provisional requester/employee—sometimes wrong, sometimes absent.
5. The correct allocation employee is recovered afterward, but the segments are not recomputed.

This produces two distinct manifestations of the same broader sequencing/linkage defect.

## Trace

The relevant final-stage order is:

```text
apply_sponsorship_event_segments()
apply_sponsorship_allocations()
inherit_ancillary_event_allocations()
```

See [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6253).

That is backwards for ambiguous agencies: the first function needs the allocation-table employee in order to perform its documented requester-home fallback, but that employee is only established by the second function.

### Evidence-folder selection

`_sponsorship_event_folder_for_row()` trusts any existing evidence folder for an exact non-SIS Invoice Ref No:

```python
if invoice_serial and not invoice_serial.startswith("SIS-"):
    return p
```

See [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1439).

It does not verify that `p`:

- has the same CRM/HF event serial, or
- contains the event’s OPEX form.

The run trace shows the affected hotel/airport rows initially attached to:

```text
raw/0F6C2F9AA
employee 1001008
CC 250010 / DIV 120 / Solution 00000
```

That folder belongs to Waleed Bataweel’s Personal Contribution evidence, not CRM-2026-43/45/46 or HF-2026-31.

Meanwhile, `_row_event_key()` can still recover the correct event from `Invoice Ref No`, and `apply_sponsorship_allocations()` indexes the correct OPEX PDF by that key. See [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:377) and [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2189).

That explains why the final Employee No values are correct even though the segment tuple remains stale.

### Agency lookup ambiguity

`resolve_sponsorship_codes_from_agency()` requires every Manpower row for an agency to have the same CC/DIV/Solution tuple. See [run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:553).

Agency `10072` has at least these variants:

- `160014 / 170 / 10017 / 10072`
- `160014 / 170 / 10050 / 10072`
- `160014 / 170 / 10064 / 10072`

Consequently it returns `AGENCY_CODES_INCONSISTENT`, not a tuple. This is expected and is why the canonical resolution order includes requester-home after agency-mapping.

`apply_sponsorship_event_segments()` then falls back through:

```text
agency-filter mapping → requester home → existing row
```

See [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1686).

The problem is that “requester home” is evaluated before the correct allocation-table employee has replaced the provisional identity.

## Row-by-row explanation

| Row | Event | State during segment pass | Result |
|---|---|---|---|
| 26-1049 | CRM-2026-43 | Correct OPEX form agency unavailable because the unrelated existing folder is trusted; no usable sponsorship requester/home tuple | Existing generic values survive: `999999/000/00000/00000` |
| 26-1051 | HF-2026-31 | Form agency resolves to `10072`, but agency-wide tuple is ambiguous; fallback sees provisional employee `1001008` | Wrong home tuple: `250010/120/00000`, with form agency `10072` |
| 26-1075 | CRM-2026-45 | Same ambiguity and provisional employee | `250010/120/00000/10072` |
| 26-1076 | CRM-2026-46 | Same ambiguity and provisional employee | `250010/120/00000/10072` |
| 26-1082 | CRM-2026-43 | Same ambiguity and provisional employee | `250010/120/00000/10072` |

The later allocation pass correctly finds these split targets:

- CRM-2026-43: `1000640` → `160014/170/10017`
- HF-2026-31: `1000820` → `160014/170/10050`
- CRM-2026-45: `1001762` → `160014/170/10017`
- CRM-2026-46: `1001959` → `160014/170/10017`

But it only replaces allocation/Employee No metadata; it does not rerun the segment resolver.

Therefore:

- The `999999/000` collapse and `250010/120` cases are not identical.
- The first is a missing-form-agency plus missing-requester fallback.
- The other four are an ambiguous agency mapping followed by a wrong-requester fallback.
- They share the same underlying stale evidence/ordering problem.

## Other components

`cost_center_resolver.py` supplies the initial generic `999999/000/00000/00000` tuple when an employee cannot be resolved. It is the source of the stale default visible on 26-1049, but it is not the authoritative sponsorship allocation implementation. See [cost_center_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:598).

`full_evidence_agent_v30.py` collects the selected folder’s messages and PDFs. It does not correct an already misselected folder or construct the final sponsorship tuple. See [full_evidence_agent_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:381).

`split_multi_emp.py` consumes the already-generated sponsorship combination and allocation details. It splits amounts and conserves the line total; it is downstream of this drift and is not its cause.

## Minimal proposed fix

Two small changes in `run_v30.py` restore the deployed Labadi behavior.

1. Validate exact event-folder linkage.

In `_sponsorship_event_folder_for_row()`, replace the unconditional return for non-SIS Invoice Ref values with:

- accept the existing folder only if its canonical event key matches the Invoice Ref and it contains an OPEX form;
- otherwise use `_build_opex_event_pdf_index()` with the Invoice Ref’s canonical key;
- return the indexed event owner folder;
- retain the existing fallback only when no canonical event form exists.

Conceptually:

```diff
- if invoice_serial and not invoice_serial.startswith("SIS-"):
-     return p
+ if invoice_serial and not invoice_serial.startswith("SIS-"):
+     expected_key = _canonical_event_serial(invoice_serial)
+     existing_key = _canonical_event_serial(str(p))
+     if existing_key == expected_key and _find_opex_pdfs(p):
+         return p
+     event_pdfs = _build_opex_event_pdf_index(all_folders).get(expected_key, [])
+     if event_pdfs:
+         return _opex_owner_folder(event_pdfs[0])
```

2. Establish allocation identity before resolving ambiguous agency segments.

Swap the two final passes:

```diff
- apply_sponsorship_event_segments(...)
  apply_sponsorship_allocations(...)
+ apply_sponsorship_event_segments(...)
```

This makes the fallback operate on the OPEX allocation target, not `1001008` or a blank provisional employee.

It should preserve the already-correct rows:

- `4860901746`
- `4860966793/794`
- `4861063587/588`

Their OPEX forms and allocation employees already resolve consistently; recomputing after allocation yields the same CRM/EP tuples.

Tests should specifically cover:

- correct Invoice Ref overriding an unrelated existing evidence folder;
- agency `10072` ambiguity resolved through the allocation-table employee;
- CRM/HF/EP variants yielding `10017`, `10050`, and `10064`;
- the existing correct rows remaining unchanged;
- amount conservation after splitting.

## Location nuance

The EP `10100` versus clerk `20100` difference is related only indirectly. A late hard-coded pass rewrites the Distribution Combination location directly from the allocation employee’s raw Manpower location:

```python
_parts[1] = _loc_map[_emp_no]
```

See [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6583).

It bypasses the earlier documented `10100` Head Office → `20100` GL-location normalization. That is a separate location-normalization bug, not part of the sponsorship CC/DIV/Solution/Agency drift.

[status: done rc=0]
