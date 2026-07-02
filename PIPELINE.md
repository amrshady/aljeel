# AlJeel Jawal AP Pipeline - Current State

Last verified against code on disk: 2026-06-29.

## TL;DR - Live Path

The live Jawal production path is portal/API -> deterministic cascade -> v30 exception handler -> AI consistency check -> Excel injection -> multi-employee split. The canonical runner is `scripts/run_v30.py`, but it does **not** run from raw inputs directly: the portal first runs `scripts/process_batch.py --suffix v15.11.2`, then runs `scripts/run_v30.py <BATCH_ID> --input-suffix v15.11.2`. `run_v30.py` imports live helper functions from `run_v16.py`, `run_v17.py`, `run_v24.py`, and `run_hybrid_v15_12.py`; their standalone `main()` paths are historical unless invoked manually. The final portal-downloadable split workbook is produced after v30 by `scripts/split_multi_emp.py`, not by `run_v30.py`.

## Entry Points / Runners

### Live production runner

- `scripts/run_v30.py` is the live allocation/exception runner. Its CLI is declared at `scripts/run_v30.py:3499-3511`; it loads the v15.11.2 cascade workbook at `scripts/run_v30.py:3565-3581`, writes `Spreadsheet-<BATCH>-FILLED-v30.xlsx` at `scripts/run_v30.py:3583-3588`, and writes `summary-v30.json` at `scripts/run_v30.py:4790-4824`.
- `run_v30.py` is a hybrid orchestrator. It imports:
  - v15.12 IO/writer helpers from `scripts/run_hybrid_v15_12.py` at `scripts/run_v30.py:92` and calls `v15.read_cascade_xlsx` / `v15.write_v15_12_xlsx` at `scripts/run_v30.py:3591` and `scripts/run_v30.py:4358`.
  - v16 resolver/classifier helpers from `scripts/run_v16.py` at `scripts/run_v30.py:97-120`.
  - v17 booking-group helpers from `scripts/run_v17.py` at `scripts/run_v30.py:122-134`.
  - v24 fraud/booking inline helpers from `scripts/run_v24.py` at `scripts/run_v30.py:146-153`.

### Deterministic cascade

- `scripts/process_batch.py` is the live Stage 1 deterministic cascade. The portal invokes it with `--suffix v15.11.2` at `scripts/droplet_api_flask.py:745-749` and `scripts/run_worker_v2.py:574-580`.
- Its CLI is at `scripts/process_batch.py:2612-2649`; the main function is `process_batch(...)` at `scripts/process_batch.py:832-855`.
- It reads `Spreadsheet-v4-input.xlsx` first, then `Spreadsheet.xlsx`, then legacy fallbacks at `scripts/process_batch.py:857-870`.

### Portal/API orchestration

There are two API surfaces:

- v1/SSE portal path: `dashboard/public/portal.html` calls `/api/process`, which the Cloudflare Worker proxies to `/process`. The Flask route is `scripts/droplet_api_flask.py:1322-1362`; the worker function is `_run_pipeline_worker` at `scripts/droplet_api_flask.py:669-916`.
- v2 persistent-run portal path: `dashboard/public/v2/run-trigger.js:21-41` calls `POST /api/v2/batches/<batch>/runs` via `dashboard/public/v2/api.js:37-46`. The Worker proxies `/api/v2/*` to droplet `/v2/*` at `dashboard/public/_worker.js:370-428`. Flask registers the v2 blueprint at `scripts/droplet_api_flask.py:1520-1524`; v2 spawns `scripts/run_worker_v2.py` at `scripts/droplet_api_v2.py:706-822`.

### Historical runners

The older `run_vNN.py` files are mostly historical standalone runners. Some are still live **as imported libraries** because `run_v30.py` imports their functions. Do not assume "latest modified" means "live runner"; `run_v16.py` was modified on 2026-06-29 and is partly live only through imported helpers.

| Script | Status today | Why / live use | Last modified |
| --- | --- | --- | --- |
| `scripts/process_batch.py` | LIVE Stage 1 | Portal calls it before v30 | 2026-06-28 12:09 |
| `scripts/run_v30.py` | LIVE Stage 2 runner | Portal calls it directly | 2026-06-29 07:44 |
| `scripts/run_v30_original.py` | legacy-dead/reference | Not imported by live path | 2026-06-05 13:02 |
| `scripts/run_v29.py` | legacy-dead | Not imported by v30 | 2026-06-05 08:46 |
| `scripts/run_v28.py` | legacy-dead | Not imported by v30 | 2026-06-05 06:39 |
| `scripts/run_v27.py` | legacy-dead | Not imported by v30 | 2026-06-05 06:12 |
| `scripts/run_v26.py` | legacy-dead | Not imported by v30 | 2026-06-03 07:36 |
| `scripts/run_v25.py` | legacy-dead | Not imported by v30 | 2026-06-01 15:00 |
| `scripts/run_v24.py` | library-imported + standalone legacy | v30 imports `apply_booking_groups_inline`, `run_fraud_detection`, helpers | 2026-05-27 22:00 |
| `scripts/run_v23.py` | legacy-dead | Not imported by v30 | 2026-05-27 19:20 |
| `scripts/run_v22.py` | legacy-dead | Not imported by v30 | 2026-05-27 19:09 |
| `scripts/run_v21.py` | legacy-dead | Not imported by v30 | 2026-05-27 18:31 |
| `scripts/run_v20.py` | legacy-dead | Not imported by v30 | 2026-05-27 18:14 |
| `scripts/run_v19.py` | legacy-dead | Not imported by v30 | 2026-05-27 17:47 |
| `scripts/run_v18.py` | legacy-dead | Not imported by v30 | 2026-05-27 21:51 |
| `scripts/run_v17.py` | library-imported + standalone legacy | v30 imports booking group functions/constants | 2026-06-10 03:23 |
| `scripts/run_v16.py` | library-imported + standalone legacy | v30 imports classifier/resolver/overlays/family helpers | 2026-06-29 07:27 |
| `scripts/run_hybrid_v15_12.py` | library-imported + standalone legacy | v30 uses reader/writer; standalone hybrid is historical | 2026-06-09 03:18 |
| `scripts/run_hybrid_v16.py` | legacy-dead | Not imported by live v30 path | 2026-05-26 03:52 |

## Portal Flow

The hosted dashboard is `finance.aljeel.accordpartners.ai`; the Worker comments identify the droplet tunnel as `https://aljeel-ap.accordpartners.ai` -> `localhost:5000` at `dashboard/public/_worker.js:1-20` and `dashboard/public/_worker.js:33-35`.

Current v1 pipeline stages in `scripts/droplet_api_flask.py:_run_pipeline_worker`:

1. Optional invoice conversion with `scripts/convert_jawal_invoice.py` (`scripts/droplet_api_flask.py:724-741`).
2. Stage 1 deterministic cascade: `python3 -u scripts/process_batch.py --batch ... --raw-dir ... --suffix v15.11.2` (`scripts/droplet_api_flask.py:745-749`).
3. Stage 2 v30 exception handler: `python3 -u scripts/run_v30.py <batch> --input-suffix v15.11.2` (`scripts/droplet_api_flask.py:755-762`).
4. Stage 2.5 document parser for fraud input: `qc/ai-poc/ai_document_parser.py` (`scripts/droplet_api_flask.py:764-817`).
5. Stage 3 AI consistency check: `qc/ai-poc/ai_fraud_detector.py` with `AI_POC_BATCHES=<batch>` (`scripts/droplet_api_flask.py:819-831`).
6. Stage 4 Excel injection: `scripts/inject_fraud_to_excel.py <batch>` (`scripts/droplet_api_flask.py:833-841`).
7. Stage 4.5 portal JSON rebuild: `scripts/build_j788_review_v30.py --batch <batch>` (`scripts/droplet_api_flask.py:843-853`).
8. Stage 5 split output: `scripts/split_multi_emp.py <v30.xlsx> <v30-SPLIT.xlsx>` (`scripts/droplet_api_flask.py:855-864`).
9. Copy full/split XLSX to `dashboard/public/outputs` and deploy Cloudflare (`scripts/droplet_api_flask.py:866-906`).

The v2 worker performs the same command sequence, but stores run state/artifacts and skips the v1 Cloudflare deploy (`scripts/run_worker_v2.py:574-655`). It snapshots split output, `summary-v30.json`, evidence tree, log, and inconsistency report in `_finalize_success` (`scripts/run_worker_v2.py:375-430`).

## Stage-by-Stage Run Flow

Example CLI-equivalent production run:

```bash
python3 scripts/process_batch.py --batch batches/jawal-J26-954 --raw-dir <resolved_raw_dir> --suffix v15.11.2
python3 scripts/run_v30.py J26-954 --input-suffix v15.11.2
python3 qc/ai-poc/ai_document_parser.py <source_invoice> --raw-out qc/ai-poc/raw/j26-954-ai-parsed.json --force
AI_POC_BATCHES=J26-954 python3 qc/ai-poc/ai_fraud_detector.py
python3 scripts/inject_fraud_to_excel.py J26-954
python3 scripts/build_j788_review_v30.py --batch J26-954 --raw-dir <resolved_raw_dir>
python3 scripts/split_multi_emp.py batches/jawal-J26-954/output/Spreadsheet-J26-954-FILLED-v30.xlsx batches/jawal-J26-954/output/Spreadsheet-J26-954-FILLED-v30-SPLIT.xlsx
```

### Stage 1: `process_batch.py`

- Loads master/reference data from `qc/master-data/Aljeel_Lookups-v2.xlsx` by default (`scripts/process_batch.py:2614-2618`) through `cost_center_resolver.load_master_data` (`scripts/process_batch.py:872-897`).
- Resolves employees with `employee_resolver_v2.resolve_employee` at `scripts/process_batch.py:1030-1043`. Resolver layers are documented in `scripts/employee_resolver_v2.py:1-19`; the actual cascade is `resolve_employee` at `scripts/employee_resolver_v2.py:1359-1509`, including L0 direct employee no, PaxOverrides, L1 form emp no, L1.5 email, L2 msg filename, L3 ticket-folder scan, L4/GDS fuzzy, L5 phonetic, L6 Arabic, L7 approver/subordinate, L7.5 reverse-manager, L7.7 email LLM, L8 cache, and L9 sponsorship.
- Builds base allocation with `cost_center_resolver.resolve_line` (`scripts/cost_center_resolver.py:545-620`) and `classify_account` (`scripts/cost_center_resolver.py:379-450`).
- Runs allocation resolver for "Need to allocate" employees at `scripts/process_batch.py:1221-1259`.
- Runs trip purpose classification and family detection; CHD family clusters can flip to `21070229` at `scripts/process_batch.py:1479-1506`.
- Runs family emp-no unification at `scripts/process_batch.py:1508-1710`.
- Runs within-batch and cross-batch catches. Cross-batch catches are written at `scripts/process_batch.py:1778-1810`.
- Writes output workbook and debug/status columns at `scripts/process_batch.py:1962-2324`.

### Stage 2: `run_v30.py`

- Loads `Spreadsheet-<BATCH>-FILLED-v15.11.2.xlsx` from the batch `output/` directory (`scripts/run_v30.py:3565-3581`).
- Builds evidence folder indexes and personal-contribution indexes at `scripts/run_v30.py:3600-3608`.
- Routes rows to LLM when `_needs_classification_v26` says yes. v30 adds unconditional sponsorship review for account `60307021` at `scripts/run_v30.py:3610-3628`.
- Initializes `hybrid_rows` from cascade output at `scripts/run_v30.py:3636-3649`.
- Applies verified Ref.No employee locks at `scripts/run_v30.py:3665-3671` and missing-evidence hard gate at `scripts/run_v30.py:3673-3691`.
- Runs threaded LLM resolution through `process_row_v25` at `scripts/run_v30.py:3697-3799`.
- `process_row_v25` calls v16 `classify_row`, optionally corrects the evidence folder, then uses master shortcuts or `full_resolve_row` (`scripts/run_v30.py:1289-1599`). Its local imports from `run_v16.py` are at `scripts/run_v30.py:1315-1320`.
- Applies family cluster unification via v16 helper at `scripts/run_v30.py:3802-3804`.
- Applies PC overlay to unresolved rows with PC evidence at `scripts/run_v30.py:3806-3865`.
- Applies PC-family dependent emp-no rule at `scripts/run_v30.py:3867-3871`.
- The NTS hotel PC overlay block exists but is disabled by `for i, c in []` at `scripts/run_v30.py:3873-3957`.
- Converts employee conference registration rows from sponsorship to training `60308009` at `scripts/run_v30.py:3959-4011`.
- Applies deterministic OPEX event-folder sponsorship overlay at `scripts/run_v30.py:4013-4162`.
- Extracts OPEX serials from folder/PDF names at `scripts/run_v30.py:4165-4191`.
- Applies family-folder emp_no rule at `scripts/run_v30.py:4193-4200`.
- Applies family annual account rule and Mai/Sanad status evaluation at `scripts/run_v30.py:4202-4240`.
- Applies own approved-form trip-purpose precedence and sibling inheritance at `scripts/run_v30.py:4242-4261`.
- Reasserts `Trip Account Override` at confidence >= 0.7 at `scripts/run_v30.py:4263-4304`.
- Applies bundled/shared PDF trip-purpose inheritance, cost-center override, and OPEX-email-only review state at `scripts/run_v30.py:4306-4336`.
- Applies sponsorship event segments and ancillary event allocation, remaps methods, and writes the workbook through `run_hybrid_v15_12.write_v15_12_xlsx` at `scripts/run_v30.py:4338-4359`.
- Post-write stamps include missing-evidence output, OPEX/email-only output, sponsorship form columns, trip-purpose columns, OPEX Serial, flags, Mai/Sanad statuses, and location rewrite (`scripts/run_v30.py:4463-4694`).
- Booking-group propagation runs through `apply_booking_groups_inline_v25` at `scripts/run_v30.py:4696-4698`. That wraps v17/v24 logic, reading/writing patches and `catches-booking-groups-v30.json` at `scripts/run_v30.py:2989-3069`.
- Final GL descriptions are synced at `scripts/run_v30.py:4699-4700`.
- Sponsorship descriptions are prefixed with OPEX serial at `scripts/run_v30.py:4702-4743`.
- Deterministic fraud/consistency detection from v24 runs at `scripts/run_v30.py:4745-4756`.
- Step trace, auto-score, and summary are written at `scripts/run_v30.py:4758-4824`.

### End Split

The final employee split is **not** part of `run_v30.py`. It is portal Stage 5:

- v1: `scripts/droplet_api_flask.py:855-864`.
- v2: `scripts/run_worker_v2.py:645-652`.
- Implementation: `scripts/split_multi_emp.py:198-328`, function `split_multi_emp`.

Rules:

- Only rows whose `Employee No` contains comma-separated employees are split (`scripts/split_multi_emp.py:224-230`).
- `*Amount` is divided equally by `split_amount`; rounding remainder goes to the last row (`scripts/split_multi_emp.py:136-141`, `scripts/split_multi_emp.py:233-248`).
- `*Invoice Amount` is copied unchanged to every split row because it is header-level (`scripts/split_multi_emp.py:233-250`).
- Each employee row gets Manpower-derived Location/CC/DIV/Solution/Agency; event sponsorship rows preserve event agency if already present (`scripts/split_multi_emp.py:252-300`).
- Output is `Spreadsheet-<BATCH>-FILLED-v30-SPLIT.xlsx`; original v30 workbook is left untouched (`scripts/split_multi_emp.py:1-8`).

## Sponsorship Handling

Current sponsorship behavior is split across Stage 1 and Stage 2:

- Stage 1 account classification uses `cost_center_resolver.classify_account`: OPEX/event refs return `60307021` (`scripts/cost_center_resolver.py:398-401`), external not-in-Manpower with OPEX returns `60307021` (`scripts/cost_center_resolver.py:430-437`), otherwise external travel defaults to `60301003`.
- OPEX reference segment defaults live in `OPEX_REF_SEGMENTS` (`scripts/cost_center_resolver.py:73-84`), with CRM/HF/EP/SIS/DMS mappings.
- Stage 1 explicitly overrides OPEX sponsorship segments from event refs at `scripts/process_batch.py:1198-1219`.
- Shared-OPEX sponsorship is applied after catches at `scripts/process_batch.py:1819-1835`; it sets account `60307021` and uses `_apply_shared_opex_sponsor_segments` (`scripts/process_batch.py:514-546`) to charge to the requesting employee where possible.
- Stage 2 v30 routes all cascade `60307021` rows to review (`scripts/run_v30.py:3610-3628`), then can confirm sponsorship, flip to training/PC, or adjust segments.
- v30 sponsorship event-segment overlay functions are `_sponsorship_event_folder_for_row`, `apply_opex_email_only_review_state`, and `apply_sponsorship_event_segments` (`scripts/run_v30.py:937-1156`).

### Labadi agency rule truth

The new Labadi sponsorship agency rule currently lives in `scripts/run_v16.py`:

- `resolve_sponsorship_codes_from_agency(form_agency, manpower)` at `scripts/run_v16.py:532-589`.
- `_apply_sponsorship_agency_codes` at `scripts/run_v16.py:592-606`.
- `resolve_sponsorship_from_master(..., form_agency="")` at `scripts/run_v16.py:609-638`.
- `process_row` applies the agency rule after LLM and after forced sponsorship at `scripts/run_v16.py:1099-1105` and `scripts/run_v16.py:1189-1195`.

Does v30 consume it? **Partially, yes.** `run_v30.py` imports `resolve_sponsorship_from_master`, `full_resolve_row`, and related v16 helpers at `scripts/run_v30.py:97-120`, and `process_row_v25` imports/calls them at `scripts/run_v30.py:1315-1320`, `scripts/run_v30.py:1493`, and `scripts/run_v30.py:1545-1578`. Therefore edits to those imported v16 helper functions are live for v30-routed rows.

But edits only inside `run_v16.py:main()` are **not** live for portal production. Example: standalone v16 blanked cascade sponsorship emp_no at `scripts/run_v16.py:1343-1351`, but v30 has its own reversed Labadi Rule 1 comments and behavior at `scripts/run_v30.py:3659-3663`.

## Fraud / Consistency / QA

### Deterministic within/cross-batch checks

- `scripts/process_batch.py` runs within-batch catches and writes `catches-within-batch.json` at `scripts/process_batch.py:1773-1776`.
- It runs cross-batch fraud, writes `catches-cross-batch.json`, and updates `cache/cross_batch_history.json` at `scripts/process_batch.py:1778-1810`.
- `scripts/cross_batch_fraud.py` documents checks at `scripts/cross_batch_fraud.py:1-20`: duplicate ticket, potential rebooking, frequent traveler over budget, passenger amount pattern, unusual booking velocity. History file is `cache/cross_batch_history.json` (`scripts/cross_batch_fraud.py:30-31`).
- `run_v30.py` also calls v24 `run_fraud_detection` and writes/copies `fraud-watch-v30.json` at `scripts/run_v30.py:4745-4756`. The implementation is `scripts/run_v24.py:123-181`.

### Excel status columns

`process_batch.py` writes the three requested status columns as part of Block 3:

- Headers: `Evidence Folder Status`, `Approval Email Status`, `Self-Approval Status` at `scripts/process_batch.py:1993-2027`.
- Values are computed at `scripts/process_batch.py:2203-2205`:
  - Evidence: `SHARED_OPEX`, `MISSING`, or `OK`.
  - Approval Email: `CORRUPT_OR_EMPTY`, `MISSING`, `FORM_MISSING`, or `OK`.
  - Self-Approval: `SELF_APPROVED` or `OK`.
- Values are written at `scripts/process_batch.py:2210-2245` and styled at `scripts/process_batch.py:2256-2304`.

### AI consistency / fraud detector

- Portal runs `qc/ai-poc/ai_document_parser.py` first, then `qc/ai-poc/ai_fraud_detector.py` with `AI_POC_BATCHES=<batch>` (`scripts/droplet_api_flask.py:764-831`, `scripts/run_worker_v2.py:588-628`).
- `ai_fraud_detector.py` requires `qc/ai-poc/raw/<batch>-ai-parsed.json` (`qc/ai-poc/ai_fraud_detector.py:648-655`) and loads the v30 workbook (`qc/ai-poc/ai_fraud_detector.py:658-680`).
- Gemini output schema is `GeminiRowVerdict` with `verdict`, `primary_category`, `secondary_categories`, `value_at_risk_sar`, `evidence`, `reasoning`, `confidence` at `qc/ai-poc/ai_fraud_detector.py:110-150`.
- It saves `qc/ai-poc/<batch-lower>-fraud-ai-v162.json` at `qc/ai-poc/ai_fraud_detector.py:1638-1646` and `qc/ai-poc/ai_fraud_detector.py:1847-1862`.
- `scripts/inject_fraud_to_excel.py` reads that JSON and appends columns `AI Consistency Verdict`, `AI Consistency Category`, `AI Consistency Notes` to `Spreadsheet-<BATCH>-FILLED-v30.xlsx` (`scripts/inject_fraud_to_excel.py:8-17`, `scripts/inject_fraud_to_excel.py:43-46`, `scripts/inject_fraud_to_excel.py:74-120`).
- Note naming mismatch: user-facing language sometimes says "AI Fraud Verdict/Category/Reasoning"; the code currently writes `AI Consistency Verdict/Category/Notes`.

### Inconsistencies report

- v2 finalization runs `scripts/build_inconsistencies_report.py <BATCH_ID>` (`scripts/run_worker_v2.py:311-372`).
- It outputs `Inconsistencies-Report-<BATCH_ID>.xlsx` and `.md` (`scripts/build_inconsistencies_report.py:1-10`).
- It reads row context from `Spreadsheet-<BATCH>-FILLED-v30.xlsx`, fraud-watch JSON, `catches-within-batch.json`, `catches-cross-batch.json`, and `catches-booking-groups-v30.json` (`scripts/build_inconsistencies_report.py:105-181`).
- `build_report` returns counts, flagged rows, SAR at risk, and GL coverage (`scripts/build_inconsistencies_report.py:515-568`).

### QA agent

- QA is read-only and separately triggered through `/qa-run` (`scripts/droplet_api_flask.py:1364-1409`).
- `scripts/qa_agent.py` loads input spreadsheet, final v30 output, AI fraud JSON, portal review JSON, knowledge/rules, and evidence index (`scripts/qa_agent.py:563-615`).
- It writes `batches/jawal-<BATCH>/output/qa-report-<BATCH>-<timestamp>.json` (`scripts/qa_agent.py:628-635`).
- Caution: `qa_agent.py` has stale GL prose saying sponsorship emp_no must be blank at `scripts/qa_agent.py:65-71`. That conflicts with current Labadi Rule 1 in live pipeline code.

## Outputs

For a normal portal run, expect:

- `batches/jawal-<BATCH>/output/Spreadsheet-<BATCH>-FILLED-v15.11.2.xlsx` from `process_batch.py`.
- `batches/jawal-<BATCH>/output/summary-v15.11.2.json` from `process_batch.py`.
- `batches/jawal-<BATCH>/output/catches-within-batch.json` and `catches-cross-batch.json` from `process_batch.py`.
- `batches/jawal-<BATCH>/output/Spreadsheet-<BATCH>-FILLED-v30.xlsx` from `run_v30.py`.
- `batches/jawal-<BATCH>/output/summary-v30.json` from `run_v30.py`.
- `batches/jawal-<BATCH>/output/step-trace-v30.jsonl` from `run_v30.py` if rows were routed to LLM.
- `batches/jawal-<BATCH>/output/fraud-watch-v30.json` from `run_v30.py` / v24 fraud helper.
- `batches/jawal-<BATCH>/output/catches-booking-groups-v30.json` from v30 booking-group inline wrapper.
- `batches/jawal-<BATCH>/output/score-v30.md` when a truth file exists (`scripts/run_v30.py:4766-4788`).
- `qc/ai-poc/raw/<batch-lower>-ai-parsed.json` from document parser.
- `qc/ai-poc/<batch-lower>-fraud-ai-v162.json` from AI consistency check.
- `batches/jawal-<BATCH>/output/Spreadsheet-<BATCH>-FILLED-v30-SPLIT.xlsx` from `split_multi_emp.py`.
- v2 runs also snapshot artifacts under `state/runs/<BATCH>/<run_id>/`, including split XLSX, summary, evidence tree, report, and log (`scripts/run_worker_v2.py:375-430`).
- `Inconsistencies-Report-<BATCH>.xlsx` and `.md` are produced during v2 finalize or explicit report generation.

## GL Account Map / Current Business Rules

Core account rules live in `scripts/cost_center_resolver.py:379-450`:

- `60307021` - Sponsoring Expenses. Triggered by OPEX/event refs (`scripts/cost_center_resolver.py:398-401`) and external OPEX/event rows (`scripts/cost_center_resolver.py:430-437`).
- `60301003` - S&M / standard Travel Tickets. Default for non-G&A employees (`scripts/cost_center_resolver.py:449-450`) and external non-OPEX travel (`scripts/cost_center_resolver.py:433-437`).
- `60301004` - G&A travel. DIV `888` or `190` (`scripts/cost_center_resolver.py:86-88`, `scripts/cost_center_resolver.py:445-447`). v30 also overrides specific CCs to G&A at `scripts/run_v30.py:160-182`.
- `60308009` - Training Expenses. Triggered by training/course/certification text (`scripts/cost_center_resolver.py:418-421`) and by v30 employee registration correction (`scripts/run_v30.py:3959-4011`).
- `60308007` - Recruitment Fees. Triggered by new employee/new hire/candidate/interview or HR approver Elham/Hessa (`scripts/cost_center_resolver.py:403-411`).
- `21070229` - Accrued Employee Annual Tickets / personal contribution. Annual leave/ticket keywords and personal travel route here; old `11034013` personal travel is explicitly killed (`scripts/cost_center_resolver.py:413-428`). v30 family annual rule also uses this account (`scripts/run_v30.py:4202-4232`).
- `21070227` - GE warranty/project (`scripts/cost_center_resolver.py:439-443`).
- `11110001` - Holding Receivable appears in valid review maps and v30 skip accounts, but no primary classifier rule was found in the live Stage 1/Stage 2 account classifier paths (`scripts/run_v30.py:184-192`, `scripts/build_j788_review_v30.py:385-392`).

Segment defaults:

- Combo format is `Company-Location-Account-CostCenter-DIV-Solution-Agency-Project-Intercompany-Future1` (`scripts/cost_center_resolver.py:1-9`).
- Static segments: company `03`, project `00000`, intercompany `00`, future1 `000000` (`scripts/cost_center_resolver.py:38-44`).
- OPEX defaults by event key: CRM/HF/EP -> CC `160014`, DIV `170`, Agency `10072`, solution CRM `10017`, HF `10050`, EP `10064`; SIS -> `160011/196/10043/00000`; DMS -> `160013/192/10202/00000`; default sponsor -> `160014/170/10072/00000` (`scripts/cost_center_resolver.py:73-84`).

## Known Fragmentation / Tech Debt

- The live runner is `run_v30.py`, but live behavior is distributed across `process_batch.py`, `run_v30.py`, imported v16/v17/v24 helpers, AI fraud scripts, and split script. A future editor must check the portal command chain before patching.
- `run_v16.py` is a trap: helper functions imported by v30 are live; standalone `run_v16.py:main()` behavior is not portal production. A change to v16 `main()` can be dead code, while a change to v16 `resolve_sponsorship_from_master` can affect v30.
- `run_v30.py` has copied/forked logic from v25/v26/v30 while importing older modules. Function names such as `process_row_v25` and comments referencing v26/v29 are live inside v30.
- `run_v30.py` contains disabled code (`for i, c in []`) for NTS hotel PC overlay at `scripts/run_v30.py:3873-3957`; editing it without enabling the loop has no runtime effect.
- `run_v24.py` is not a live runner, but its `run_fraud_detection` and helper functions are live through v30 imports.
- `run_v17.py` is not a live runner, but booking-group functions and constants are live through v30.
- `run_hybrid_v15_12.py` is not the live hybrid runner, but its XLSX reader/writer is live and controls which method names actually get persisted.
- The portal has v1 and v2 paths. v1 deploys Cloudflare at the end; v2 snapshots state and skips the v1 deploy. Both run the same core pipeline commands.
- Naming is inconsistent: code writes `AI Consistency Verdict/Category/Notes`, while some docs/UI references may say AI Fraud Verdict/Category/Reasoning.
- `qa_agent.py` contains stale GL guidance saying sponsorship emp_no must be blank; live Labadi Rule 1 now keeps the requestor/responsible employee number on sponsorship/family rows.
- `build_inconsistencies_report.py` loads `summary-v15.11.2.json` for summary context while reporting v30 output (`scripts/build_inconsistencies_report.py:515-519`). This may be intentional historical context, but it can mislead if read as v30 summary.
- There is no git repository at this workspace root, so last-modified dates above are filesystem metadata, not commit history.

