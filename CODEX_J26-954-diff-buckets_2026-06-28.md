**Read-Only J26-954 Diff Report**

Baseline: `diff-vs-labadi-v3.csv` has `61` differing rows. The four requested buckets account for most of them:

- Bucket 1: `5` zeroed `21070229` rows.
- Bucket 2: `19` SIS agency-only split-row mismatches.
- Bucket 3: `3` account-level mismatches.
- Bucket 4: `19` ancillary/event allocation `<no-match>` rows in the named cluster. There are `25` total `<no-match>` rows.

**1. 21070229 Rows Zeroed**
Rows: `ALJUNDI/LAMA`, `MOWAFI/IYAD`, `KHADOUJ AWADA/SALEEM`, `SDEK/MUHANAD` x2.

Root cause: the correct annual-ticket segment rule exists, but v30 does not consistently apply it to verified employee rows. The LLM trace for `ALJUNDI/LAMA` has correct `final.cost_center=120010`, `div=888`, `agency=88888`, but merge protection in [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2970) skips overwriting `account/cost_center/div/solution/agency` for `VERIFIED_EMP_LOCK` rows. Family annual stamping also skips verified locks in [apply_family_annual_account_rule](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2222), so adult owner rows stay on stale cascade zero segments. CHD rows get stamped because they do not hit the same verified-lock path.

Also, v30’s dict helper [\_stamp_21070229_home_segments](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:196) sets values but does not add `ANNUAL_TICKET_HOME_SEGMENTS`; the shared object helper in [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:2434) does.

OPTION A: surgical  
Update v30’s verified-lock exceptions so `account=21070229` rows may receive annual-ticket segment stamping without changing employee identity. Files/functions: `scripts/run_v30.py`, `_stamp_21070229_home_segments`, merge block around `2970`, `apply_family_annual_account_rule`.  
Tradeoff: small patch, directly fixes these rows.  
Regression risk: moderate, because verified lock currently protects against bad LLM overlays. Keep the exception limited to `account == 21070229`.  
Recommendation: yes.

OPTION B: structural  
Create one shared annual-ticket finalizer used after all account-mutating stages and before `write_v15_12_xlsx`, independent of LLM/family path. It would stamp all final `21070229` rows from Manpower and append the flag.  
Tradeoff: cleaner invariant, fewer scattered fixes.  
Regression risk: lower long-term, but broader touch.  
Recommendation: best long-term, but A is enough for this batch.

**2. SIS Sponsorship Agency Mismatch**
Rows: `19` SIS rows.

Root cause: full v30 is already correct before split. In `Spreadsheet-J26-954-FILLED-v30.xlsx`, `ABU FARHANEH` and `ELGHALAYINI` have agency `10043`, and `ALQIFARI` has `10041`. The OPEX PDFs confirm this: SIS-15 says `Agency: ERBE`, and the Agency lookup maps `Erbe -> 10043`; SIS-14 says `Agency: Fujifilm`, mapped to `10041`.

The mismatch is introduced by stage 5 split. [scripts/split_multi_emp.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:239) re-derives each split row from the individual employee’s Manpower record, overwriting the event/form agency. So employee `1002169` becomes `10156`, while `1001422/1001530` become `10041`, even when the event agency was `10043`.

OPTION A: surgical  
In `split_multi_emp.py`, preserve original event/form `DIV/Solution/Agency` for sponsorship rows (`Account=60307021`) and only split amount/employee number.  
Tradeoff: direct fix for split output.  
Regression risk: low to moderate; some split rows may intentionally need home segments, so gate it to rows with `FORM_VS_MANPOWER_SEGMENT_DIFF` or OPEX form columns present.  
Recommendation: yes.

OPTION B: structural  
Teach split stage about allocation policy: “employee split” vs “event split”. Use OPEX/form columns as authoritative for sponsorship, Manpower for employee travel only.  
Tradeoff: clearer model, avoids future event-segment clobbering.  
Regression risk: lower after tests, but more implementation.  
Recommendation: best long-term.

**3. Account-Level Misclassifications**
Rows: `3`.

`BAASSIRI/MOHAMAD`: v30 flips `60301003` to `21070229` via family annual rule: log shows `account 60301003 -> 21070229 (chd_empno_group:1000820)`. Labadi keeps `60301003` with event-style segments. Root cause is over-broad family annual detection: CHD/family clustering is treated as enough to override the adult primary row, despite the evidence/account context looking like business/event travel.

`ALEM/AHMED` x2: v30 stays `60301003`; Labadi says `60308009`. The trace classifies these as employee/business/default travel or even misroutes one leg through shared OPEX. The late Trip Account Override enforcement in [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3440) only applies existing cascade `Trip Account Override`, but these rows have no training override, and verified-lock rows are skipped.

OPTION A: surgical  
For `BAASSIRI`, narrow `collect_family_annual_rows/apply_family_annual_account_rule` so adult primary rows are not flipped solely because a CHD group exists unless annual/PC evidence is explicit. For `ALEM`, add training keyword/folder inheritance from `DBE - Training for Qassim` / training emails into trip-purpose classification.  
Tradeoff: fixes known cases with small rules.  
Regression risk: moderate; family logic is sensitive.  
Recommendation: yes, with targeted tests.

OPTION B: structural  
Introduce a final account arbiter that ranks evidence: explicit trip-purpose/training/OPEX form > family cluster > default travel. This would resolve conflicts before the writer and produce a trace reason.  
Tradeoff: more robust, but bigger change.  
Regression risk: lower long-term, higher initial blast radius.  
Recommendation: B after A stabilizes.

**4. Ancillary / Non-Ticket `<no-match>` Rows**
Named cluster count: `19`.

Root cause has two shapes:

- CRM-2026-39 ancillary rows (`RANIA` airport pickup/dropoff, Smartrental, `ZAITOUNI` Madrid Marriott) are present in source with `26-895`, `26-896`, `26-893`, `26-899`, but v30 marks them `missing_evidence_gate`, blanks combo/emp/account, and never attaches them to the parent CRM-2026-39 allocation. The folder matcher is ticket/passenger oriented and does not link ground/hotel ancillary lines back to the event folder.
- LAB-16 rows often have a combo in our output, but not under Labadi’s expected split employees/allocation. For blank hotel/car parent rows like `26-904`, the same missing-evidence gate blanks them instead of inheriting `LAB-16` allocation.

OPTION A: surgical  
Add a pre-missing-gate ancillary matcher for descriptions containing `AIRPORT PICK`, `AIRPORT DROP`, hotel names, `NTS`, `ground transport`, etc. If description or nearby evidence contains an OPEX serial (`CRM-2026-39`, `LAB-16-2026`), attach the row to that event’s already parsed allocation. Files/functions: `scripts/run_v30.py`, `stamp_missing_evidence_gate`, `_sponsorship_event_folder_for_row`, `apply_sponsorship_event_segments`.  
Tradeoff: quick and targeted.  
Regression risk: moderate; keyword matching can over-attach unrelated hotel rows.  
Recommendation: A for CRM/LAB ancillary cases with serial/folder confirmation required.

OPTION B: structural  
Build an event allocation index per batch from OPEX PDFs: serial -> salesmen -> event segments -> evidence folder. Then any row with event serial, shared folder, or same event folder inherits allocation, regardless of ticket number.  
Tradeoff: solves parent/ancillary allocation generally.  
Regression risk: lower if serial/folder evidence is required, but larger implementation.  
Recommendation: B is the right durable fix.

Overall recommendation: implement Bucket 2 Option A first because full v30 is already correct and split is clobbering it. Then Bucket 1 Option A. Buckets 3 and 4 need targeted tests because they affect broader classification behavior.
