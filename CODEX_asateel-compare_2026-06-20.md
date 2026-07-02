Completed read-only comparison. I added only:

- [compare_v2_to_answer_key.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/compare_v2_to_answer_key.py)
- [COMPARE-REPORT-2026-06-20.md](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/COMPARE-REPORT-2026-06-20.md)

No changes were made to `asateel_poc.py`, allocation logic, or deployed/pipeline code.

Summary from the run:

```text
Matched lines: 157
Agency: 101/157 = 64.3%
Cost Center: 107/157 = 68.2%
DIV: 85/157 = 54.1%
Full combo: 11/157 = 7.0%
Amount: 36/157 = 22.9%
Agency/CC/DIV mismatches: 178
```

Coverage: both sides contain the same 92 invoices. POC has 208 lines, answer key has 163 lines, with 157 matched comparable lines; 51 POC lines had no corresponding answer-key row and 6 answer-key lines had no POC row.

The report includes the capped mismatch table, source breakdown including `none`, and the requested `03317` three-line comparison. Main finding: `salesperson` is weakest by segment misses, while `supplier_expenses_format` mostly gets Agency/CC right but often misses DIV; full-combo scoring is low mainly because finance uses nonzero solution segments where POC outputs `00000`.
