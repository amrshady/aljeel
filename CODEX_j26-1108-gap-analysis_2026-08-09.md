# Jawal J26-1108 frozen-baseline gap analysis

Read-only review of:

- Pipeline: `Spreadsheet-J26-1108-FILLED-v30.xlsx`
- Truth: `J26-1108-truth-clerk-reviewed.xlsx`
- Scorer: `qc/score_against_truth.py`
- Expected snapshot: `qc/jawal_j26_1108_golden_expected.json`
- Current Oracle Manpower lookup: 662 employees

## Reconciliation

| Metric | Recomputed | Expected |
|---|---:|---:|
| Truth physical rows | 102 | 102 |
| Pipeline physical rows | 90 | 90 |
| Logical/virtual evaluated | 102 | 102 |
| All five accounting segments correct | 83 | 83 |
| All five + employee correct | 52 | 52 |
| Employee match | 69/102 | 69/102 |
| Account match | 83/102 | 83/102 |
| Wrong only on `emp_no` | 31 | 31 |
| Truth-blank account bucket | 25 rows; 7 all-5; 4 all-5+emp | Exact |

There are 50 logical rows that are not fully correct:

- 19 fail at least one of the five accounting segments.
- 31 additional rows fail only `emp_no`.
- The 33 employee mismatches are the 31 employee-only rows plus rows 72 and 95 below.

Important semantic point: “blank-account bucket” means the clerk-reviewed truth account is blank. In 7 rows the pipeline also stayed blank; in 18 rows the pipeline populated an accounting combination that the frozen baseline says should remain unresolved.

No evaluated pipeline row carries `REFNO_FALLBACK` or `EMP_FILENAME_FALLBACK`. The relevant observed flags are mainly `MISSING_EVIDENCE(HARD)`, `NO_FOLDER(HIGH)`, `NO_APPROVAL(MEDIUM)`, `OPEX_SERIAL_MISSING(MEDIUM)`, and `OPEX_EMAIL_ONLY_REVIEW(MEDIUM)`. The literal `NOT_RESOLVED` appears in underlying truth diagnostics for some external passengers, but not in the pipeline QC-catches column.

## A. Rows failing at least one accounting segment

Values are shown as `truth → pipeline`. Blank is shown as `∅`. Employee differences are included where applicable.

| Truth row | Employee / description | Mismatching fields | Pipeline flags |
|---:|---|---|---|
| 9 | 1002648 — ALKHDRAWI/MARYAM, 4860528652 | `account`: 21070229 → 60301003 | None; method `llm_agent` |
| 21 | 1001008 — WALEED BATAWEEL, 26-996 | `account`: ∅ → 60301003; `cc`: ∅ → 250010; `div`: ∅ → 120; `solution`: ∅ → 0; `agency`: ∅ → 10206 | `NO_APPROVAL(MEDIUM)` |
| 34 | 1002483 — FAHMI ALKAF hotel, 26-1000 | `account`: ∅ → 60307021; `cc`: ∅ → 160014; `div`: ∅ → 170; `solution`: ∅ → 10050; `agency`: ∅ → 10072 | `NO_APPROVAL(MEDIUM)` |
| 37 | 1002483 — SHAMSAH ALANAZI hotel, 26-1002 | Same five: ∅ → 60307021 / 160014 / 170 / 10050 / 10072 | `NO_APPROVAL(MEDIUM)` |
| 38 | 1002483 — FAHMI ALKAF hotel, 26-1003 | Same five: ∅ → 60307021 / 160014 / 170 / 10050 / 10072 | `NO_APPROVAL(MEDIUM)` |
| 41 | 1002483 — MOSAAD ALHUSSEIN hotel, 26-1007 | Same five: ∅ → 60307021 / 160014 / 170 / 10050 / 10072 | `NO_APPROVAL(MEDIUM)` |
| 42 | 1001422 — ALSHAHRANI ABDULWAHAB hotel, 26-998 | `account`: ∅ → 60307021; `cc`: ∅ → 160011; `div`: ∅ → 196; `solution`: ∅ → 0; `agency`: ∅ → 10041 | `NO_APPROVAL(MEDIUM)` |
| 43 | 1002169 — same 26-998 virtual allocation | Same five: ∅ → 60307021 / 160011 / 196 / 0 / 10041 | Shared pipeline row; `NO_APPROVAL(MEDIUM)` |
| 44 | 1001530 — same 26-998 virtual allocation | Same five: ∅ → 60307021 / 160011 / 196 / 0 / 10041 | Shared pipeline row; `NO_APPROVAL(MEDIUM)` |
| 45 | 1002483 — SHAMSAH ALANAZI hotel, 26-999 | Five: ∅ → 60307021 / 160014 / 170 / 10050 / 10072 | `NO_APPROVAL(MEDIUM)` |
| 48 | 1000927 — ALI ALQAHTANI train, 26-1010 | Five: ∅ → 60301004 / 130020 / 888 / 0 / 88888 | `NO_APPROVAL(MEDIUM)` |
| 72 | 1001422 — RASHWAN/SHADI, 4860633346 virtual allocation | Five: ∅ → 60301003 / 160011 / 196 / 0 / 10041; `emp_no`: 1001422 → 1000523 | `OPEX_SERIAL_MISSING(MEDIUM)` |
| 74 | 1002483 — FAHMI ALKAF ground transport, 26-1011 | Five: ∅ → 60307021 / 160014 / 170 / 10050 / 10072 | `NO_APPROVAL(MEDIUM)` |
| 75 | 1002483 — SHAMSA ALANAZI airport pickup, 26-1012 | Five: ∅ → 60307021 / 160014 / 170 / 10050 / 10072 | `OPEX_SERIAL_MISSING(MEDIUM)` |
| 76 | 1002483 — FAHMI ALKAF ground transport, 26-1013 | Five: ∅ → 60307021 / 160014 / 170 / 10050 / 10072 | `NO_APPROVAL(MEDIUM)` |
| 77 | 1002483 — SHAMSA ALANAZI airport pickup, 26-1014 | Five: ∅ → 60307021 / 160014 / 170 / 10050 / 10072 | `OPEX_SERIAL_MISSING(MEDIUM)` |
| 90 | 1000633 — MOHAMMED TAFESH train, 26-1023 | Five: ∅ → 60301003 / 250010 / 120 / 0 / 10206 | `NO_APPROVAL(MEDIUM)` |
| 95 | 1001184 — ABDALLA/AHMED, 4860665526 virtual allocation | Five: ∅ → 60301003 / 160013 / 192 / 0 / 10202; `emp_no`: 1001184 → 1000390 | Shared pipeline row; `NO_APPROVAL(MEDIUM)` |
| 98 | 1001027 — MOHAMMED RAYEH train, 26-1024 | Five: ∅ → 60301004 / 130020 / 888 / 0 / 88888 | `NO_APPROVAL(MEDIUM)` |

Thus:

- One row has a conventional wrong account: row 9.
- The other 18 accounting failures are attempts to fill clerk-unresolved rows.
- `cc`, `div`, `solution`, and `agency` each have exactly those same 18 failures.
- Account has those 18 plus row 9, producing 19 mismatches.

## B. The 25-row truth-blank-account bucket

The “root cause” below explains why the frozen baseline requires the accounting fields to remain blank.

| Truth row | Employee / description | Pipeline account | Other mismatches | Root cause for blank baseline | Pipeline flags |
|---:|---|---:|---|---|---|
| 21 | 1001008 — WALEED BATAWEEL, 26-996 | 60301003 | CC/DIV/Sol/Agency populated | Missing approval: folder exists but contains no approval `.msg` | `NO_APPROVAL(MEDIUM)` |
| 34 | 1002483 — FAHMI ALKAF hotel, 26-1000 | 60307021 | Four segments populated | Missing evidence; passenger was unresolved and no usable OPEX allocation was established | `NO_APPROVAL(MEDIUM)` |
| 37 | 1002483 — SHAMSAH ALANAZI hotel, 26-1002 | 60307021 | Four segments populated | Missing approval/OPEX evidence | `NO_APPROVAL(MEDIUM)` |
| 38 | 1002483 — FAHMI ALKAF hotel, 26-1003 | 60307021 | Four segments populated | Missing approval/OPEX evidence | `NO_APPROVAL(MEDIUM)` |
| 41 | 1002483 — MOSAAD ALHUSSEIN hotel, 26-1007 | 60307021 | Four segments populated | Missing approval plus unresolved “Need to allocate” target | `NO_APPROVAL(MEDIUM)` |
| 42 | 1001422 — ALSHAHRANI ABDULWAHAB hotel, 26-998 | 60307021 | Four segments populated | Missing approval/OPEX evidence; passenger itself was not resolved | `NO_APPROVAL(MEDIUM)` |
| 43 | 1002169 — 26-998 allocation 2 | 60307021 | Four segments populated | Virtual allocation inherits row 42’s missing row-level evidence | Shared `NO_APPROVAL(MEDIUM)` |
| 44 | 1001530 — 26-998 allocation 3 | 60307021 | Four segments populated | Virtual allocation inherits row 42’s missing row-level evidence | Shared `NO_APPROVAL(MEDIUM)` |
| 45 | 1002483 — SHAMSAH ALANAZI hotel, 26-999 | 60307021 | Four segments populated | Missing approval/OPEX evidence | `NO_APPROVAL(MEDIUM)` |
| 48 | 1000927 — ALI ALQAHTANI train, 26-1010 | 60301004 | Four segments populated | Missing approval; description alone is insufficient to confirm the accounting treatment | `NO_APPROVAL(MEDIUM)` |
| 49 | 1000668 — ABDULAZIZ ALANAZI train, 26-997 | ∅ | None | Missing approval; correctly held blank | `NO_APPROVAL`; `MISSING_EVIDENCE(HARD)` |
| 61 | 1002686 — AYED ZEIADEH, 1950092711 | ∅ | `emp_no`: 1002686 → ∅ | No folder and employee absent from current master; correctly blank accounting | `NO_FOLDER`; `MISSING_EVIDENCE(HARD)` |
| 72 | 1001422 — RASHWAN/SHADI virtual allocation | 60301003 | Four segments and employee | Unclassifiable allocation: one physical passenger row was reused for another employee without an OPEX serial tying that allocation to the charge | `OPEX_SERIAL_MISSING(MEDIUM)` |
| 74 | 1002483 — FAHMI ALKAF transport, 26-1011 | 60307021 | Four segments populated | Missing approval/OPEX evidence | `NO_APPROVAL(MEDIUM)` |
| 75 | 1002483 — SHAMSA airport pickup, 26-1012 | 60307021 | Four segments populated | Missing OPEX serial; ground-service wording alone does not establish the allocation | `OPEX_SERIAL_MISSING(MEDIUM)` |
| 76 | 1002483 — FAHMI ALKAF transport, 26-1013 | 60307021 | Four segments populated | Missing approval/OPEX evidence | `NO_APPROVAL(MEDIUM)` |
| 77 | 1002483 — SHAMSA airport pickup, 26-1014 | 60307021 | Four segments populated | Missing OPEX serial; ground-service heuristic over-classified the row | `OPEX_SERIAL_MISSING(MEDIUM)` |
| 78 | 1002198 — MOSTAFA SHARAF, 4860633374 | ∅ | None | No evidence folder; correctly held blank | `NO_FOLDER`; `MISSING_EVIDENCE(HARD)` |
| 79 | 1002338 — ABDULLAH ALGHAMDI, 4860633376 | ∅ | None | No evidence folder; correctly held blank | `NO_FOLDER`; `MISSING_EVIDENCE(HARD)` |
| 81 | 1001906 — ABDELRAHMAN ELKILO, 4860633378 | ∅ | `emp_no`: 1001906 → 1000467 | No folder plus unresolved “Need to allocate” target; accounting correctly blank | `NO_FOLDER`; `MISSING_EVIDENCE(HARD)` |
| 89 | 1000294 — KHALID HASSAN train, 26-1022 | ∅ | `emp_no`: 1000294 → ∅ | Missing approval; correctly held blank | `NO_APPROVAL`; `MISSING_EVIDENCE(HARD)` |
| 90 | 1000633 — MOHAMMED TAFESH train, 26-1023 | 60301003 | Four segments populated | Missing approval; pipeline filled from Manpower despite the evidence hold | `NO_APPROVAL(MEDIUM)` |
| 95 | 1001184 — ABDALLA/AHMED virtual allocation | 60301003 | Four segments and employee | Unclassifiable allocation: second employee allocation has no independent row-level evidence | Shared `NO_APPROVAL(MEDIUM)` |
| 98 | 1001027 — MOHAMMED RAYEH train, 26-1024 | 60301004 | Four segments populated | Missing approval; description/Manpower alone cannot confirm the charge | `NO_APPROVAL(MEDIUM)` |
| 105 | 1000668 — ABDULAZIZ ALANAZI train, 26-1027 | ∅ | None | Missing approval; correctly held blank | `NO_APPROVAL`; `MISSING_EVIDENCE(HARD)` |

Blank-bucket root-cause totals:

| Root cause | Rows | Count |
|---|---|---:|
| Missing folder, approval, or OPEX allocation evidence | 21, 34, 37, 38, 41–45, 48–49, 61, 74, 76, 78–81, 89–90, 98, 105 | 21 |
| Missing OPEX serial / unclassifiable ground-service description | 75, 77 | 2 |
| Unclassifiable virtual employee allocation | 72, 95 | 2 |
| Unmapped GL | None | 0 |

The workbook already contains recognizable GL names such as “Travel Tickets Expense,” “Sponsoring Expenses,” and “Travel Cost Expense G&A.” Therefore these are not GL-code lookup failures. They are evidence-authority failures: the GL is recognizable, but the frozen truth does not authorize selecting it for the row.

## Bucket assignment for all 50 not-fully-correct rows

This classification is mutually exclusive and uses the requested precedence:

1. Missing row/folder/OPEX evidence.
2. Employee absent from current master.
3. Employee exists but the frozen assignment differs from the pipeline/master-derived assignment.
4. Model-dependent classification error.
5. Remaining categories.

| Bucket | Count | Rows / basis |
|---|---:|---|
| `STALE_MASTER` | 24 | Employee-only mismatches where the truth employee exists in the current 662-row Manpower lookup but the pipeline chose another employee. This is predominantly manager/passenger versus allocated-employee drift. |
| `NOT_IN_MASTER` | 3 | Rows 7, 57, 97: truth employees 1002686 or 1002566 are absent from current Manpower. |
| `MISSING_EVIDENCE` | 21 | The 18 blank-account accounting failures plus employee-only sponsorship rows 58–60, whose allocation employee was lost under `NO_FOLDER` / email-only OPEX review. |
| `UNMAPPED_GL` | 0 | No failed row is caused by an unknown GL name/code. |
| `LLM_NONDETERMINISM` | 2 | Row 9 missed annual/personal account 21070229; row 104 produced the correct segments but omitted the OPEX allocation employee without a hard missing-evidence flag. |
| `OTHER` | 0 | — |
| **Total** | **50** | — |

The 24 `STALE_MASTER` cases are a source-data classification, not proof that the current local Manpower file is factually wrong. It means the clerk-reviewed allocation employee exists, but the frozen pipeline followed a different identity or allocation signal. A fresh Oracle export is the cleanest way to determine whether this is actual master drift or a resolver-policy problem.

## Recommended disposition

| Bucket | Recommended fix | Detail |
|---|---|---|
| `STALE_MASTER` | **Data refresh** | Obtain a fresh Oracle Manpower export from Qasim and rerun. Compare employee, manager, allocation status, CC, DIV, agency, and solution for the 24 affected truth employees. If the refreshed export still agrees with the current file, reclassify the residuals as resolver-policy changes. |
| `NOT_IN_MASTER` | **Master-data confirmation** | Laith/Qasim should add or confirm employees 1002686 and 1002566, including their CC/DIV/agency/solution and allocation status. |
| `MISSING_EVIDENCE` | **Evidence refresh first; pipeline change only where evidence already exists** | Upload/restore the missing approval email or OPEX form. If the files are already present but not matched, change [`scripts/run_v30.py`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3573), especially `stamp_missing_evidence_gate()`, `cascade_row_no_folder()`, and the reference/employee-filename fallback routing around `REFNO_FALLBACK_FLAG` and `EMP_FILENAME_FALLBACK_FLAG`. |
| `UNMAPPED_GL` | **No action for this batch** | No J26-1108 residual falls in this category. |
| `LLM_NONDETERMINISM` | **Pipeline code change** | Make account/employee outcomes deterministic after the LLM stage. For row 9, use `collect_family_annual_rows()`, `apply_family_annual_account_rule()`, and `stamp_verified_annual_home_segments()` in [`scripts/run_v30.py`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4308). For row 104, preserve the sponsorship/OPEX allocation employee during finalization rather than allowing a blank LLM employee result to win. |
| `OTHER` | **No action** | No residual assigned here. |

## Decision summary

- The headline score is internally consistent; there is no scoring-denominator discrepancy.
- The main accounting gap is not mapping coverage. It is that the pipeline fills 18 rows the clerk-reviewed baseline intentionally leaves blank because evidence is insufficient.
- The largest full-correctness gap is employee allocation: 31 employee-only errors, of which 24 involve employees already present in Manpower.
- Immediate external asks are:

  1. Fresh Oracle Manpower export from Qasim.
  2. Confirm/add employees 1002686 and 1002566.
  3. Restore approval/OPEX evidence for the 21 evidence-driven rows.
  4. Only after those refreshes, change deterministic annual-ticket and OPEX-allocation finalization logic for the remaining model-dependent residuals.
