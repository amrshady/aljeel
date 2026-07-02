Implemented in [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:463). No deploy.

**Changed**
- Added JSON salvage helpers at [asateel_poc.py:463](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:463), with `_salvage_json()` at [line 594](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:594).
- Gemini fresh extraction now tries salvage before `parse_error` fallback at [line 702](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:702).
- Cached `{"parse_error": true, "raw": ...}` normalizes through salvage at [line 933](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:933).
- Successful salvage appends `json_salvaged=true` to `extraction_notes`.

**Verification**
- `python3 -m py_compile asateel-sample/asateel_poc.py pipelines/asateel.py`: passed.

**Batch-15**
Before existing output:
- Rows: 106
- GREEN/YELLOW/RED: 34 / 37 / 35
- Blank CC: 1
- `json_salvaged` rows: 0

After warm-cache run:
- Rows: 106
- GREEN/YELLOW/RED: 46 / 60 / 0
- Blank CC: 1
- `json_salvaged` invoices: 03933, 03940, 03944, 03945, 03947, 03948, 03951, 04000, 04001
- `json_salvaged` rows: 35
- RED parse-error rows: 0

Invoice `03940` now has:
- `invoice_number`: `03940`
- `total`: `862.5`
- Rows: 10
- Statuses: all `YELLOW`
- RED-for-parse-error rows: 0

**Golden**
Golden did not remain unchanged; salvage legitimately parsed prior malformed cached raws:
- Rows: 188
- GREEN/YELLOW/RED: 7 / 181 / 0
- Blank CC: 6
- `json_salvaged` invoices: 03134, 03140, 03142, 03307
- `json_salvaged` rows: 8

The previously RED golden invoices `03140`, `03142`, and `03307` now parse with invoice numbers/totals populated and produce YELLOW rows, not parse-error REDs. Current `matched/` outputs are from the final golden run.
