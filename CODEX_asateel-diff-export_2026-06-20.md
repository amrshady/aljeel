Built the standalone script and generated the downloadable workbook.

Script: [build_diff_vs_finance_v3.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/build_diff_vs_finance_v3.py)  
Workbook: [asateel-diff-vs-finance-v3-2026-06-20.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-diff-vs-finance-v3-2026-06-20.xlsx)

Run report:

```text
Differences sheet rows: 47
Total OUR lines: 208
Matched lines: 157

Agency: 34
CC: 9
DIV: 9
Solution: 19
Combo: 47

Top agency substitutions:
10200 -> 10202: 7
10156 -> 10100: 5
10156 -> 10038: 3
10043 -> 10041: 2
10101 -> 10102: 2
10156 -> 10041: 2
00000 -> 10153: 1
10005 -> 10009: 1
10043 -> 10200: 1
10060 -> 10062: 1

HomeAgencyVsBrand diffs: 30
Lines with no Manpower match: 10
```

I only added the new script and output XLSX under `asateel-sample/`; no pipeline/deployed files were modified. The openpyxl warning during generation was from reading the macro workbook’s unsupported data-validation extension and does not affect this generated report.
