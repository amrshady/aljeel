#!/usr/bin/env python3
"""Stage an Asateel batch from the dated archive into batches/asateel-*/src."""
from __future__ import annotations

import argparse
import shutil
import unicodedata
from pathlib import Path

import openpyxl


ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
ARCHIVE_ROOT = Path("/mnt/aljeel_ap_kb/archive")


def _nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def _resolve_archive_folder(archive_date: str, folder_name: str) -> Path:
    base = ARCHIVE_ROOT / archive_date / "asateel"
    if not base.exists():
        raise FileNotFoundError(f"Archive Asateel folder not found: {base}")
    wanted = _nfc(folder_name)
    for child in base.iterdir():
        if child.is_dir() and _nfc(child.name) == wanted:
            resolved = child.resolve()
            if "current" in resolved.parts:
                raise RuntimeError(f"Refusing to stage from live current bucket: {resolved}")
            return resolved
    names = ", ".join(sorted(child.name for child in base.iterdir() if child.is_dir()))
    raise FileNotFoundError(f"Folder {folder_name!r} not found under {base}. Available: {names}")


def _has_expenses_format_sheet(path: Path) -> bool:
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        try:
            return "Expenses Format" in wb.sheetnames
        finally:
            wb.close()
    except Exception:
        return False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stage a dated archive Asateel batch deterministically")
    parser.add_argument("--archive-date", required=True, help="Dated archive folder, e.g. 2026-07-01")
    parser.add_argument("--folder-name", required=True, help="Archive Asateel folder name, e.g. وسطي 13")
    parser.add_argument("--batch-id", required=True, help="Batch id suffix, e.g. central-13")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    src = _resolve_archive_folder(args.archive_date, args.folder_name)
    dest = ROOT / "batches" / f"asateel-{args.batch_id}" / "src"
    dest.mkdir(parents=True, exist_ok=True)

    for stale in list(dest.glob("*.pdf")) + list(dest.glob("*.xlsx")):
        stale.unlink()

    candidates = sorted(
        [p for p in src.iterdir() if p.is_file() and p.suffix.casefold() in {".pdf", ".xlsx"}],
        key=lambda p: p.name,
    )
    for path in candidates:
        shutil.copy2(path, dest / path.name)

    pdf_count = sum(1 for p in candidates if p.suffix.casefold() == ".pdf")
    xlsx_files = [dest / p.name for p in candidates if p.suffix.casefold() == ".xlsx"]
    masters = [p for p in xlsx_files if _has_expenses_format_sheet(p)]

    print(f"Resolved source: {src}")
    print(f"Destination: {dest.resolve()}")
    print(f"PDF count: {pdf_count}")
    if masters:
        print(f"Expenses-Format master: {masters[0].resolve()}")
    else:
        print("Expenses-Format master: NOT FOUND")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
