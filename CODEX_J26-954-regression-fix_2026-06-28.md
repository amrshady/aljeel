Implemented and verified.

**Regression Point**
The older `process_batch.py` baselines had the correct two-step wiring:

`parse_form(...)` -> `classify_trip(..., form_data=trip_form, ...)` -> apply `trip_cls.account_override` when confidence >= 0.7.

Relevant current equivalent: [scripts/process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1281).

The regression is two-layered:

- Current `process_batch.py` added a post-QC shared-OPEX overlay at [scripts/process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1819), which can set `account=60307021` from shared evidence after trip classification.
- v16/v30 introduced the master shortcut that returns directly when an employee number is found in evidence, bypassing full form trip-purpose resolution: [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1106). v30 also added shared-OPEX fallback at [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1010).

For ALEM, v30 trace showed `master_shortcut_employee` on the own PC folder, returning `60301003` before the structured form trip-goal training rule could drive `60308009`.

**Fix**
Added a general precedence pass in [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:316):

- Only uses a dedicated/range ticket folder whose folder name owns the row ticket.
- Parses approved PC/OPEX `.msg` form with `parse_form`.
- Runs `classify_trip`.
- If the classifier gives a confident account override, that row’s own form beats shared-OPEX, bundled/shared PDF inheritance, and master shortcuts.
- Rows without their own form still keep v30 shared-OPEX/family/event behavior.

Wired at [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3617), before inherited trip-purpose/account logic. Added column stamping at [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:458).

Added regression test: [tests/test_own_form_trip_precedence.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_own_form_trip_precedence.py:39). It discovers a training PC form from evidence and asserts classifier-driven account precedence, with no ticket/person/employee hardcoding.

**Verification**
Commands run:

- `python3 -m py_compile scripts/run_v30.py tests/test_own_form_trip_precedence.py`
- Direct regression assertion passed. `pytest` is not installed.
- `python3 scripts/run_v30.py J26-954 --input-suffix v15.11.2`
- `python3 scripts/split_multi_emp.py ...v30.xlsx ...v30-SPLIT.xlsx qc/master-data/Aljeel_Lookups-v2.xlsx`

ALEM proof in split output:

- Description: `ALEM/AHMED MR - JED RUH (4860132149)`
- Employee No: `1001811`
- Trip Purpose: `TRAINING`
- Confidence: `0.92`
- Account: `60308009`
- Combo: `03-10100-60308009-160012-194-00000-10153-00000-00-000000`

**Labadi Counts**
Compared against immediate pre-rerun v30 backup, split the same way:

- Comparable rows before: `116`
- Combo matches before: `97`
- Combo matches after: `98`
- Fixed: `1` - ALEM
- Previously-correct comparable rows regressed: `0`
- Newly diverged from Labadi: none in comparable rows

Regenerated: [diff-vs-labadi-v3.csv](/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-954/output/diff-vs-labadi-v3.csv).

**Diff Inventory**
Code/test changed:

- `scripts/run_v30.py`
- `tests/test_own_form_trip_precedence.py`

Batch scratch outputs regenerated only under `batches/jawal-J26-954/output/`, plus run cache/history artifacts from local execution:

- `Spreadsheet-J26-954-FILLED-v30.xlsx`
- `Spreadsheet-J26-954-FILLED-v30-SPLIT.xlsx`
- `diff-vs-labadi-v3.csv`
- `summary-v30.json`, `score-v30.md`, `step-trace-v30.jsonl`
- `fraud-watch-v24.json`, `catches-booking-groups-v30.json`
- `cache/cross_batch_history.json`, msg parse cache files, Python `__pycache__`

No deploy performed. No hardcoded ticket numbers, employee IDs, names, allowlists, or per-row overrides were added.
