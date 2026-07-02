Investigation complete. All findings below are from the data, code, and pipeline artifacts — **no files were modified**.

---

# Findings — QA Issues 2, 3, 4 (J26-788)

**Row mapping:** QA "Row N" = xlsx data row, offset +3 for headers. **Row 10 = xlsx row 13** (AHMED, ticket 6905428854); **Row 69 = xlsx row 72** (KONDO, ticket 6905569429).

---

## Issue 2 — Row 10 | AHMED/AHMED MOHAMED MR

### Q2a — GL routing trace
Row 10 is **absent from `step-trace-v30.jsonl`** (which holds only the 10 LLM-routed rows: `row_idx` 17,18,19,59,60,61,62,68,74,75). The output column `Agent Method: cascade` confirms it. **It did NOT route to the LLM — `_needs_classification()` returned False, so there was no Call 1 / Call 2.**

The cascade rule that fired:
> `Resolution Trace: L4→gds_fuzzy score=100 (2nd=100) search='AHMED MOHAMED AHMED' → emp=1000087 (Waseem Mohammad Ahmad Ahmad)` · `Resolution Flag: RESOLVED_VIA_GDS_FUZZY`

Because matched emp 1000087 sits in **DIV 120 (Technical Services)**, the account rule `L8_sm_travel: DIV=120` produced `account=60301003` (Travel Tickets Expense), `cc=250010`, `agency=10206`.

The **blank emp_no in output is by design, not a routing bug** — `process_batch.py:1617-1620`:
```
1617  # v15.13 (Amr 2026-05-26): Aljeel Oracle upload always has Employee No blank.
1620  # ws.cell(row=excel_row, column=COL_EMP_NO + 1, value=r.emp_no)  # DISABLED
```
Internally it resolved to 1000087; the Oracle upload column is intentionally left blank for regular travel rows.

**Not flagged sponsorship** because 6905428854 is a regular `6905*` GDS ticket matched to a regular employee — no OPEX-PDF / `26-NNN` / sponsorship-text signal on the row. The OPEX PDF that *would* signal sponsorship sits in the `CRM-2026-27 Approvals` folder, which was never linked to this row (folder/approval matching is ticket-number-keyed; 6905428854 isn't in that folder's names).

**Verdict:** Cascade L4 gds_fuzzy fired on an ambiguous name tie; account routed off the matched employee's DIV; blank emp_no is the intended Oracle-upload convention.

### Q2b — Who is AHMED/AHMED MOHAMED MR?
**No employee named exactly "Ahmed Ahmed Mohamed" / "Ahmed Mohamed Ahmed" exists in the Manpower master.** The fuzzy match landed on:
- **emp_no 1000087 = Waseem Mohammad Ahmad Ahmad**, DIV 120 Technical Services, cc 250010 Technical Services HO, agency 10206.

But this was a **perfect tie (best=100, 2nd=100)** among many same-token candidates — e.g. 1000584 Ahmed Mohamed Mohamed Elsawy, 1000353 Ahmed Mohamed Najeeb Aboukhalil, 1000266 Ahmed Mohamed Arafat Elbana. The matcher's tie guard fails to reject it (`employee_resolver_v2.py:543-548`):
```
543  if second_score > 0 and (best_score - second_score) < 5:
544      threshold = 90          # tie → raise bar...
548  if best_score >= threshold: # ...but 100 >= 90, so the tie is STILL accepted
```
**Verdict:** Matched to 1000087 (Waseem, DIV 120/cc 250010), but the match is an unreliable arbitrary tie-break; the true employee is not identifiable by name alone — it should resolve via the CRM-2026-27 OPEX approval instead.

### Q2c — Evidence folder check
`/mnt/aljeel_ap_kb/current/J26-788/02may/` contains exactly:
- `6905428852/` — MR YOUSEF ALANAZI pdf + approval .msg
- `6905428853/` — MR AHMED ALEM pdf + approval .msg
- `CRM-2026-27 Approvals/` — **`MR AHMED MOHAMED AHMED-7GAD2O.pdf`**, `OPEX-CRM-2026-27-J-2026-83.pdf`, `Re_ CRM-2026-27 Approvals.msg`

**No folder named `6905428854` exists** (same in `raw/02may/`). The booking PDF for this passenger lives inside `CRM-2026-27 Approvals/`.

**Verdict:** No per-ticket folder; the passenger's GDS PDF + an OPEX approval are filed under the shared `CRM-2026-27 Approvals` folder.

### Q2d — QC catch accuracy
`NO_FOLDER` was **not raised because no `_no_folder` catch function exists in this pipeline.** `run_within_batch_catches` (`qc_catches_within_batch.py:580-587`) runs only:
```
_dup_route_strict, _no_approval, _emd_mismatch, _over_limit, _round_amount
```
`NO_FOLDER` is *consumed* (`process_batch.py:415,1697`; `build_jawal_data.py`) but never *produced* — it belongs to a separate full-batch reconciliation pass not wired into the per-row engine. Consequently `is_no_folder` is always False and **`Evidence Folder Status` is hardcoded "OK" for every row** (`process_batch.py:1708`).

`NO_APPROVAL(MEDIUM)` fired via `has_approval` (`qc_catches_within_batch.py:292-344`), which is ticket-number-keyed: Source 1 fails (row has `FORM_NOT_FOUND_IN_EMAIL`); Source 2 finds no `.msg` whose name/parent contains `6905428854`. Amount 2000 ≤ 3000 → MEDIUM.

**Verdict:** `NO_FOLDER(HIGH)` is structurally impossible in this pipeline; `NO_APPROVAL(MEDIUM)` is the strongest catch it can emit. The "an evidence folder exists…" note (`process_batch.py:419`) is misleading boilerplate that *assumes* a folder when NO_APPROVAL fires.

---

## Issue 3 — Row 69 | KONDO/MBWANA HAMISI MR

### Q3a — Master lookup
| emp_no | Name | Loc | DIV | Agency | Cost Center | sol_flag |
|---|---|---|---|---|---|---|
| **1000259** | Mohamed Ahmed Abdalla Fageir | 30100 | 190 S&M | 10200 S&M | 140020 Operation | Can Be used |
| **1000575** | **Mbwana Hamisi Konodo** | 10100 | 888 G&A | 88888 | 130010 Finance | Can Be used |

1000259 is a **different person** (an S&M line manager, listed as manager for many staff). **1000575 IS the passenger** KONDO/MBWANA HAMISI.

### Q3b — Name match trace
**Not a name match.** The cascade resolved via L0 direct from the input column:
> `Resolution Trace: L0→direct emp_no_col=1000259`

The output value `1000575` came from the **email validator + LLM agent**, not fuzzy/name logic. The approval `.msg` form carried "Mbwana Hamisi Konodo (1000575)", producing `Form Emp No: 1000575`, `Validator Status: FORM_DISAGREES`, `Discrepancy Detail: emp_no: form=1000575 / manpower=1000259`, `Agent Emp Match Source: form_disagrees`. (`run_v16.py:96-130` `build_personal_contribution_index` extracts the emp_no from the `.msg` filename pattern "…for <name> (<emp_no>)…".)

### Q3c — Step trace row 69 (`row_idx 68`)
- **Call 1** (gemini-2.5-flash): **errored** `HTTPError: HTTP Error 503: Service Unavailable` → `row_type="unclear"`, `employee_no_in_doc=""`. Evidence files included the approval `.msg` "…Konodo (1000575)…".
- **Call 2** (gemini-pro-latest): `emp_no="1000575"`, `account="21070229"`, `cost_center="130010"`, `agency="88888"`, confidence high; reasoning: *"the email subject indicates a Personal Contribution Approval for employee 1000575… annual leave."*

**1000575 was returned by the LLM (Call 2), sourced from the approval email** — not derived from master/input (which held 1000259). Segments were then master-filled from 1000575's record.

### Q3d — Evidence folder
Yes — `raw/06may/6905569429/` (and the `/mnt/.../06may/6905569429/` mirror) contains:
- `Fw_ Action Required_ Personal Contribution Approval Requested for Mbwana Hamisi Konodo (1000575) on 2026-05-05 by Mbwana Hamisi Konodo.msg` ← **approval email explicitly references emp 1000575**
- `MR MBWANA HAMISI KONDO-8SYHO6.pdf`
- `RE_  Passport kondo.msg`

### Q3e — Verdict
**1000575 is correct.** It matches the passenger name, the per-ticket approval email names 1000575, and its segments (DIV 888/Finance cc 130010) flow through to the output. The input `1000259` is a data-entry error (a different employee — an S&M manager). **This is the pipeline correctly fixing a bad input, not a lookup error.** The feared wrong-cost-center/payroll impact does not exist — 130010 Finance is the real traveler's CC. The row is appropriately held RED `FORM_DISAGREES` for human sign-off.

---

## Issue 4 — Row 10 deeper dive

### Q4a — QC catch code
No `NO_FOLDER` catch exists (see Q2d). `run_within_batch_catches` emits only `DUP_ROUTE_STRICT, NO_APPROVAL, EMD_MISMATCH, OVER_LIMIT, ROUND_AMOUNT` (`qc_catches_within_batch.py:580-587`). **Not an ordering bug** — `NO_FOLDER` simply cannot fire. At the consumer (`process_batch.py:1697-1708`) `NO_FOLDER` *would* take precedence for Evidence Folder Status if present, but it never is.

### Q4b — Ticket number check
`02may/` folder names: `6905428852`, `6905428853`, `CRM-2026-27 Approvals`. **None contains `6905428854`.** Closest are the two consecutive siblings `…852` / `…853`.

### Q4c — Why did the pipeline "think" a folder existed?
It never actually verified one. `Evidence Folder Status="OK"` is hardcoded (is_no_folder always False). The `NO_APPROVAL` catch is **independent of folder existence** — `has_approval` only searches recursively for a `.msg` whose filename/parent contains the ticket number `6905428854`; none does, so NO_APPROVAL fires. No folder-match step feeds the catch, and no partial/shared-folder match occurred. The "an evidence folder exists…" text is flag-keyed boilerplate (`process_batch.py:419`) that asserts a folder without checking. (The passenger PDF *does* exist in `CRM-2026-27 Approvals`, but the pipeline never linked it to this row.)

---

## Summary table

| Issue | Row | Root cause (one line) | Correct action |
|---|---|---|---|
| 2 — GL_ERROR | 10 | L4 gds_fuzzy resolved an ambiguous name **tie** (best=100, 2nd=100) to 1000087/DIV 120, routing account 60301003; blank emp_no is the intended Oracle convention | Fix tie guard in `employee_resolver_v2.py:543-548` to reject ties → flag AMBIGUOUS; resolve via the CRM-2026-27 OPEX approval |
| 2/4 — MISSING_EVIDENCE | 10 | No `_no_folder` catch in the per-row engine → `Evidence Folder Status` hardcoded "OK"; ticket-keyed `NO_APPROVAL` fired (no `.msg` named 6905428854) | Add a folder-existence catch (`NO_FOLDER(HIGH)`); link booking PDFs in `CRM-2026-27 Approvals` to their tickets |
| 3 — LOOKUP_ERROR | 69 | Input emp_no 1000259 was wrong (a different S&M manager); pipeline **correctly** overrode to 1000575 (real traveler Mbwana Hamisi Konodo) from the approval email | None to pipeline — confirm 1000575 in human review; correct the source input that carried 1000259 |

**No files were edited; no LLM APIs were called.**

[status: done rc=0]
