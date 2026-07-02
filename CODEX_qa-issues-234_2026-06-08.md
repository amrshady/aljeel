**Q2a — GL Routing**

Row anchored by ticket `6905428854` is workbook row 13 / `sl_nos: [10]`.

Values:
- Description: `AHMED/AHMED MOHAMED MR - RUH HAS (6905428854)`
- Output `Employee No`: blank / `None`
- Account: `60301003`
- Combo: `03-10100-60301003-250010-120-00000-10206-00000-00-000000`
- Resolution Layer: `L4`
- Resolution Trace: `L4→gds_fuzzy score=100 (2nd=100) search='AHMED MOHAMED AHMED' → emp=1000087 (Waseem Mohammad Ahmad Ahmad)`
- Agent Account Rule: `L8_sm_travel: DIV=120`
- Agent Method: `cascade`

It was not routed through `_needs_classification()` / v16 LLM. `step-trace-v30.jsonl` has no `row_idx` 10 and no occurrence of `6905428854`; therefore Call 1 and Call 2 did not run for this row.

Relevant code:
- L4 fuzzy match is in [employee_resolver_v2.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:441): lines 441-552 normalize GDS name and return `layer="L4"` with trace `L4→gds_fuzzy ...`.
- Sponsorship only fires on OPEX/event/ground-service patterns: [cost_center_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:394) lines 394-397 and external fallback lines 426-433.
- Non-sponsorship not-in-master fallback is `60301003`: line 433 returns `("60301003", "L9_external_travel: not in Manpower, no OPEX ref")`.

Verdict: `60301003` came from cascade employee travel after an unsafe L4 fuzzy match to `1000087`; no LLM calls ran, and no sponsorship pattern/OPEX ref was present.

**Q2b — Who Is AHMED/AHMED MOHAMED MR?**

I found no exact Manpower name sequence variant for `AHMED AHMED MOHAMED`, `AHMED MOHAMED AHMED`, or `MOHAMED AHMED AHMED`.

Closest relevant candidates include:
- `1000246` — `Ahmed Mohammed Ahmed Aljahdari`, division `Technical Services`, cost center `250010`, sol_flag `Can Be used`
- `1000584` — `Ahmed Mohamed Mohamed Elsawy`, division `IVD Solutions`, cost center `160012`, sol_flag `Can Be used`
- Pipeline matched instead to `1000087` — `Waseem Mohammad Ahmad Ahmad` by L4 fuzzy, per output trace.

Verdict: no exact AHMED/AHMED MOHAMED employee found; pipeline’s `1000087` match is a fuzzy false positive.

**Q2c — Evidence Folder Check**

Actual `/mnt/aljeel_ap_kb/current/J26-788/02may/` contents:

- `6905428852/`
  - `MR YOUSEF ALANAZI-7DR3MG.pdf`
  - `Re_ Approved_ Personal Contribution Approval Requested for Yousef Aeiad Alanazi (1001202) on 2026-04-30 by Yousef Aeiad Alanazi.msg`
- `6905428853/`
  - `MR AHMED ALEM-7DVF6G.pdf`
  - `Re_ Approved_ Personal Contribution Approval Requested for Ahmed Hani Alem (1001811) on 2026-04-30 by Ahmed Hani Alem.msg`
- `CRM-2026-27 Approvals/`
  - `MR AHMED MOHAMED AHMED-7GAD2O.pdf`
  - `OPEX-CRM-2026-27-J-2026-83.pdf`
  - `Re_ CRM-2026-27 Approvals.msg`

No folder or file containing `6905428854` exists under `/mnt/aljeel_ap_kb/current/J26-788`.

Verdict: ticket `6905428854` has no evidence folder; only nearby `6905428852` and `6905428853` exist under `02may`.

**Q2d — QC Catch Accuracy**

The pipeline catch is:

```json
{
  "category": "NO_APPROVAL",
  "severity": "MEDIUM",
  "ticket_no": "6905428854",
  "passenger": "AHMED/AHMED MOHAMED MR",
  "account": "60301003",
  "value_at_risk_sar": 2000.0,
  "sl_nos": [10],
  "approval_evidence": "NO_APPROVAL_EVIDENCE_FOUND"
}
```

Given the folder is absent, this should be `NO_FOLDER(HIGH)` or equivalent higher-priority missing-folder catch, not `NO_APPROVAL(MEDIUM)`.

Why it was not raised:
- `process_batch.py` only consumes catch categories; it does not compute folder existence. It sets `Evidence Folder Status = "MISSING"` only if `"NO_FOLDER"` is already in flags/catches: [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1697) lines 1697-1709.
- The active within-batch QC producer has `NO_APPROVAL` logic but no active `NO_FOLDER` producer. `_no_approval()` simply calls `has_approval()` and emits `NO_APPROVAL` when no approval source is found: [qc_catches_within_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/qc_catches_within_batch.py:347) lines 347-384.
- `has_approval()` searches `.msg` files by ticket; if none are found, it returns `False, "NO_APPROVAL_EVIDENCE_FOUND"`: [qc_catches_within_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/qc_catches_within_batch.py:292) lines 292-344.

Verdict: QC mislabeled a missing folder as missing approval because the active catch path does not generate `NO_FOLDER`.

**Q3a — Master Lookup**

`1000259`:
- Name: `Mohamed Ahmed Abdalla Fageir`
- Division code/name: `190` / `S&M`
- Agency code/name: `10200` / `S&M`
- Cost center: `140020` / `Operation`
- sol_flag: `Can Be used`

`1000575`:
- Name: `Mbwana Hamisi Konodo`
- Division code/name: `888` / `G&A`
- Agency code/name: `88888` / `G&A`
- Cost center: `130010` / `Finance`
- sol_flag: `Can Be used`

`1000575` is the Manpower match for `MBWANA HAMISI`, but the spelling is `Konodo`, while ticket passenger/PDF uses `KONDO`.

Verdict: `1000575` is the name match; `1000259` is `Mohamed Ahmed Abdalla Fageir` and is not KONDO/MBWANA.

**Q3b — Name Match Trace**

The output row for ticket `6905569429` shows:
- `Resolution Layer`: `L0`
- `Resolution Trace`: `L0→direct emp_no_col=1000259`
- `Form Emp No`: `1000575`
- `Discrepancy Detail`: `emp_no: form=1000575 / manpower=1000259`
- `Agent Emp Match Source`: `form_disagrees`
- `Agent Method`: `llm_agent`

So the initial pipeline match to `1000259` was not fuzzy or LLM; it was exact/direct from the input employee number column. Relevant code: [employee_resolver_v2.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:1394) lines 1394-1400 return `layer="L0"` for direct `emp_no_raw`.

The final output `1000575` came from the form/LLM evidence path, not the initial cascade.

Verdict: `1000259` was direct input L0; `1000575` came from evidence/form resolution.

**Q3c — Step Trace For Row 69**

Trace entry is `row_idx: 68` for the same row/ticket `6905569429`.

Call 1:
- `row_type`: `unclear`
- `employee_no_in_doc`: `""`
- `requesting_emp_no`: `""`
- Error: `HTTPError: HTTP Error 503: Service Unavailable`
- Evidence folder: `.../raw/06may/6905569429`
- Evidence files include `Fw_ Action Required_ Personal Contribution Approval Requested for Mbwana Hamisi Konodo (1000575)...msg`

Call 2:
- `emp_no`: `1000575`
- `account`: `21070229`
- `cost_center`: `130010`
- `agency`: `88888`
- Reasoning: email subject indicates Personal Contribution Approval for employee `1000575`.

Final:
- `emp_no`: `1000575`
- `account`: `21070229`
- `cost_center`: `130010`
- `div`: `888`
- `agency`: `88888`

Verdict: `1000575` was returned by Call 2 from evidence, not derived from the original input `emp_no`.

**Q3d — Evidence Folder**

Folder exists:
`/mnt/aljeel_ap_kb/current/J26-788/06may/6905569429`

Files:
- `Fw_ Action Required_ Personal Contribution Approval Requested for Mbwana Hamisi Konodo (1000575) on 2026-05-05 by Mbwana Hamisi Konodo.msg`
- `MR MBWANA HAMISI KONDO-8SYHO6.pdf`
- `RE_  Passport kondo.msg`

Yes, there is an approval `.msg` referencing employee number `1000575`.

Verdict: evidence supports `1000575`.

**Q3e — Verdict**

`1000575` is more likely correct.

Evidence for `1000575`:
- Manpower name: `Mbwana Hamisi Konodo`
- Approval email subject: `Mbwana Hamisi Konodo (1000575)`
- Call 2 returned `emp_no=1000575`, `account=21070229`, `cost_center=130010`
- Output discrepancy explicitly says `form=1000575 / manpower=1000259`

Evidence for `1000259`:
- Only the input/direct L0 employee number: `L0→direct emp_no_col=1000259`
- Manpower name for `1000259` is unrelated: `Mohamed Ahmed Abdalla Fageir`

Verdict: `1000259` is the likely stale/wrong input; `1000575` is the evidence-backed employee.

**Q4a — QC Catch Code**

In `process_batch.py`, `NO_FOLDER` does not fire independently. It is only read if already present in line flags/catches:

- [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1692) lines 1692-1709 merge catch categories and set statuses.
- `if "NO_FOLDER" in all_line_flag_codes: is_no_folder = True`
- `if "NO_APPROVAL" in all_line_flag_codes: is_no_approval = True`
- Then `Evidence Folder Status = "MISSING" if is_no_folder else "OK"`.

There is no ordering bug in this status block; `NO_FOLDER` is checked before `NO_APPROVAL`. The issue is upstream: no `NO_FOLDER` catch was generated.

Verdict: not an ordering issue; it is missing `NO_FOLDER` detection upstream.

**Q4b — Ticket Number Check**

All folder names under `/mnt/aljeel_ap_kb/current/J26-788/02may/`:
- `6905428852`
- `6905428853`
- `CRM-2026-27 Approvals`

No folder name contains `6905428854`. Close variants present: `6905428852`, `6905428853`.

Verdict: no exact or close folder for `6905428854` beyond neighboring tickets.

**Q4c — Why Did Pipeline Think A Folder Existed?**

It did not prove a folder existed. The output says:
- `Evidence Folder Status`: `OK`
- `Approval Email Status`: `MISSING`
- `Human Review Note`: `An evidence folder exists, but it contains zero approval email (.msg) files...`

But that is a default consequence of missing `NO_FOLDER`, not evidence of an actual folder. `process_batch.py` sets folder status to `OK` whenever `NO_FOLDER` is absent. The active QC path emitted `NO_APPROVAL` because `has_approval()` found no approval sources; it does not check folder existence before doing so.

No evidence of partial match to `6905428852`, `6905428853`, or `CRM-2026-27 Approvals` was found in the trace for `6905428854`; the row has no step-trace entry.

Verdict: pipeline did not find a real folder; it defaulted to `Evidence Folder Status=OK` because no `NO_FOLDER` catch exists.

| Issue | Row | Root cause (one line) | Correct action |
|---|---:|---|---|
| Issue 2 | 10 | Unsafe L4 GDS fuzzy matched `AHMED MOHAMED AHMED` to `1000087`, then routed as normal travel `60301003`; no LLM trace ran. | Tighten ambiguous fuzzy handling; require disambiguation when best and second score tie. |
| Issue 3 | 69 | Input `1000259` conflicted with approval/form `1000575`; evidence supports `1000575`. | Override input emp_no with approval/form emp_no when validated by matching email/PDF evidence. |
| Issue 4 | 10 | Active QC emits `NO_APPROVAL` without checking whether the ticket folder exists; `NO_FOLDER` is only consumed, not generated. | Add upstream `NO_FOLDER(HIGH)` detection before `NO_APPROVAL`. |

[status: done rc=0]
