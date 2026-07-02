Fixed and verified — the two split employees now get different GL Descriptions matching their re-derived segments.

## What changed in `scripts/split_multi_emp.py`

```diff
+ sys.path.insert(0, str(Path(__file__).resolve().parent))
+ from code_name_lookup import get_lookup          # line 21 — same CodeNameLookup run_v30 uses

  HEADER_ALIASES = {
      ...
+     "GL Description": ["GL Description"],         # line 50 — exact-name column match

+ def build_gl_desc(combo, lookup):                 # lines 157–173
+     # lookup.expand_combo(combo), then join GL · Cost Name · Contribution ·
+     # Solution Name · Agency Name · 00000 · 00 · 000000 — same shape as
+     # run_v30's sync_final_gl_descriptions / build_gl_description.
+     # A "#N/A" (no name match) becomes "" instead of crashing.

  def split_multi_emp(...):
+     lookup = get_lookup(lookups_path)              # line 184 (CodeNameLookup pins Aljeel_Lookups-v2.xlsx)
      ...
      ws.cell(..., col["Distribution Combination"], value=combo)
+     if "GL Description" in col:                    # lines 257–258, right after the combo rebuild
+         ws.cell(row=row_i, column=col["GL Description"], value=build_gl_desc(combo, lookup))
```

The rebuild happens only inside the branch where the employee was found in Manpower — `EMP_NOT_IN_MANPOWER` rows keep their original segments, combo, and GL Description, and non-split rows are never touched.

## Verification

- `python3 -m py_compile scripts/split_multi_emp.py` — passes.
- Test run: `27 rows in, 12 split, 39 rows out` to `Spreadsheet-J26-870-FILLED-v30-SPLIT.xlsx`.
- In the output, all 12 split pairs now differ (previously both halves carried identical text):
  - **emp 1000477** — combo `03-40100-…-10081-…` → `Sponsoring Expenses · Capital Equipment · Capital Equipment · General · GE · 00000 · 00 · 000000`
  - **emp 1002037** — combo `03-10100-…-10156-…` → `Sponsoring Expenses · Capital Equipment · Capital Equipment · General · NUBOMED · 00000 · 00 · 000000`

The difference is in the Agency name (`GE` for agency 10081 vs `NUBOMED` for 10156), which is exactly where the two employees' Manpower segments diverge — their Cost Center (160011 → "Capital Equipment"), DIV (196), and Solution (00000 → "General") happen to be the same, so the rest of the string is legitimately identical. The format matches the rest of the v30 sheet byte-for-byte (same `" · "` join and `00000 · 00 · 000000` tail).
