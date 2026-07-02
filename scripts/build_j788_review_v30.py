#!/usr/bin/env python3
"""
Build v30 review data for the evidence browser.

Outputs:
  dashboard/public/data/<batch>-rows-v30.json   — per-row metadata + evidence refs
  dashboard/public/evidence/<batch>/**          — static evidence files (PDF, msg as json)

Usage:
    python3 scripts/build_j788_review_v30.py [--batch J26-788]
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
BATCH_ID = "J26-788"
BATCH_SLUG = "j26-788"
BATCH = ROOT / f"batches/jawal-{BATCH_ID}"
RAW = BATCH / "raw"
OUTPUT = BATCH / "output"
DASH_DATA = ROOT / "dashboard/public/data"
DASH_EV = ROOT / f"dashboard/public/evidence/{BATCH_SLUG}"

V28_XLSX = OUTPUT / f"Spreadsheet-{BATCH_ID}-FILLED-v30.xlsx"
STEP_TRACE = OUTPUT / "step-trace-v30.jsonl"
SUMMARY = OUTPUT / "summary-v30.json"

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl not installed")

try:
    import extract_msg
    HAS_EXTRACT_MSG = True
except ImportError:
    HAS_EXTRACT_MSG = False
    print("WARNING: extract_msg not installed — .msg files will not be parsed", file=sys.stderr)


def configure_batch(batch_id: str, raw_dir: str | None = None) -> None:
    global BATCH_ID, BATCH_SLUG, BATCH, RAW, OUTPUT, DASH_EV, V28_XLSX, STEP_TRACE, SUMMARY

    BATCH_ID = batch_id.replace("jawal-", "")
    BATCH_SLUG = BATCH_ID.lower()
    BATCH = ROOT / f"batches/jawal-{BATCH_ID}"
    RAW = Path(raw_dir) if raw_dir else BATCH / "raw"
    OUTPUT = BATCH / "output"
    DASH_EV = ROOT / f"dashboard/public/evidence/{BATCH_SLUG}"
    V28_XLSX = OUTPUT / f"Spreadsheet-{BATCH_ID}-FILLED-v30.xlsx"
    STEP_TRACE = OUTPUT / "step-trace-v30.jsonl"
    SUMMARY = OUTPUT / "summary-v30.json"


# ── Helpers ──────────────────────────────────────────────────────────────────

def atomic_replace(path: Path, write_tmp) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".tmp-{path.name}"
    write_tmp(tmp)
    os.replace(tmp, path)

def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def clean_html(raw_bytes: bytes) -> str:
    try:
        h = raw_bytes.decode("utf-8", errors="replace")
    except Exception:
        h = str(raw_bytes)
    h = re.sub(r'<!--\[if[^\]]*\]>.*?<!\[endif\]-->', '', h, flags=re.DOTALL)
    return h


MSG_SIZE_LIMIT = 4 * 1024 * 1024  # 4 MB — skip body of huge msg files (embedded attachments)


def parse_msg_file(path: Path) -> dict:
    """Parse .msg → dict for JSON storage."""
    size = path.stat().st_size
    if size == 0:
        return {
            "kind": "email",
            "name": path.name,
            "subject": "(empty file)",
            "from": "", "to": "", "date": "",
            "body_text": "File is empty — email was not downloaded.",
            "body_html": None,
        }
    if size > MSG_SIZE_LIMIT:
        # Extract just subject line from filename; skip full parse of huge files
        subject_hint = path.stem
        return {
            "kind": "email",
            "name": path.name,
            "subject": subject_hint,
            "from": "", "to": "", "date": "",
            "body_text": f"[File too large to parse inline ({size // 1024} KB) — download to view]",
            "body_html": None,
            "too_large": True,
        }
    if not HAS_EXTRACT_MSG:
        return {
            "kind": "email",
            "name": path.name,
            "subject": path.stem,
            "from": "", "to": "", "date": "",
            "body_text": f"[extract_msg not available — cannot parse {path.name}]",
            "body_html": None,
        }
    try:
        m = extract_msg.openMsg(str(path))
        body_html = None
        if m.htmlBody:
            raw = m.htmlBody if isinstance(m.htmlBody, bytes) else m.htmlBody.encode()
            body_html = clean_html(raw)
        return {
            "kind": "email",
            "name": path.name,
            "subject": m.subject or "",
            "from": m.sender or "",
            "to": m.to or "",
            "date": str(m.date) if m.date else "",
            "body_text": (m.body or "")[:8000],
            "body_html": body_html,
        }
    except Exception as e:
        return {
            "kind": "email",
            "name": path.name,
            "subject": path.stem,
            "from": "", "to": "", "date": "",
            "body_text": f"[parse error: {e}]",
            "body_html": None,
        }


def parse_eml_file(path: Path) -> dict:
    """Parse .eml → dict."""
    import email as emaillib
    try:
        with open(path, "rb") as f:
            msg = emaillib.message_from_bytes(f.read())
        subject = msg.get("Subject", "")
        from_ = msg.get("From", "")
        to_ = msg.get("To", "")
        date_ = msg.get("Date", "")
        body_text = ""
        body_html = None
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/plain" and not body_text:
                body_text = part.get_payload(decode=True).decode("utf-8", errors="replace")[:8000]
            elif ct == "text/html" and not body_html:
                raw = part.get_payload(decode=True)
                body_html = clean_html(raw)
        return {
            "kind": "email",
            "name": path.name,
            "subject": subject,
            "from": from_,
            "to": to_,
            "date": date_,
            "body_text": body_text,
            "body_html": body_html,
        }
    except Exception as e:
        return {
            "kind": "email",
            "name": path.name,
            "subject": path.stem,
            "from": "", "to": "", "date": "",
            "body_text": f"[parse error: {e}]",
            "body_html": None,
        }


# ── Read XLSX ─────────────────────────────────────────────────────────────────

def read_v30_rows() -> list[dict]:
    wb = openpyxl.load_workbook(V28_XLSX)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    # Row 2 (index 2) = headers
    header_row = rows[2]
    headers = {v: i for i, v in enumerate(header_row) if v is not None}

    def col(row, name, default=""):
        idx = headers.get(name)
        if idx is None:
            return default
        v = row[idx]
        return v if v is not None else default

    data_rows = []
    for i, row in enumerate(rows[3:], start=1):  # data starts at row index 3
        if row[0] is None:
            continue  # skip empty
        desc = col(row, "Description")
        if not desc:
            continue
        ticket = col(row, "*Invoice Number")  # not the right col — use description parsing
        # Get the ticket number from description field or Agent Segments Breakdown
        # Actually ticket is in description e.g. "LASTNAME/FIRSTNAME MR - RUH CDG (6905428827)"
        # or "(26-731)"
        ticket_no = ""
        m = re.search(r'\((\d{10})\)', str(desc))
        if m:
            ticket_no = m.group(1)
        else:
            m = re.search(r'\((26-\d+)\)', str(desc))
            if m:
                ticket_no = m.group(1)

        data_rows.append({
            "row_idx": i,
            "ticket_no": ticket_no,
            "description": str(desc),
            "amount": col(row, "*Invoice Amount"),
            "account": str(col(row, "Account")),
            "gl": str(col(row, "GL")),
            "cost_center": str(col(row, "Cost Center")),
            "cost_name": str(col(row, "Cost Name")),
            "div": str(col(row, "DIV")),
            "solution": str(col(row, "Solution")),
            "solution_name": str(col(row, "Solution Name")),
            "agency": str(col(row, "Agency")),
            "agency_name": str(col(row, "Agency Name")),
            "emp_no": str(col(row, "Employee No")),
            "row_status": str(col(row, "Row Status")),
            "qc_catches": str(col(row, "QC Catches")),
            "resolution_layer": str(col(row, "Resolution Layer")),
            "resolution_confidence": str(col(row, "Resolution Confidence")),
            "trip_purpose": str(col(row, "Trip Purpose")),
            "agent_method": str(col(row, "Agent Method")),
        })

    return data_rows


# ── Read step-trace ───────────────────────────────────────────────────────────

def read_step_trace() -> dict[str, dict]:
    """Returns dict keyed by ticket_no → step-trace entry."""
    result = {}
    if not STEP_TRACE.exists():
        return result
    with open(STEP_TRACE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                desc = entry.get("description", "")
                # Extract ticket from description
                m = re.search(r'\((\d{10})\)', desc)
                if m:
                    result[m.group(1)] = entry
                else:
                    m = re.search(r'\((26-\d+)\)', desc)
                    if m:
                        result[m.group(1)] = entry
            except Exception:
                pass
    return result


# ── Build folder index ────────────────────────────────────────────────────────

def build_folder_index() -> dict[str, Path]:
    """
    Returns dict: ticket_no → best evidence folder path.
    Ticket can be a 10-digit number or 26-NNN.
    Also returns non-ticket folders (events) keyed by folder name.
    """
    index: dict[str, Path] = {}

    for date_dir in sorted(RAW.iterdir()):
        if not date_dir.is_dir() or date_dir.name in (".", ".."):
            continue
        # Skip files at top level
        for ev_dir in sorted(date_dir.iterdir()):
            if not ev_dir.is_dir():
                continue
            folder_name = ev_dir.name
            # Check if folder name starts with a ticket number
            m = re.match(r'^(\d{10})', folder_name)
            if m:
                ticket = m.group(1)
                if ticket not in index:
                    index[ticket] = ev_dir
                # Some folders like "6905515516-17" contain two tickets
                m2 = re.match(r'^\d{10}-(\d{2})$', folder_name)
                if m2:
                    # second ticket is same prefix + last 2 digits
                    t2 = ticket[:8] + m2.group(1)
                    if t2 not in index:
                        index[t2] = ev_dir
            else:
                # Non-ticket folder (event code, name-based, etc.)
                # Also index by partial name fragments for fuzzy matching later
                index[folder_name] = ev_dir

    return index


# ── Process evidence for a folder ────────────────────────────────────────────

def process_evidence_folder(folder_path: Path, out_key: str) -> list[dict]:
    """
    Process all evidence files in folder_path.
    Copies PDFs to DASH_EV/{out_key}/
    Parses .msg/.eml to inline JSON.
    Returns list of evidence file metadata dicts.
    """
    out_dir = DASH_EV / out_key
    out_dir.mkdir(parents=True, exist_ok=True)

    files = []
    for f in sorted(folder_path.iterdir()):
        if not f.is_file():
            continue
        ext = f.suffix.lower()

        if ext == ".pdf":
            # Copy PDF to public dir
            dest = out_dir / f.name
            if not dest.exists():
                shutil.copy2(f, dest)
            files.append({
                "kind": "pdf",
                "name": f.name,
                "url": f"/evidence/{BATCH_SLUG}/{out_key}/{f.name}",
                "size": f.stat().st_size,
            })

        elif ext == ".msg":
            parsed = parse_msg_file(f)
            # Save parsed msg as JSON for the viewer
            json_name = f.stem + ".msg.json"
            dest = out_dir / json_name
            with open(dest, "w", encoding="utf-8") as jf:
                json.dump(parsed, jf, ensure_ascii=False)
            files.append({
                "kind": "email",
                "name": f.name,
                "url": f"/evidence/{BATCH_SLUG}/{out_key}/{json_name}",
                "subject": parsed.get("subject", ""),
                "from": parsed.get("from", ""),
                "date": parsed.get("date", ""),
            })

        elif ext == ".eml":
            parsed = parse_eml_file(f)
            json_name = f.stem + ".eml.json"
            dest = out_dir / json_name
            with open(dest, "w", encoding="utf-8") as jf:
                json.dump(parsed, jf, ensure_ascii=False)
            files.append({
                "kind": "email",
                "name": f.name,
                "url": f"/evidence/{BATCH_SLUG}/{out_key}/{json_name}",
                "subject": parsed.get("subject", ""),
                "from": parsed.get("from", ""),
                "date": parsed.get("date", ""),
            })

    return files


# ── GL account labels ─────────────────────────────────────────────────────────

GL_LABELS = {
    "60301003": "Travel Tickets",
    "60301004": "Travel Cost G&A",
    "60307021": "Sponsoring",
    "60308007": "Recruitment Fees",
    "60308009": "Training",
    "21070227": "Accrued Project/Warranty",
    "21070229": "Personal Contribution",
    "11110001": "Holding Receivable",
}

def gl_label(account: str) -> str:
    return GL_LABELS.get(str(account).strip(), str(account))


# ── Main ──────────────────────────────────────────────────────────────────────

def main(no_cache: bool = False):
    print("Reading v30 output...")
    rows = read_v30_rows()
    print(f"  {len(rows)} data rows")

    print("Reading step-trace...")
    traces = read_step_trace()
    print(f"  {len(traces)} LLM-traced rows")

    print("Building folder index...")
    folder_idx = build_folder_index()
    ticket_folders = {k: v for k, v in folder_idx.items() if re.match(r'^\d{10}$', k)}
    event_folders = {k: v for k, v in folder_idx.items() if not re.match(r'^\d{10}$', k)}
    print(f"  {len(ticket_folders)} ticket folders, {len(event_folders)} event/other folders")

    print("Processing evidence...")
    DASH_EV.mkdir(parents=True, exist_ok=True)

    # Build evidence map: ticket_no / folder_name → evidence file list
    ev_map: dict[str, list[dict]] = {}

    # Process all folders (ticket + non-ticket)
    for key, folder_path in {**ticket_folders, **event_folders}.items():
        safe_key = re.sub(r'[^\w\-. ]', '_', key)
        out_dir = DASH_EV / safe_key
        # --no-cache: flush previously processed output so the source folder is
        # rescanned fresh (picks up files added/changed since the last run)
        if no_cache and out_dir.exists():
            shutil.rmtree(out_dir)
        # Skip if already processed (has at least one output file)
        if out_dir.exists() and any(out_dir.iterdir()):
            # Rebuild file list from existing output
            ev_files = []
            for f in sorted(out_dir.iterdir()):
                if f.suffix.lower() == '.pdf':
                    ev_files.append({
                        "kind": "pdf",
                        "name": f.name,
                        "url": f"/evidence/{BATCH_SLUG}/{safe_key}/{f.name}",
                        "size": f.stat().st_size,
                    })
                elif f.name.endswith('.msg.json') or f.name.endswith('.eml.json'):
                    try:
                        with open(f) as jf:
                            meta = json.load(jf)
                        orig_name = f.stem.replace('.msg', '.msg').replace('.eml', '.eml')
                        # Restore original filename
                        orig_name = f.stem  # e.g. "RE_ foo.msg"
                        ev_files.append({
                            "kind": "email",
                            "name": orig_name,
                            "url": f"/evidence/{BATCH_SLUG}/{safe_key}/{f.name}",
                            "subject": meta.get("subject", ""),
                            "from": meta.get("from", ""),
                            "date": meta.get("date", ""),
                        })
                    except Exception:
                        pass
            if ev_files:
                ev_map[key] = ev_files
                print(f"  {key}: {len(ev_files)} files (cached)")
                continue

        ev_files = process_evidence_folder(folder_path, safe_key)
        if ev_files:
            ev_map[key] = ev_files
            print(f"  {key}: {len(ev_files)} files")

    # Annotate rows with evidence + trace
    output_rows = []
    for row in rows:
        ticket = row["ticket_no"]
        # Find evidence: first try direct ticket match
        ev_files = ev_map.get(ticket, [])
        ev_folder_used = ticket if ev_files else ""

        # If no direct match, check if step-trace has an evidence folder for this ticket
        trace = traces.get(ticket)
        if not ev_files and trace:
            ev_folder_path = (trace.get("call1") or {}).get("evidence_folder", "")
            if ev_folder_path:
                folder_key = Path(ev_folder_path).name
                if folder_key in ev_map:
                    ev_files = ev_map[folder_key]
                    ev_folder_used = folder_key

        row["evidence"] = ev_files
        row["evidence_folder"] = ev_folder_used
        row["llm_routed"] = trace is not None
        if trace:
            row["llm_trace"] = {
                "route_reason": trace.get("route_reason", ""),
                "row_type": (trace.get("call1") or {}).get("row_type", ""),
                "reasoning": (trace.get("final") or {}).get("reasoning", ""),
                "confidence": (trace.get("final") or {}).get("confidence", ""),
                "model": (trace.get("call2") or {}).get("model", ""),
                "opex_code": (trace.get("call1") or {}).get("opex_code", ""),
            }
        else:
            row["llm_trace"] = None

        row["gl_label"] = gl_label(row["account"])
        output_rows.append(row)

    # Save rows JSON
    DASH_DATA.mkdir(parents=True, exist_ok=True)
    rows_out = DASH_DATA / f"{BATCH_ID.lower().replace('-', '')}-rows-v30.json"
    def write_rows_json(tmp_path: Path) -> None:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump({
                "version": "v30",
                "batch": BATCH_ID,
                "total_rows": len(output_rows),
                "llm_rows": sum(1 for r in output_rows if r["llm_routed"]),
                "rows": output_rows,
            }, f, ensure_ascii=False, default=str)

    atomic_replace(rows_out, write_rows_json)

    size_kb = rows_out.stat().st_size // 1024
    print(f"\nWrote {rows_out} ({size_kb} KB)")

    # Also copy the v30 xlsx to public outputs
    out_xlsx = ROOT / f"dashboard/public/outputs/Spreadsheet-{BATCH_ID}-FILLED-v30.xlsx"
    atomic_replace(out_xlsx, lambda tmp_path: shutil.copy2(V28_XLSX, tmp_path))
    print(f"Copied v30 XLSX to {out_xlsx}")

    print("\nDone.")
    print(f"  Rows: {len(output_rows)}")
    print(f"  Rows with evidence: {sum(1 for r in output_rows if r['evidence'])}")
    print(f"  LLM-routed rows: {sum(1 for r in output_rows if r['llm_routed'])}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build v30 portal review data")
    ap.add_argument("--batch", default=BATCH_ID, help="Batch id, e.g. J26-788")
    ap.add_argument("--raw-dir", default=None, help="Canonical raw directory for this batch")
    ap.add_argument("--no-cache", action="store_true",
                    help="Flush cached evidence output dirs and rescan all evidence folders fresh")
    args = ap.parse_args()
    configure_batch(args.batch, args.raw_dir)
    main(no_cache=args.no_cache)
