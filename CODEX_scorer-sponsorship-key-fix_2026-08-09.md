Implemented the scorer-only normalization fix. No truth fixture, baseline, or pipeline files were modified; `run_v30.py` was not run.

Changed function: [`_logical_description()` at line 318](</home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:318>).

```diff
diff --git a/qc/score_against_truth.py b/qc/score_against_truth.py
index 8b6e260..acd278b 100755
--- a/qc/score_against_truth.py
+++ b/qc/score_against_truth.py
@@ -317,9 +317,13 @@ def classify_truth_row(row: TruthRow) -> Literal["sponsorship", "travel"]:

 def _logical_description(row: BaseRow) -> str:
     text = _norm_text(row.description)
-    serial = _norm_text(row.opex_serial)
-    if serial and text.startswith(serial):
-        text = text[len(serial):].lstrip(" -–—:|/")
+    prefixes = (_norm_text(row.opex_serial), _norm_text(_norm_ref(row.invoice_ref)))
+    for prefix in prefixes:
+        if prefix:
+            match = re.match(rf"^{re.escape(prefix)}[\s\-–—:|/]+", text, re.I)
+            if match:
+                text = text[match.end():]
+                break
     return _WS_RE.sub(" ", _PUNCT_RE.sub(" ", text)).strip()
```

This strips either the OPEX serial or invoice-reference prefix, case-insensitively, using the requested separators. [`sponsorship_group_key()` at line 330](</home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:330>) remains unchanged: OPEX serial stays the primary component, while the remaining logical description remains a discriminator. Travel keying was not changed.

CLI signature:

```text
usage: score_against_truth.py [-h] [--out OUT] [--json JSON_OUT]
                              pipeline_xlsx truth_xlsx
```

Verification command:

```bash
python3 qc/score_against_truth.py batches/jawal-J26-1108/output/Spreadsheet-J26-1108-FILLED-v30.GUARDFIX-20260809.xlsx qc/fixtures/golden-j26-1108/J26-1108-truth-clerk-reviewed.xlsx --json /tmp/j26-1108-guardfix-score.json
```

Results:

- `python3 -m py_compile qc/score_against_truth.py`: passed
- `all_5` (`full5`): **75/102**
- `sponsorship.evaluated` (`sponsorship.n`): **19**
- `sponsorship.all_5` (`sponsorship.full5`): **16/19**
- `logical_virtual_evaluated`: **102**
- `pipeline_only_logical_groups`: **0**
- `truth_only_logical_groups`: **0**

The four sponsorship groups **did re-pair**:

- `26-1001`: 2 virtual employee rows
- `26-1004`: 2 virtual employee rows
- `26-1005`: 2 virtual employee rows
- `26-1009`: 2 virtual employee rows

All eight paired truth allocations match on **account, cc, div, solution, and agency: yes**.

The verified workbook’s total recovered `all_5` is **75**, not 83. The four repaired groups contribute eight recovered logical/virtual matches; three other sponsorship evaluations remain mismatched and are unrelated to these four prefix-orphan groups.
