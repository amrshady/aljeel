Implemented the recursive Jawal portal staging fix. No tests, batches, API reruns, or deployments were executed.

Diff summary:

- Recursively discovers files under `src/` using `Path.rglob()`.
- Preserves each file’s path relative to `src/` beneath `raw/`.
- Applies `_strip_doc_id_prefix()` only to the basename.
- Searches all depths for invoice workbooks, preferring cleaned names containing `inv`.
- Excludes the selected invoice from `raw/`; other Excel files remain evidence.
- Validates resolved destinations remain beneath `raw/`.
- Retains flat-layout behavior and the existing return signature.

File touched: [scripts/jawal_trigger.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/jawal_trigger.py:153)

New function body, lines 153–202:

```python
def _stage_jawal_portal_docs(batch_id: str, folder_name: str) -> tuple[Path, Path, str | None, int]:
    """Copy portal-staged docs into batches/jawal-<batch>/{raw,invoice-source.xlsx}."""
    normalized = batch_id.replace("jawal-", "")
    batch_dir = ROOT / "batches" / f"jawal-{normalized}"
    raw_dir = batch_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    src = Path(folder_name)
    if not src.is_dir():
        raise FileNotFoundError(f"staged folder not found: {folder_name}")

    raw_root = raw_dir.resolve()

    def raw_destination(relative_path: Path) -> Path:
        destination = (raw_dir / relative_path).resolve()
        try:
            destination.relative_to(raw_root)
        except ValueError as exc:
            raise ValueError(f"staged file path escapes raw directory: {relative_path}") from exc
        return destination

    excel_candidates: list[tuple[Path, Path, str]] = []
    other_files: list[tuple[Path, Path]] = []
    for entry in sorted(src.rglob("*"), key=lambda p: str(p.relative_to(src)).lower()):
        if not entry.is_file():
            continue
        clean = _strip_doc_id_prefix(entry.name)
        relative_path = entry.relative_to(src).parent / clean
        if entry.suffix.lower() in (".xlsx", ".xls"):
            excel_candidates.append((entry, relative_path, clean))
        else:
            other_files.append((entry, relative_path))

    invoice_path = None
    invoice_entry = None
    if excel_candidates:
        invoice_entry = next((i for i in excel_candidates if "inv" in i[2].lower()), excel_candidates[0])
        dst_invoice = batch_dir / "invoice-source.xlsx"
        _atomic_copy(invoice_entry[0], dst_invoice)
        invoice_path = str(dst_invoice)

    staged = 0
    for entry, relative_path in other_files:
        _atomic_copy(entry, raw_destination(relative_path))
        staged += 1
    for entry, relative_path, _clean_name in excel_candidates:
        if invoice_entry is not None and entry == invoice_entry[0]:
            continue
        _atomic_copy(entry, raw_destination(relative_path))
        staged += 1
    return batch_dir, raw_dir, invoice_path, staged
```

Operator verification for J26-1080:

1. Re-stage J26-1080 through the portal/API rerun workflow.
2. Confirm the request no longer returns HTTP 400 `no source documents found in folder_name`.
3. Inspect `batches/jawal-J26-1080/raw/`.
4. Confirm nested ticket folders exist, for example `raw/01-07jul/01JUL/4860349359/`.
5. Confirm evidence files have cleaned basenames inside those folders.
6. Confirm `batches/jawal-J26-1080/invoice-source.xlsx` exists.
7. Count evidence files recursively under `raw/`; a count greater than zero confirms `staged_count > 0` for a clean rerun.
