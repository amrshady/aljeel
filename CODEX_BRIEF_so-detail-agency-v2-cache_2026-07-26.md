# Codex Brief — SO_Detail authoritative Agency v2 (resolution matrix + parse cache)

## Context / prior art (READ FIRST)
- Read `CODEX_bmx-agency-allocation-rootcause_2026-07-23.md` and
  `CODEX_BRIEF_so-detail-authoritative-agency_2026-07-26.md`.
- There is ALREADY an uncommitted in-tree change from the first agency run
  (`asateel-sample/asateel_poc.py`, `pipelines/asateel.py` modified — `load_so_detail`
  now reads CAT_AGENCY/CAT_AGENCY_DESC). BUILD ON TOP of that working tree; do not
  revert it. This brief refines the resolution rules and adds a parse cache.

## New standing SO_Detail file (the real one)
- Path: `/home/clawdbot/.openclaw/media/inbound/JQ_updated_report_23-07-2026---3b394da6-db2c-400a-a0e8-e422eb38b4a3.xlsx`
- Copy it into the repo as the standing SO_Detail reference (e.g. `reference/` —
  match wherever the pipeline currently expects the standing SO_Detail file; verify
  the actual configured path in `pipelines/asateel.py`). Sheet1, header row 5, cols:
  ORDER_NUMBER, CAT_AGENCY, CAT_AGENCY_DESC, SPERSON (+ ORDERED_DATE etc).
- 74,567 data rows, 65,119 unique JQ. Full openpyxl parse ~11s.

## Agency resolution matrix (per JQ / Order Number) — AUTHORITATIVE, applies to ALL Asateel batches
For each invoice JQ unit, resolve Agency as follows:

| SO_Detail state for the JQ            | Agency used              | Red row? |
|---------------------------------------|--------------------------|----------|
| exactly ONE clean agency              | SO_Detail (authoritative)| No       |
| CONFLICT (2+ distinct usable agencies)| Supplier workbook (fallback) | No   |
| BLANK / 00000 only                    | Supplier workbook (fallback) | No   |
| JQ MISSING entirely from SO_Detail    | Supplier workbook (fallback) | **YES — red** |

Rules:
- "usable agency" = non-empty and not `00000`.
- CONFLICT = the JQ maps to 2+ distinct usable agency codes in SO_Detail.
- Only the **JQ-missing-entirely** case flags the row RED. Conflict and blank fall
  back to supplier SILENTLY (no red) — supplier is a legitimate source, not a guess.
- When SO_Detail gives one clean agency, it OVERRIDES the supplier agency.
- Whatever agency is chosen must be written to BOTH the standalone `Agency` column
  (27/28) AND used to rebuild Distribution Combination segment 7. NEVER patch only
  one. Populate `SO_Detail Agency` + discrepancy columns as today.
- AGENCY-ONLY change: do NOT alter CC / DIV / Solution / employee / split logic.
  Keep the BMX P&T junior->head remap gate (commit e4dc025) untouched.

## Red-row rendering
For the JQ-missing case, highlight the ENTIRE Oracle XLSX output row RED and emit a
review exception with a clear reason (e.g. `AGENCY_JQ_NOT_IN_SO_DETAIL`), so a clerk
manually reviews it. Row is still emitted (flagged, not dropped).

## Parse cache (performance — standing file, sha-keyed)
`load_so_detail()` must cache its parsed index to avoid the ~11s re-parse every run:
- Compute sha256 of the SO_Detail file. Cache path e.g.
  `state/so_detail_cache/<sha256>.pkl` (pick a sensible location; create dir if
  needed). Cache value = the parsed per-JQ index (agency set/resolved, sperson, desc).
- On load: if a cache file for the current sha exists, load it (pickle, ~50ms) and
  SKIP parsing the xlsx. Else parse the xlsx, build the index, write the cache, use it.
- Cache key is the file content hash, so a NEW SO_Detail upload (different bytes)
  naturally invalidates and rebuilds once. Do not key on mtime alone.
- Keep it simple and safe: corrupt/unreadable cache => fall back to full parse, don't
  crash. Never serve a cache whose sha doesn't match the current file.

## Hard invariant gate
Final check: for EVERY output row, Distribution Combination segment 7 == standalone
`Agency`. Fail loudly on any violation.

## Golden gate (MANDATORY — do not game)
`python3 qc/asateel_golden_check.py` must still run to completion. Baseline before
these changes was GREEN / GOLDEN OK (185 rows, 34 HOME_AGENCY_DISCREPANCY). Expected
agencies will legitimately shift now that agency comes from SO_Detail — DO NOT edit
the golden check or fixtures to force a pass. Instead report the before/after diff and
state clearly if the golden baseline needs human (Ahmed) re-blessing. READ-ONLY on
golden fixtures.

## Report / deliverables
1. Combined diff: agency matrix + red-row flag + invariant gate + sha parse cache +
   standing file in place.
2. Numbers on the current golden batch: rows clean via SO_Detail, rows fallen back to
   supplier (conflict), (blank), rows RED (JQ missing), HOME_AGENCY_DISCREPANCY
   before/after, cold-parse vs cached-load timing.
3. Golden gate output + whether baseline needs re-blessing.
4. DO NOT deploy. Report the diff for review.
```
