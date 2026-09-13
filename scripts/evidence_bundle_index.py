"""Shared indexing for ticket evidence bundled in sibling folders."""
from __future__ import annotations

import os
import re
from pathlib import Path


ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
VOLUME_BASE = Path("/mnt/aljeel_ap_kb/current")

BUNDLED_TICKET_SHARED_PDF_FLAG = "BUNDLED_TICKET_SHARED_PDF"
INVOICE_BASENAME_RE = re.compile(r"INV(?:OICE)?", re.IGNORECASE)
NON_EVIDENCE_PDF_RE = re.compile(
    r"(?:^|[^A-Z0-9])(?:SOA|STATEMENT[ _-]*OF[ _-]*ACCOUNT)(?:[^A-Z0-9]|$)",
    re.IGNORECASE,
)
REFUND_DOCUMENT_RE = re.compile(
    r"(?:^|[^A-Z0-9])(?:REFUND|CREDIT[ _-]*(?:NOTE|MEMO))(?:[^A-Z0-9]|$)",
    re.IGNORECASE,
)
TICKET_SCAN_RE = re.compile(r"\b(\d{10})\b")
SHORT_REF_SCAN_RE = re.compile(r"\b(\d{2}-\d{3,})\b")
PNR_SCAN_RE = re.compile(r"(?<![A-Z0-9])([A-Z0-9]{6})(?![A-Z0-9])", re.IGNORECASE)


def _normalize_reference_token(token: str) -> str:
    token = str(token or "").strip()
    if re.fullmatch(r"\d{10}", token):
        return token
    if re.fullmatch(r"\d{2}-\d{3,}", token):
        return token
    if (
        re.fullmatch(r"[A-Z0-9]{6}", token, re.IGNORECASE)
        and re.search(r"[A-Z]", token, re.IGNORECASE)
        and re.search(r"\d", token)
    ):
        return token.upper()
    return ""


def _reference_tokens_in_text(text: str) -> set[str]:
    refs = {m.group(1) for m in TICKET_SCAN_RE.finditer(text)}
    refs.update(m.group(1) for m in SHORT_REF_SCAN_RE.finditer(text))
    for match in PNR_SCAN_RE.finditer(text):
        token = _normalize_reference_token(match.group(1))
        if token:
            refs.add(token)
    return refs


def _batch_id_from_path(path: Path) -> str:
    for part in path.parts:
        match = re.search(r"J26-\d+", part, re.IGNORECASE)
        if match:
            return match.group(0).upper()
    return ""


def _invoice_pdf_skip_set(evidence_root: Path) -> tuple[set[Path], set[str]]:
    """Known source invoice PDFs/stems that must never seed ticket evidence."""
    skip_paths: set[Path] = set()
    skip_stems: set[str] = set()
    if not evidence_root:
        return skip_paths, skip_stems

    batch_id = _batch_id_from_path(evidence_root)
    candidate_dirs: list[Path] = []
    for directory in [evidence_root, *evidence_root.parents]:
        candidate_dirs.append(directory)
        if batch_id and directory.name.upper() == batch_id:
            break
    if batch_id:
        candidate_dirs.extend([
            ROOT / "batches" / f"jawal-{batch_id}",
            VOLUME_BASE / batch_id,
        ])
    invoice_sources: list[Path] = []
    seen_dirs: set[Path] = set()
    for directory in candidate_dirs:
        directory = directory.resolve(strict=False)
        if directory in seen_dirs:
            continue
        seen_dirs.add(directory)
        if not directory.is_dir():
            continue
        invoice_sources.extend(
            path for path in directory.iterdir()
            if path.is_file()
            and path.suffix.lower() in {".xlsx", ".xls", ".pdf"}
            and (path.name == "invoice-source.xlsx" or INVOICE_BASENAME_RE.search(path.stem))
        )

    for source in invoice_sources:
        skip_stems.add(source.stem.lower())
        if source.suffix.lower() == ".pdf":
            skip_paths.add(source.resolve(strict=False))
            continue
        for directory in candidate_dirs:
            if directory.is_dir():
                skip_paths.add((directory / f"{source.stem}.pdf").resolve(strict=False))
    return skip_paths, skip_stems


def _at_or_below_root(path: Path, evidence_root: Path) -> bool:
    try:
        relative = path.relative_to(evidence_root)
    except ValueError:
        return False
    return bool(relative.parts)


def _should_scan_ticket_body_pdf(
    pdf_path: Path,
    evidence_root: Path,
    invoice_skip_paths: set[Path],
    invoice_skip_stems: set[str],
) -> bool:
    if not _at_or_below_root(pdf_path, evidence_root):
        return False
    if pdf_path.resolve(strict=False) in invoice_skip_paths:
        return False
    if pdf_path.stem.lower() in invoice_skip_stems:
        return False
    if INVOICE_BASENAME_RE.search(pdf_path.stem):
        return False
    if NON_EVIDENCE_PDF_RE.search(pdf_path.stem):
        return False
    if REFUND_DOCUMENT_RE.search(pdf_path.stem):
        return False
    return True


def _pdf_ticket_body_numbers(pdf_path: Path, pdf_text_cache: dict[Path, set[str]]) -> set[str]:
    if pdf_path in pdf_text_cache:
        return pdf_text_cache[pdf_path]
    numbers: set[str] = set()
    try:
        import fitz

        doc = fitz.open(str(pdf_path))
        try:
            text = "\n".join(page.get_text() for page in doc)
        finally:
            doc.close()
        numbers = _reference_tokens_in_text(text)
    except Exception as exc:
        print(f"[ticket-pdf-scan] WARNING: PDF read failed for {pdf_path}: {exc}", flush=True)
    pdf_text_cache[pdf_path] = numbers
    return numbers


def build_ticket_folder_index(evidence_root: Path) -> set[str]:
    """Return supported Jawal refs found in evidence folder/file names."""
    index: set[str] = set()
    if not evidence_root or not evidence_root.exists():
        return index
    invoice_skip_paths, invoice_skip_stems = _invoice_pdf_skip_set(evidence_root)
    for root, dirs, files in os.walk(evidence_root):
        for directory in dirs:
            index.update(_reference_tokens_in_text(directory))
        root_path = Path(root)
        for filename in files:
            file_path = root_path / filename
            if (
                file_path.resolve(strict=False) in invoice_skip_paths
                or file_path.stem.lower() in invoice_skip_stems
                or INVOICE_BASENAME_RE.search(file_path.stem)
                or NON_EVIDENCE_PDF_RE.search(file_path.stem)
                or REFUND_DOCUMENT_RE.search(file_path.stem)
            ):
                continue
            index.update(_reference_tokens_in_text(file_path.stem))
    return index


def build_bundled_ticket_pdf_map(
    evidence_root: Path,
    pdf_text_cache: dict[Path, set[str]] | None = None,
) -> dict[str, str]:
    """Return ``{embedded_reference_token: host_pdf_path}`` from evidence PDFs."""
    bundled: dict[str, str] = {}
    if not evidence_root or not evidence_root.exists():
        return bundled
    cache = pdf_text_cache if pdf_text_cache is not None else {}
    invoice_skip_paths, invoice_skip_stems = _invoice_pdf_skip_set(evidence_root)
    for root, dirs, files in os.walk(evidence_root):
        dirs.sort()
        root_path = Path(root)
        for filename in sorted(files):
            if not filename.lower().endswith(".pdf"):
                continue
            pdf_path = root_path / filename
            if not _should_scan_ticket_body_pdf(
                pdf_path, evidence_root, invoice_skip_paths, invoice_skip_stems
            ):
                continue
            for ticket_no in sorted(_pdf_ticket_body_numbers(pdf_path, cache)):
                bundled.setdefault(ticket_no, str(pdf_path))
    return bundled


def _bundled_host_ticket_no(host_pdf_path: str) -> str:
    path = Path(host_pdf_path)
    match = TICKET_SCAN_RE.search(path.stem)
    if match:
        return match.group(1)
    for parent in [path.parent, *path.parents]:
        match = re.match(r"^(\d{10})", parent.name)
        if match:
            return match.group(1)
    return ""


def build_bundled_ticket_aliases(evidence_root: Path) -> dict[str, tuple[str, ...]]:
    """Return unambiguous embedded-ticket aliases, omitting conflicting hosts."""
    if not evidence_root or not evidence_root.exists():
        return {}
    cache: dict[Path, set[str]] = {}
    invoice_skip_paths, invoice_skip_stems = _invoice_pdf_skip_set(evidence_root)
    hosts_by_ticket: dict[str, set[str]] = {}
    for root, dirs, files in os.walk(evidence_root):
        dirs.sort()
        root_path = Path(root)
        for filename in sorted(files):
            if not filename.lower().endswith(".pdf"):
                continue
            pdf_path = root_path / filename
            if not _should_scan_ticket_body_pdf(
                pdf_path, evidence_root, invoice_skip_paths, invoice_skip_stems
            ):
                continue
            host_ticket = _bundled_host_ticket_no(str(pdf_path))
            if not host_ticket:
                continue
            for ticket_no in _pdf_ticket_body_numbers(pdf_path, cache):
                if ticket_no != host_ticket:
                    hosts_by_ticket.setdefault(ticket_no, set()).add(host_ticket)

    return {
        ticket_no: (next(iter(hosts)),)
        for ticket_no, hosts in sorted(hosts_by_ticket.items())
        if len(hosts) == 1
    }
