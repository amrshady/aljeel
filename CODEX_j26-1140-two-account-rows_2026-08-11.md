The fresh pipeline reached 60301003 through its unresolved-employee fallback, because both approval messages had truncated filenames/extensions and were excluded from the Personal Contribution index. However, the contents of those messages explicitly describe internal business trips—not annual-leave or personal travel. Therefore, reproducing 21070229 automatically would conflict with the current documented account semantics.

There is also an important clerk-file inconsistency for ticket 4860966722: its editable Account column says 21070229, but its actual Oracle Distribution Combination still contains 60301003.

## 1. Ticket 4860966722 — Saleh Mohammad Aref

### Pipeline resolution path

Fresh output row 25 contains:

- `Employee No`: blank
- `Agent Emp Match Source`: `"manpower"`
- `Agent Match Method`: `"not_found"`
- `Resolution Layer`: `"not_resolved"`
- `Resolution Confidence`: `0`
- `Resolution Trace`: `"All 9 layers failed for 'AREF/SALEH MOHAMMAD MR'"`
- `Agent Flags`: `"EMPLOYEE_NOT_IN_MASTER | FORM_NOT_FOUND_IN_EMAIL | TRIP_PURPOSE_UNKNOWN | EMP_NOT_IN_MASTER"`
- `Agent Action`: `"HOLD - EMPLOYEE_NOT_IN_MASTER | FORM_NOT_FOUND_IN_EMAIL | TRIP_PURPOSE_UNKNOWN"`
- `Trip Purpose`: `"UNKNOWN"`
- `Trip Purpose Trace`: `"no classification signal → UNKNOWN (leave resolver default)"`
- `Trip Account Override`: blank
- `Invoice Ref No`: `"1002602"`
- `OPEX Serial`: `"N/A"`
- `Agent Account Rule`: `"L9_external_travel: not in Manpower, no OPEX ref"`
- `Agent Segments Breakdown`: `"Co=03 Loc=20100 Acc=60301003 CC=999999 DIV=000 Sol=00000 Ag=00000 Proj=00000 IC=00 F1=000000"`

Thus:

`employee cascade not_resolved` → no trip-purpose override → [cost_center_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py:433) L9 sees no employee and no OPEX/sponsorship reference → sets 60301003.

### Why the Personal Contribution overlay missed it

The folder contains:

- `RE_.msg`
- A valid Outlook message whose filename ends in `.m`, not `.msg`:
  `Approved_Personal_Contribution_Approval_Requested_for_Saleh_Mohammad_Aref_1002602_...Aref.m`

The PC index imported by v30 only considers files with an exact `.msg` suffix and expects the employee number in parentheses in the filename. See [run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:104):

- `if child.suffix.lower() != ".msg": continue`
- employee regex: `\(\s*(\d{6,7})\s*\)`

This file fails both filename assumptions: suffix `.m`, and `_1002602_` rather than `(1002602)`. Consequently `pc_index` has no record for the folder, and the v30 stage-3c override exits at `if not pc_rec: continue` in [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5787).

### What the underlying evidence actually says

The `.m` file is a genuine CDF Outlook message and parses successfully. Its subject is:

> Approved: Personal Contribution Approval Requested for Saleh Mohammad Aref (1002602) …

But its workflow details say:

> New Awards — Business Trip — Internal Business Trip

They also identify:

- Person Number: `1002602`
- Trip Goal: technical support / periodic and preventative maintenance
- Host: Bio-Rad
- Riyadh → Gurayat
- Reason: technical support

The other email says the work-trip approval is attached. This is affirmative business-travel evidence, not annual-ticket evidence.

That distinction matters because [full_evidence_agent_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py:553) explicitly says not to infer personal travel from the “Personal Contribution” subject. If the form says Business Trip, the prescribed account is 60301003; 21070229 requires Annual Leave or Personal Travel in the form.

### Clerk truth

Clerk Sheet1 gives:

- `Employee No`: `1002602`
- `Account`: `21070229`
- `GL`: `"Accrued Employee Annual Tickets"`
- `GL Description`: `"Accrued Employee Annual Tickets · IVD Solutions · IVD Solutions · General · Sakura · 00000 · 00 · 000000"`
- `Human Review Note`: employee not found in Manpower

But the same row’s upload combination is:

> `03-10100-60301003-250010-120-00000-10206-00000-00-000000`

So the clerk workbook does not consistently establish that Oracle was actually fed 21070229 for this ticket: the Account helper column says 21070229, while the upload-driving combination says 60301003.

### Verdict

**(c) Genuinely conflicting/ambiguous truth artifact, with a separate evidence-ingestion defect.**

The pipeline did miss a usable Outlook document and employee number because of truncated filename handling. But the document’s substantive classification supports 60301003. There is no annual/personal award evidence supporting a new 21070229 rule.

---

## 2. Ticket 4861013115 — Mahmoud Ahmed Farag

### Pipeline resolution path

Fresh output row 60 contains:

- `Employee No`: blank
- `Agent Emp Match Source`: `"manpower"`
- `Agent Match Method`: `"not_found"`
- `Resolution Layer`: `"not_resolved"`
- `Resolution Confidence`: `0`
- `Resolution Trace`: `"All 9 layers failed for 'FARAG/MAHMOUD MR'"`
- `Agent Flags`: `"EMPLOYEE_NOT_IN_MASTER | FORM_NOT_FOUND_IN_EMAIL | TRIP_PURPOSE_UNKNOWN | EMP_NOT_IN_MASTER"`
- `Agent Action`: `"HOLD - EMPLOYEE_NOT_IN_MASTER | FORM_NOT_FOUND_IN_EMAIL | TRIP_PURPOSE_UNKNOWN"`
- `Approval Email Status`: `"MISSING"`
- `QC Catches`: `"NO_APPROVAL(MEDIUM)"`
- `Trip Purpose`: `"UNKNOWN"`
- `Trip Purpose Trace`: `"no classification signal → UNKNOWN (leave resolver default)"`
- `Trip Account Override`: blank
- `Invoice Ref No`: `"1002630"`
- `OPEX Serial`: `"N/A"`
- `Agent Account Rule`: `"L9_external_travel: not in Manpower, no OPEX ref"`
- `Agent Segments Breakdown`: `"Co=03 Loc=40100 Acc=60301003 CC=999999 DIV=000 Sol=00000 Ag=00000 Proj=00000 IC=00 F1=000000"`

The path is identical:

`employee cascade not_resolved` → no trip-purpose override → L9 external non-OPEX travel → 60301003.

### Why the approval and PC rules missed it

The only Outlook approval file is named:

`RE_Approved_Personal_Contribution_Approval_Requested_for_Mahmoud_Ahmed_Farag_1002630_...Fara`

It has no extension at all, although `file` identifies it as a valid CDF Outlook message and the message parser reads it successfully.

Consequences:

- approval detection reports `MISSING`;
- the `.msg`-only Personal Contribution index ignores it;
- stage 3c receives no `pc_rec`;
- employee `1002630` and its home allocation never reach the output.

### What the underlying evidence says

The parsed message subject supplies the likely clerk signal:

> Approved: Personal Contribution Approval Requested for Mahmoud Ahmed Farag (1002630) …

But the embedded Oracle form says:

> New Awards — Business Trip — Internal Business Trip

Additional evidence:

- Person Number: `1002630`
- Trip Goal: technical support / periodic and preventative maintenance
- Host: STERIS
- Riyadh → Tabouk
- Reason: warranty visit

Again, this is positive business-purpose evidence. The short domestic round trip and amount SAR 1,313.04 do not independently indicate annual leave; they fit the documented service/warranty visit.

### Clerk truth

Clerk Sheet1 gives:

- `Employee No`: `1002630`
- `Account`: `21070229`
- `GL`: `"Accrued Employee Annual Tickets"`
- Distribution Combination:  
  `03-10100-21070229-160030-190-00000-10200-00000-00-000000`
- `GL Description`: `"Accrued Employee Annual Tickets · Tender · S&M · General · S&M · 00000 · 00 · 000000"`
- adjacent note: `"All the data from the AI are not correct"`
- `Human Review Note`: says the folder contains zero `.msg` files

Unlike ticket 4860966722, this row’s Account and Distribution Combination agree on 21070229. The probable clerk trigger was the workflow label “Personal Contribution” plus employee number 1002630—not an annual-leave field.

### Verdict

**(c) Genuinely conflicting business evidence versus clerk accounting treatment, with a clear pipeline evidence-ingestion defect.**

If AlJeel Finance’s real policy is “every Personal Contribution workflow goes to 21070229 regardless of the award type,” then this should instead be classified as **(a), a pipeline rule gap**. But that policy would directly contradict the current full-evidence rule, which expressly maps an embedded `Business Trip` award to 60301003.

## Proposed change, description only

The safe minimal change is not “any Personal Contribution filename → 21070229.”

Instead:

1. Treat extension-truncated files as Outlook messages when their file signature is CDF/OLE, including `.m` and extensionless files.
2. Extract employee number from the parsed subject/body, with filename `_1002602_` / `_1002630_` as a fallback—not only parenthesized filename numbers.
3. Feed the parsed workflow award into trip classification:
   - `Annual Leave` or `Personal Travel` → 21070229.
   - `Business Trip` or `Internal/External Business Trip` → 60301003.
4. Use the extracted employee number to resolve home segments even when the employee snapshot lacks a name match.

Mechanically, broadening `build_personal_contribution_index()` would make existing stage 3c at [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5753) fire 21070229 for both rows. I do **not** recommend that unqualified change: stage 3c currently maps a filename-level PC signal directly to 21070229, while the full-evidence policy requires inspecting the award type. Those two rules are internally inconsistent and should be reconciled first.

## Relationship to the four CRM/HF voucher rows

**Different root cause.**

The CRM/HF rows 26-1051/1075/1076/1082 are voucher/event lines that the scoring report shows were categorized differently between pipeline and clerk—pipeline-side `travel|26-…` versus clerk-side sponsorship groups tied to HF/CRM evidence. That can plausibly involve Manpower/employee-vs-external categorization or voucher routing.

These two rows are ordinary ticket folders with employee-specific approval workflows. Their failure comes from:

- truncated Outlook filenames/extensions preventing evidence ingestion;
- employee resolution failing despite employee numbers being present;
- and a policy conflict between filename-level “Personal Contribution” treatment and the embedded `Business Trip` award.

They do not share the voucher/Manpower-sheet root cause.
