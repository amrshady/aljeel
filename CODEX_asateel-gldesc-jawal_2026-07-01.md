Implemented and reran batch-15. No deploy performed.

**Files Touched**
- [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:809)

**Diff Summary**
```diff
+ def _build_gl_description(row_fields, include_tail=True):
+     parts = [GL, Cost Name, Contribution, Solution Name, Agency Name]
+     blank or "#N/A" -> "—"
+     append ["00000", "00", "000000"]
+     join with " · "

- main rows used: GL · Cost Name · Agency Name
+ main rows now use: GL · Cost Name · Contribution · Solution Name · Agency Name · 00000 · 00 · 000000

+ error placeholder rows also pass through the same local helper
```

No changes were made to `build_distribution_combination` or segment construction.

**Verification**
- `python3 -m py_compile asateel-sample/asateel_poc.py pipelines/asateel.py` passed.
- Batch command completed successfully.
- Output: `/home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-oracle-upload.xlsx`
- Rows written: 106

**Sample Rows**

| Invoice | Line | Split Method | Distribution Combination | GL Description |
|---|---:|---|---|---|
| 03928 | 1 | per_jq | `03-20100-61500027-160012-194-00000-10153-00000-00-000000` | `Transportation/Freight Expense · IVD Solutions · IVD Solutions · General · BMX · 00000 · 00 · 000000` |
| 03934 | 1.1 | per_jq_agency_even | `03-20100-61500027-160012-194-00000-10153-00000-00-000000` | `Transportation/Freight Expense · IVD Solutions · IVD Solutions · General · BMX · 00000 · 00 · 000000` |
| 03930 | 2 | per_jq | `03-20100-61500027-160012-194-00000-10132-00000-00-000000` | `Transportation/Freight Expense · IVD Solutions · IVD Solutions · General · Illumina · 00000 · 00 · 000000` |

All sampled GL Description values have the Jawal 8-part format.
