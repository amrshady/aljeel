#!/usr/bin/env python3
"""
File-discovery layer for the Aljeel AP demo pipelines.

Each pipeline (J&J, Asateel, Jawal) reads its config from here instead of
hardcoded paths. Goal: drop new files in raw/<vendor>/<period>/, run pipeline,
no code changes needed.

Discovery rules (per vendor):

J&J / DePuy
-----------
- Looks under raw/<any-subdir>/<any-subdir>/ for:
    - vendor invoice PDFs matching `*ZSD1COMINV*.pdf`
    - DN workbook(s) matching `DN *.xlsx`
    - Oracle report(s) matching `Oracle report for invoice *.xlsx`
- Per invoice PDF, extracts invoice_no + customer_po list + expected total
  via Gemini header extraction (cached). Falls back to filename parsing.
- Maps PO IDs to DN-workbook sheet names by substring match.

Asateel
-------
- Walks raw/<any-subdir>/<any-subdir>/ for:
    - allocation Excel: any .xlsx whose Details sheet has both
      'Intercompany*Invoice Number' and 'JQ' columns
    - vendor PDFs matching pattern `^\\d{5}_\\d+\\.pdf$`
- The 117 PDFs and 117 invoice header rows in the xlsx are matched by the
  5-digit prefix of the PDF filename.

Jawal
-----
- Walks raw/<any-subdir>/<any-subdir>/ for:
    - monthly invoice xlsx with both 'INVOICE' and 'Details' sheets, where
      INVOICE col 6 is the text Ref. No.
    - per-ticket folder root: any directory that contains subdirectories named
      by 10-digit ticket IDs or text refs
"""
from __future__ import annotations

import os
import re
import json
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

import pandas as pd

RAW = Path('/home/clawdbot/.openclaw/workspace/aljeel/raw')
DISCOVERY_CACHE = Path('/home/clawdbot/.openclaw/workspace/aljeel/extracted/discovery.json')


# ---------------------------------------------------------------------------
# J&J
# ---------------------------------------------------------------------------

@dataclass
class JJInvoice:
    invoice_no:   str
    pdf:          Path
    pos:          list           # list of customer PO ids
    expected_total_sar: Optional[float] = None
    expected_lines:     Optional[int] = None
    chunk_pages:        int = 3
    dn_workbook:        Optional[Path] = None
    oracle_report:      Optional[Path] = None


def _scan_jj_files():
    inv_pdfs, dn_books, oracle_books = [], [], []
    for p in RAW.rglob('*.pdf'):
        if 'ZSD1COMINV' in p.name:
            inv_pdfs.append(p)
    for p in RAW.rglob('*.xlsx'):
        n = p.name
        if n.startswith('DN ') or n.startswith('DN#'):
            dn_books.append(p)
        elif n.lower().startswith('oracle report for invoice'):
            oracle_books.append(p)
    return inv_pdfs, dn_books, oracle_books


def _extract_invoice_no(pdf_path: Path) -> Optional[str]:
    # Filename usually contains the 10-digit invoice number after ZSD1COMINV
    m = re.search(r'ZSD1COMINV\s+(\d{8,12})', pdf_path.name)
    if m:
        return m.group(1)
    return None


def _read_oracle_for(invoice_no: str, oracle_books: list) -> tuple[Optional[float], Optional[int], Optional[list], Optional[Path]]:
    """Return (total_sar, line_count, customer_po_list, oracle_path) by inspecting the matching Oracle Excel.

    Oracle reports use 'Unnamed: 1' as line number, 'Unnamed: 3' as the line
    amount (in Aljeel's SAR), and 'Number' as the PO number. Each Oracle line
    is one invoice line; lot-level detail is in separate sub-rows we don't sum.
    Pattern is consistent across Oracle's standard PO match report.
    """
    for p in oracle_books:
        if invoice_no in p.name:
            try:
                df = pd.read_excel(p, sheet_name=0, header=0)
                # PO list — col named 'Number' OR 'PO Number'
                pos = []
                for col in ('Number', 'PO Number'):
                    if col in df.columns:
                        vals = [str(v).strip() for v in df[col].dropna().unique()]
                        po_vals = [v for v in vals if v.startswith('PO')]
                        if po_vals:
                            pos = sorted(set(po_vals))
                            break
                # Total = sum of 'Unnamed: 3' (line amount) OR any 'Amount'-like col
                total = None
                if 'Unnamed: 3' in df.columns:
                    s = pd.to_numeric(df['Unnamed: 3'], errors='coerce').sum()
                    if s > 1000:
                        total = float(s)
                if total is None:
                    for col in df.columns:
                        cl = str(col).lower()
                        if 'amount' in cl or 'total' in cl:
                            try:
                                s = pd.to_numeric(df[col], errors='coerce').sum()
                                if s > 1000:
                                    total = float(s)
                                    break
                            except Exception:
                                pass
                # Line count = distinct values in 'Unnamed: 1' (line number) where
                # the row is an actual line entry (col 2 == 'Item' or similar)
                lcount = None
                if 'Unnamed: 1' in df.columns and 'Unnamed: 2' in df.columns:
                    item_rows = df[df['Unnamed: 2'].astype(str).str.contains('Item', na=False)]
                    lcount = int(item_rows['Unnamed: 1'].nunique())
                if lcount is None and 'Unnamed: 1' in df.columns:
                    lcount = int(df['Unnamed: 1'].nunique())
                return (total, lcount, pos, p)
            except Exception as e:
                print(f"  [warn] Could not parse Oracle file {p.name}: {e}")
    return (None, None, None, None)


def _map_po_to_dn_sheet(po_id: str, dn_workbooks: list) -> Optional[str]:
    """Search every sheet in every DN workbook for a sheet whose name OR
    contents reference the given PO id. Returns sheet name."""
    short = po_id.replace('PO', '').lstrip('0')[-4:]  # last 4 digits
    for wb in dn_workbooks:
        try:
            xl = pd.ExcelFile(wb)
            for s in xl.sheet_names:
                if short in s or po_id in s:
                    return s
        except Exception:
            pass
    return None


def discover_jj():
    inv_pdfs, dn_books, oracle_books = _scan_jj_files()
    out = []
    for pdf in sorted(inv_pdfs):
        inv_no = _extract_invoice_no(pdf)
        if not inv_no:
            print(f"  [warn] Skipping {pdf.name}: cannot derive invoice number")
            continue
        total, lcount, oracle_pos, oracle_path = _read_oracle_for(inv_no, oracle_books)
        # If oracle didn't give us POs, fall back to Gemini-header (handled by
        # the pipeline at extraction time — record it as empty).
        dn_workbook = None
        if dn_books:
            # Prefer the DN workbook whose filename references this invoice number
            preferred = [d for d in dn_books if inv_no in d.name]
            dn_workbook = preferred[0] if preferred else dn_books[0]
        # Heuristic: invoices > 5 expected_lines or > SAR 1M => 3-page chunks; else 5
        chunk_pages = 3 if (lcount and lcount > 100) or (total and total > 1_000_000) else 5
        out.append(JJInvoice(
            invoice_no=inv_no,
            pdf=pdf,
            pos=oracle_pos or [],
            expected_total_sar=total,
            expected_lines=lcount,
            chunk_pages=chunk_pages,
            dn_workbook=dn_workbook,
            oracle_report=oracle_path,
        ))
    return out


# ---------------------------------------------------------------------------
# Asateel
# ---------------------------------------------------------------------------

@dataclass
class AsateelConfig:
    allocation_xlsx: Path
    pdf_dir:         Path
    pdf_files:       list  # list of Paths


def discover_asateel():
    candidate_xlsx = []
    pdf_dirs: dict = {}
    for p in RAW.rglob('*.xlsx'):
        if '__MACOSX' in str(p):
            continue
        try:
            df = pd.read_excel(p, sheet_name='Details', header=0, nrows=5)
            if 'Intercompany*Invoice Number' in df.columns and 'JQ' in df.columns:
                candidate_xlsx.append(p)
        except Exception:
            pass
    # PDFs that match the 5-digit_underscore pattern
    for p in RAW.rglob('*.pdf'):
        if '__MACOSX' in str(p):
            continue
        if re.match(r'^\d{5}_\d+\.pdf$', p.name):
            pdf_dirs.setdefault(p.parent, []).append(p)

    if not candidate_xlsx:
        raise FileNotFoundError("No Asateel allocation Excel found (looked for Details sheet with Intercompany*Invoice Number + JQ columns)")
    if not pdf_dirs:
        raise FileNotFoundError("No Asateel PDF directory found (looked for files matching <5digit>_<digits>.pdf)")

    # Pick the PDF directory with the most files
    best_dir = max(pdf_dirs.items(), key=lambda kv: len(kv[1]))[0]
    # Pick the allocation xlsx co-located with the PDFs if possible
    co_located = [x for x in candidate_xlsx if x.parent == best_dir]
    alloc_xlsx = co_located[0] if co_located else candidate_xlsx[0]
    return AsateelConfig(
        allocation_xlsx=alloc_xlsx,
        pdf_dir=best_dir,
        pdf_files=sorted(pdf_dirs[best_dir]),
    )


# ---------------------------------------------------------------------------
# Jawal
# ---------------------------------------------------------------------------

@dataclass
class JawalConfig:
    invoice_xlsx: Path
    folder_root:  Path  # the directory containing the per-day or per-ticket subdirs


def _is_jawal_invoice(xlsx: Path) -> bool:
    try:
        xl = pd.ExcelFile(xlsx)
        if 'INVOICE' not in xl.sheet_names or 'Details' not in xl.sheet_names:
            return False
        det = pd.read_excel(xlsx, sheet_name='Details', header=0, nrows=5)
        # Jawal Details sheet has distinctive bilingual column names
        cols = ' '.join(str(c) for c in det.columns)
        return 'Ticket' in cols and 'Passenger' in cols and 'Route' in cols
    except Exception:
        return False


def discover_jawal():
    invoice_xlsx = None
    for p in RAW.rglob('*.xlsx'):
        if '__MACOSX' in str(p):
            continue
        if _is_jawal_invoice(p):
            # Prefer the one whose filename starts with 'J' followed by digits
            if re.match(r'^J\d+-\d+\.xlsx$', p.name):
                invoice_xlsx = p
                break
            elif invoice_xlsx is None:
                invoice_xlsx = p
    if invoice_xlsx is None:
        raise FileNotFoundError("No Jawal invoice xlsx found (looked for INVOICE + Details sheets with Ticket/Passenger/Route columns)")

    # Folder root: the directory under jawal-files/ that contains date-named
    # subdirs (e.g. `24apr`, `25apr`, ...) OR ticket-numbered subdirs (10 digits)
    # Walk parent of invoice_xlsx and look for a sibling directory that satisfies
    candidate_roots: dict = {}
    base = invoice_xlsx.parent
    for d in base.iterdir():
        if not d.is_dir():
            continue
        sub_dir_count = sum(1 for x in d.iterdir() if x.is_dir())
        if sub_dir_count >= 3:  # heuristic: a real folder root will have >=3 subdirs
            candidate_roots[d] = sub_dir_count
    if candidate_roots:
        folder_root = max(candidate_roots.items(), key=lambda kv: kv[1])[0]
    else:
        # No nested structure; use invoice xlsx parent
        folder_root = base

    return JawalConfig(invoice_xlsx=invoice_xlsx, folder_root=folder_root)


# ---------------------------------------------------------------------------
# Top-level
# ---------------------------------------------------------------------------

def discover_all(verbose: bool = True):
    if verbose:
        print(f"[discovery] Scanning {RAW}")
    try:
        jj = discover_jj()
    except Exception as e:
        jj = []
        if verbose:
            print(f"  [J&J] discovery failed: {e}")
    if verbose:
        print(f"  [J&J] {len(jj)} invoice(s)")
        for i in jj:
            print(f"     - {i.invoice_no}: pdf={i.pdf.name}, pos={i.pos}, expected_total={i.expected_total_sar}, chunk_pages={i.chunk_pages}")
    try:
        asat = discover_asateel()
    except Exception as e:
        asat = None
        if verbose:
            print(f"  [Asateel] discovery failed: {e}")
    if verbose and asat:
        print(f"  [Asateel] {len(asat.pdf_files)} PDFs, allocation = {asat.allocation_xlsx.name}")
    try:
        jawal = discover_jawal()
    except Exception as e:
        jawal = None
        if verbose:
            print(f"  [Jawal] discovery failed: {e}")
    if verbose and jawal:
        print(f"  [Jawal] invoice = {jawal.invoice_xlsx.name}, folder_root = {jawal.folder_root.name}")
    return {'jj': jj, 'asateel': asat, 'jawal': jawal}


if __name__ == '__main__':
    discover_all()
