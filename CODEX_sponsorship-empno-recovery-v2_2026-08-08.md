Implemented the sponsorship `emp_no` recovery fix without committing, deploying, running the pipeline, or invoking LLMs.

Files touched:

- [scripts/run_v30.py:2636](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2636)
- [tests/test_sponsor_allocation_rules.py:191](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_sponsor_allocation_rules.py:191)

Exact functional diff:

```diff
 if str(final.get("account", "") or "").strip() == "60307021":
-    final["_sponsorship_requesting_emp_no"] = requesting_no
+    resolved_emp_no = str(final.get("emp_no") or llm.get("emp_no") or "").strip()
+    final["_sponsorship_requesting_emp_no"] = (
+        requesting_no
+        if requesting_no
+        else resolved_emp_no if re.fullmatch(r"\d{6,7}", resolved_emp_no) else ""
+    )
```

The previous pre-seeded-field test was replaced with an actual `process_row_v25` path test:

```text
classifier requesting_emp_no=""
Call-2 emp_no="1001959"
account="60307021"
missing OPEX allocation form
→ final emp_no="1001959"
```

Explicit classifier requesters retain precedence; invalid or absent resolved employee numbers remain blank. Travel logic was untouched.

Test results:

- New regression plus unresolved blank test: **2 passed**
- Scorer suite: **12 passed**
- Full sponsorship + scorer run: **39 passed, 1 failed**
  - Unrelated existing real-PDF fixture failure: LAB-16 extraction omitted expected employee `1000414`.
- `git diff --check`: **passed**
