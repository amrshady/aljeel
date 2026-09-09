Implemented the J26-1108 sponsorship-form indexing fix using TDD. No deployment, batch run, artifact regeneration, or golden/truth modification was performed.

### Step 1 — Red tests

Added [test_j26_1108_sponsoring_form_promotion.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_j26_1108_sponsoring_form_promotion.py).

Initial result:

```text
FFFF
4 failed in 1.01s
```

Failures confirmed:

- `APPROVED-OPEX-HF-2026-28-J-2026-141.pdf` was not indexed.
- Content-recognized `0094.pdf` was not indexed.
- No authoritative post-overlay promotion existed for exact form references.

### Step 2 — Fix

Updated [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2061):

```diff
- for filename in filenames:
-     if not re.match(r"OPEX-.*\.pdf", filename, re.IGNORECASE):
-         continue
+ for pdf_path in _find_opex_pdfs(raw_root):
```

The index still requires a parsed allocation containing both an employee number and amount.

Added `_apply_authoritative_sponsoring_form_promotions()`:

```diff
+ require exact normalized Invoice Ref == indexed form event key
+ account = "60307021"
+ emp_no = ""
+ location = ""
+ preserve _sponsoring_form_folder as _evidence_folder
```

It runs immediately before the existing late passes:

```diff
+ _apply_authoritative_sponsoring_form_promotions(...)
  apply_sponsorship_allocations(...)
  apply_sponsorship_event_segments(...)
```

Clearing location intentionally routes it through the existing sponsorship/manpower location fallback after allocation, producing `20100`; no special-case location was hard-coded.

Files touched:

- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py)
- [tests/test_j26_1108_sponsoring_form_promotion.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_j26_1108_sponsoring_form_promotion.py)

### Step 3 — Verification

New tests:

```text
5 passed
```

The two-row synthetic regression verifies:

```text
4860576027 | HF-2026-28
60307021 | 160014-170-10050-10072 | 1002483 | 20100

4860576079 | CRM-2026-42
60307021 | 160014-170-10017-10072 | 1001959 | 20100
```

Focused sponsorship regression suite:

```text
41 passed, 1 deselected in 2.37s
```

This includes:

- J26-1140 allocation-before-segment ordering.
- J26-1140 exact-folder binding guard.
- Existing sponsorship allocation rules.
- Jawal sponsorship guards.
- Employee-not-found sponsorship guards.

A broader focused run produced:

```text
45 passed, 2 failed
```

Both failures are unrelated external-fixture issues:

- Mounted LAB scan OCR currently omits employee `1000414`.
- Existing J26-1108 truth workbook column discovery lacks the expected `distribution` column.

Neither fixture was changed or re-baselined. `python3 -m py_compile` and `git diff --check` pass. Existing unrelated worktree changes were left untouched.

[status: done rc=0]
