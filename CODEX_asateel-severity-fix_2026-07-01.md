Implemented in [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1398). No deploy performed.

**Verification**
- `python3 -m py_compile asateel-sample/asateel_poc.py`: passed
- Golden rerun:
  - Before: `GREEN 7 / YELLOW 181 / RED 0`
  - After: `188` rows, `GREEN 7 / YELLOW 175 / RED 6`
  - Blank CC: `6`
  - RED restored for `03140` x3, `03142` x2, `03307` x1
- Batch-15 rerun:
  - Before baseline from prior report: `GREEN 34 / YELLOW 60 / RED 12`
  - After: `106` rows, `GREEN 34 / YELLOW 37 / RED 35`
  - Blank CC: `1`
  - BMX GL Description still Jawal 8-part format:
    `Transportation/Freight Expense · IVD Solutions · IVD Solutions · General · BMX · 00000 · 00 · 000000`

**Guards**
- SO_Detail enabled flag: [asateel_poc.py:1398](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1398)
- Disabled-SO_Detail “JQ not in export” note guard: [asateel_poc.py:1770](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1770)
- RED-preserving SO_Detail YELLOW overrides: [asateel_poc.py:1803](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1803) and [asateel_poc.py:1805](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1805)

**Diff Summary**
- Added `so_detail_enabled = bool(so_detail_index)`.
- Guarded SO_Detail “JQ not in export” review so it only runs when SO_Detail is loaded.
- Made SO_Detail post-classification YELLOW overrides monotonic: they no longer downgrade existing RED.
- Left agency resolution, split math, Option-A inheritance, Jawal GL Description, `--pdf-dir`, and output contracts unchanged.
