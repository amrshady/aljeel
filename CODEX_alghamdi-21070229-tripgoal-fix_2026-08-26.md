Implemented only in [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py). No deployment or golden-gate run.

Precise diff:

- Lines 576–599:
  - Before: approved-form parsing scanned only `folder.glob("*.msg")`.
  - After: scans `fea.iter_evidence_files(folder)` and filters through `fea.is_outlook_message()`.
  - Effect: reads J26-1220’s extensionless CDF Outlook email, allowing extraction of:
    - Award: `Business Trip`
    - Trip Goal: `Technical Support (Periodic & Preventative Maintenance)`

- Lines 617–692:
  - Added `business_goal_only=False` mode to existing `apply_own_form_trip_purpose_precedence()`.
  - Reuses `classify_trip()` and requires:
    - `trip_purpose == "BUSINESS_TRIP"`
    - an existing `form_trip_goal_business…` signal
  - Marks qualifying rows with `_business_trip_goal_precedence`.
  - Existing DIV/CC routing remains unchanged: `60301003` or `60301004` through `CC_ACCOUNT_OVERRIDE`.

- Lines 4167–4174:
  - Existing itinerary-PDF sibling inheritance now propagates the business-goal precedence marker.
  - This keeps verified sibling legs on the same purpose-derived travel account.

- Lines 4381–4462:
  - `collect_family_annual_rows()` excludes positively proven business-goal rows from both:
    - explicit family-folder detection
    - CHD/INF employee-group detection
  - `apply_family_annual_account_rule()` has a defensive second guard before writing `21070229`.

- Lines 6184–6260:
  - Added an early business-goal-only classification and sibling-inheritance pass before `fam_rows` is collected and locked.
  - Preserved the original general own-form pass after family routing, so genuine annual/personal and non-business classifications retain their previous ordering.

Exact Personal Contribution trigger:

- [scripts/run_v16.py:114](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:114), imported by `run_v30.py`, turns the phrase in an Outlook filename/subject/body into a `pc_index` entry.
- [scripts/run_v30.py:807](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:807) contains the explicit prompt instruction `Set account=21070229`, although this local helper currently has no active caller.
- The active deterministic write is [scripts/run_v30.py:5862](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5862): presence in `pc_index` causes `account = "21070229"` at line 5877 for qualifying unresolved rows.
- The older LLM-reasoning override around line 2705 is disabled by `is_pc_signal = False`.
- `fam_rows` itself is not created from the phrase; it comes from family-folder or CHD/INF grouping. The bug persisted because that later pass ran before own-form precedence and locked qualifying rows.

Observed affected rows:

- J26-1220 output row 37, ticket `4861179529`: `21070229 → 60301003`.
- J26-1220 output row 38, ticket `4861179530`: remains `60301003`, but now explicitly inherits the same business purpose/account from the itinerary containing both tickets.
- No genuine family-annual row changes unless it contains a positively classified business Trip Goal. Subject text, award name alone, or a Personal Contribution email alone cannot activate suppression.

Verification performed:

- Real email parsed successfully with the exact subject and Trip Goal.
- Existing classifier returned `BUSINESS_TRIP`, confidence `1.0`, with `form_trip_goal_business`.
- Isolated two-leg test produced `60301003 / 60301003` and an empty `fam_rows`.
- `py_compile` and `git diff --check` passed.
- Golden gate was not run. No deployment performed.
