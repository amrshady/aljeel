Verdict: do not spend on the J26-1108 run expecting sponsorship `emp_no` 19/19. The current fix does not recover the three CRM-2026-42 rows by static code trace.

### Q1 — Critical dependency

Verdict: **(c) unlikely** to recover sponsorship `emp_no` to 19/19.

For CRM-2026-42 rows 58–60 / tickets `4860576077–79`:

1. Classification receives the CRM-2026-42 folder, but historical traces show:

   - `requesting_emp_no = ""`
   - Call 2 independently returns `emp_no = "1001959"`

2. The code copies only `requesting_no` into the private field:

   ```python
   requesting_no = classify.get("requesting_emp_no", "").strip()
   ...
   final["_sponsorship_requesting_emp_no"] = requesting_no
   ```

   See [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2635).

3. It does **not** copy `llm["emp_no"]` into `_sponsorship_requesting_emp_no`. Therefore the historical Call-2 discovery of `1001959` does not populate the field used by the new fallback.

4. The late email-only overlay recognizes CRM-2026-42, changes the account to sponsorship, and clears segments, but does not derive or set `_sponsorship_requesting_emp_no`; see [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1575).

5. The overlay path that can set the private field searches message bodies for an explicit seven-digit employee number; see [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5995). That path did not set it for these rows in the existing trace.

6. The late allocation pass finds no OPEX PDF and executes:

   ```python
   requesting_emp_no = final.get("_sponsorship_requesting_emp_no", "")
   final["emp_no"] = requesting_emp_no if valid else ""
   ```

   See [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2121).

Thus, at fallback time, the private field can—and for the evidenced CRM-2026-42 execution does—remain empty. The fallback consequently writes blank, not `1001959`.

The new test only supplies `_sponsorship_requesting_emp_no = "1001959"` directly. It proves preservation after population, not that the real email-only path performs that population.

### Q2 — Gate safety

Verdict: the primary gate remains hard, but the J26-788 artifact gate is **not** hard.

- `set -euo pipefail` remains intact at [run_jawal_batch.sh](/home/clawdbot/.openclaw/workspace/aljeel/PROCESS/run_jawal_batch.sh:10).
- Pipeline exit propagation remains intact.
- No trap, global `set -e`, or unrelated failure handling was removed.
- J26-1108 primary gate failure produces a non-zero script exit. With `pipefail` and no conditional wrapper, the failing pipeline may exit immediately even before the explicit `PIPESTATUS`/`die`, but either way it fails hard.
- J26-788 does **not** fail hard:

  ```bash
  python3 .../jawal_golden_check.py | tee ... ||
      log "⚠ ... returned non-zero"
  ```

  The `|| log` consumes the failure and normally returns success. See [run_jawal_batch.sh](/home/clawdbot/.openclaw/workspace/aljeel/PROCESS/run_jawal_batch.sh:134).

Therefore the precise answers are:

- J26-1108 primary failure: **yes, non-zero**.
- J26-788 artifact failure: **no, warning only**.
- Accidental control-flow weakening elsewhere: **none found**.
- Removed J26-640 validation: it was already warning-only, so its removal did not eliminate a hard gate, though it did eliminate that regression check entirely.

Shell syntax validation passed.

### Q3 — Collateral damage and tests

Relevant suite result: **53 passed, 1 failed**.

| Test file | Result |
|---|---:|
| `test_sponsor_allocation_rules.py` | 27 passed, 1 failed |
| `test_score_against_truth_j26_1108.py` | 12 passed |
| `test_employee_not_found_sponsorship_guard.py` | 4 passed |
| `test_jawal_tax_and_sponsorship_guard.py` | 3 passed |
| `test_structural_allocation_rules.py` | 7 passed |

The failure was an existing real scanned LAB-form OCR/extraction expectation: employee `1000414` was absent from extracted allocations. It exercises allocation extraction, not either recent changed line, so it is not evidence that the sponsorship fallback or scorer refactor caused a regression—but the requested suite is not fully green.

Specific safeguards:

- “No requesting employee resolved → stays blank”: **confirmed passing** at [test_sponsor_allocation_rules.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:178).
- Valid private requester survives missing allocation table: **confirmed passing**, but synthetic/manual population only.
- Non-sponsorship/travel restoration: **confirmed passing** at [test_sponsor_allocation_rules.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:481).
- The sponsorship change is confined to the `account == 60307021` allocation path. Travel `emp_no` resolution was not changed.
- Scorer refactor: all 12 dedicated J26-1108 tests passed; no static/test regression found.

### Overall decision

**Confidence that a new J26-1108 run will show sponsorship `emp_no` 19/19: low.**

The likely outcome is that the same three CRM-2026-42 rows remain blank, because `1001959` is discovered as the resolved `emp_no` but is not transferred into the private requester field consumed by the new fallback.
