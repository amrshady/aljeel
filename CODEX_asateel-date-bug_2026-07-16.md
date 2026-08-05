Root cause: the output is driven by Gemini’s `invoice_date`, not the authoritative Expenses Format date for normal PDF-backed invoices. Gemini returns a mixture of ISO and ambiguous `DD/MM/YYYY` strings; pandas parses the latter month-first, and the output function then explicitly emits `%m/%d/%Y`.

No files were modified.

1. Source XLSX read

The Expenses Format workbook is opened with openpyxl here:

- [asateel_poc.py:1453](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1453)
- `load_workbook(..., read_only=True, data_only=True)` at [line 1456](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1456)
- `*Invoice Date` column discovery at [line 1476](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1476)
- Rows are read using `values_only=True` at [line 1493](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1493)
- The unmodified value is captured at [line 1519](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1519) and stored in the supplier record at [line 1538](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1538).

For the actual central-13 source, openpyxl returns genuine Python `datetime.datetime` values, e.g.:

```text
03600 datetime.datetime(2026, 6, 1, 0, 0)
03601 datetime.datetime(2026, 6, 1, 0, 0)
...
```

The Excel number format is `mm-dd-yy`, but that display format does not change the underlying correct June datetime.

2. Output formatting and serialization

The Oracle conversion is:

- `_oracle_date_str()` at [asateel_poc.py:197](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:197)
- Datetime branch: `v.strftime("%m/%d/%Y")` at [line 202](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:202)
- String branch: `pd.to_datetime(v, errors="coerce")` at [line 204](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:204), followed by `dt.strftime("%m/%d/%Y")` at [line 207](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:207)

That function is assigned to the Oracle field at [line 2298](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2298):

```python
"*Invoice Date": _oracle_date_str(ext.get("invoice_date"))
```

The writer then stores that value at [lines 2491–2494](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2491) and applies the Excel display format `mm/dd/yyyy` at [lines 2495–2496](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2495).

Production delegates directly to this engine:

- Engine loading: [pipelines/asateel.py:43](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:43)
- Expenses source loading: [line 375](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:375)
- Row construction: [line 413](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:413)
- Excel writer: [line 423](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:423)

3. Why it varies row-to-row

Gemini is instructed to return `"YYYY-MM-DD or raw"` at [asateel_poc.py:544](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:544). It actually returned two forms in central-13:

```text
01/06/2026
02/06/2026
...
2026-06-01
2026-06-02
...
```

`normalize_extraction()` does no date normalization; dictionaries are returned unchanged at [lines 1142–1155](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1142).

The extracted payload becomes `ext` at [line 1913](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1913). For normal PDF-backed rows, both date fields use `ext.get("invoice_date")` at [lines 2271 and 2298](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2271).

Therefore:

- Gemini ISO `2026-06-01` parses unambiguously as June 1, then `%m/%d/%Y` emits `06/01/2026` — wrong for Oracle’s expected `DD/MM/YYYY`.
- Gemini raw `01/06/2026` is parsed by `pd.to_datetime` with its default month-first interpretation as January 6. Formatting it back as `%m/%d/%Y` produces `01/06/2026`. It only looks correct as DD/MM text; internally the conversion interpreted it as January 6.
- There is no `dayfirst=True`, explicit `strptime`, or locale normalization.
- Parseable strings do not pass through unchanged. Unparseable strings alone fall back to `_clean(v)` at lines 206 and 209.
- The source datetime is only injected for generated missing-PDF fallback work items at [lines 1807–1823](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1807). It is not selected for ordinary PDF-backed invoices.

Thus the 24 “correct” rows are largely correct-looking by coincidence; the 42 swapped rows came from ISO Gemini dates handled by the explicitly month-first output formatter.

4. Exact June 1 → `06/01/2026` path

For a normal PDF-backed invoice:

1. Gemini returns `"invoice_date": "2026-06-01"`.
2. Production calls `gemini_extract()` at [pipelines/asateel.py:401](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:401).
3. `normalize_extraction()` returns the string unchanged at [asateel_poc.py:1153](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1153).
4. `_oracle_date_str("2026-06-01")` is called at [line 2298](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2298).
5. `pd.to_datetime()` parses June 1 at [line 204](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:204).
6. `strftime("%m/%d/%Y")` emits `06/01/2026` at [line 207](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:207).
7. The string is written to column F and assigned `mm/dd/yyyy` at [lines 2491–2496](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2491).

For a master-fallback datetime, the direct datetime branch at line 202 produces the same `06/01/2026`.

5. Minimal recommended fix

At minimum:

- Change `_oracle_date_str()` to output `%d/%m/%Y`, not `%m/%d/%Y`.
- Parse supported input forms explicitly:
  - Python/openpyxl datetime directly.
  - ISO `%Y-%m-%d`.
  - Raw slash dates as `%d/%m/%Y`, since the documents/source convention is day-first.
- Do not use unconstrained `pd.to_datetime()` for ambiguous slash dates.
- Change the output cell number format at line 2496 to `dd/mm/yyyy`.

More importantly, because Expenses Format is stated to be authoritative, select the master date for every invoice after `invoice_no` is resolved at [line 1978](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1978), for example conceptually:

```python
master_records = supplier_index.get(invoice_no, [])
date_value = (
    master_records[0].get("invoice_date")
    if master_records
    else ext.get("invoice_date")
)
```

Then use that same normalized `date_value` for both:

```python
"invoice_date": canonical_iso_date(date_value)
"*Invoice Date": canonical_oracle_date(date_value)  # DD/MM/YYYY
```

This is the smallest robust insertion point because it applies one authoritative date to every output line for the invoice, while retaining Gemini only as a fallback when no matching master record exists.
