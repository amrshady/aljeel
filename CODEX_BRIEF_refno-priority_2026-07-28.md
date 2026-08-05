# Codex Brief — Prefer invoice Ref No as event key (option 1)

IMPLEMENT (not read-only). File: scripts/run_v30.py. MINIMAL, surgical edit. No refactor of unrelated code.
After editing: show a unified diff and run `python3 -c "import ast; ast.parse(open('/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py').read())"`.
Do NOT run the full pipeline. Do NOT deploy/upload. Do NOT touch other files unless strictly required.

## Decision (owner: Amr/Ahmed)
Anchor the row event key on the invoice Ref. No. — it is the authoritative, structured per-line field. Do NOT let OPEX Serial / Description win over it, because those can carry a neighboring row's event label (e.g. CRM-2026-39 bleeding onto ticket 4860349358 whose Ref No is correctly ce-20-2026).

## Current code (around line 311)
```python
def _row_event_key(row: dict, cascade_row: dict, folder: Path | None = None) -> str:
    """Choose the resolved event key, retaining participant-based disambiguation."""
    if folder:
        pdfs = _find_opex_pdfs(folder)
        if pdfs:
            key = _opex_pdf_event_key(pdfs[0])
            if key:
                return key
        key = _canonical_event_serial(str(folder))
        if key:
            return key
    for value in (
        row.get("opex_serial"), row.get("_opex_serial"),
        cascade_row.get("OPEX Serial"), cascade_row.get("Description"),
        _row_invoice_ref_no(cascade_row),
    ):
        key = _canonical_event_serial(value)
        if key:
            return key
    return ""
```

## Change
In the fallback tuple, move `_row_invoice_ref_no(cascade_row)` to the FIRST position so the invoice Ref. No. is tried before opex_serial / _opex_serial / OPEX Serial / Description. New order:
```python
    for value in (
        _row_invoice_ref_no(cascade_row),
        row.get("opex_serial"), row.get("_opex_serial"),
        cascade_row.get("OPEX Serial"), cascade_row.get("Description"),
    ):
```
Leave the `if folder:` block unchanged (a caller-supplied folder is explicit and stays authoritative). Do not change `_canonical_event_serial`, `_row_invoice_ref_no`, or any other function.

## Deliver
1. Unified diff (file:line).
2. Confirm `ast.parse OK`.
3. One sentence: confirm that ticket 4860349358 (Ref No `ce-20-2026`, Description/OPEX Serial `CRM-2026-39`) now resolves event key `CE20` instead of `CRM39`.
4. Any risk: note whether any row that previously relied on OPEX Serial/Description over Ref No could change key (list the fields' precedence change succinctly).
Do NOT run the pipeline or deploy.
