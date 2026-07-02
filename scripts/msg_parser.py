#!/usr/bin/env python3
"""
MSG Parser - Production-grade .msg email body extraction.

Extracts subject, body (plain text), sender, to/cc, date, attachments
from Outlook .msg files. Handles UTF-8, Arabic, mixed AR/EN.

Falls back to msgconvert -> .eml parse if extract-msg fails.

Caches parsed results to extracted/msg-cache/<sha256>.json for fast re-runs.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime
from email import policy
from email.parser import BytesParser
from pathlib import Path
from typing import Optional

CACHE_DIR = Path("/home/clawdbot/.openclaw/workspace/aljeel/extracted/msg-cache")
CACHE_VERSION = "v4"
HTML_SECTION_SEPARATOR = "\n\n--- FORM DATA (HTML) ---\n\n"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _strip_html(html: str) -> str:
    """Naive HTML strip for fallback bodies."""
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            lines.append("")
            continue
        if "protection.sophos.com" in stripped.lower():
            continue
        tokens = []
        for token in stripped.split():
            if re.search(r"[A-Za-z0-9+/]{60,}={0,2}", token):
                continue
            tokens.append(token)
        stripped = " ".join(tokens).strip()
        if not stripped or re.match(r"^https?://\S+$", stripped, flags=re.IGNORECASE):
            continue
        lines.append(stripped)
    text = "\n".join(lines)
    text = re.sub(r"\n[ \t]+\n", "\n\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text.strip()


def _build_body_text(plain: str, html_text: str) -> str:
    """Join plain and HTML text while preserving the plain body."""
    body_text = plain
    if html_text.strip() and html_text.strip() != plain.strip():
        body_text = plain + HTML_SECTION_SEPARATOR + html_text
    return body_text


def _parse_with_extract_msg(path: Path) -> dict:
    """Primary parser using extract-msg library."""
    import extract_msg

    msg = extract_msg.Message(path)
    try:
        plain = msg.body or ""
        html_text = ""
        if msg.htmlBody:
            html_text = _strip_html(
                msg.htmlBody.decode("utf-8", errors="replace")
                if isinstance(msg.htmlBody, bytes) else msg.htmlBody
            )
        body_text = _build_body_text(plain, html_text)

        to_list = []
        if msg.to:
            to_list = [t.strip() for t in msg.to.split(";") if t.strip()]

        cc_list = []
        if msg.cc:
            cc_list = [c.strip() for c in msg.cc.split(";") if c.strip()]

        attachment_names = []
        if hasattr(msg, "attachments"):
            for att in msg.attachments:
                name = getattr(att, "longFilename", None) or getattr(att, "shortFilename", None) or ""
                if name:
                    attachment_names.append(name)

        received_at = None
        if msg.date:
            received_at = str(msg.date)

        return {
            "subject": msg.subject or "",
            "body_text": body_text,
            "sender": msg.sender or "",
            "to": to_list,
            "cc": cc_list,
            "received_at": received_at,
            "attachment_names": attachment_names,
            "parse_method": "extract_msg",
        }
    finally:
        msg.close()


def _parse_with_msgconvert(path: Path) -> Optional[dict]:
    """Fallback parser: msgconvert -> .eml -> email.parser."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            eml_path = Path(tmpdir) / "converted.eml"
            result = subprocess.run(
                ["msgconvert", "--outfile", str(eml_path), str(path)],
                capture_output=True, timeout=30,
            )
            if result.returncode != 0 or not eml_path.exists():
                return None

            with open(eml_path, "rb") as f:
                msg = BytesParser(policy=policy.default).parse(f)

            plain_part = msg.get_body(preferencelist=("plain",))
            html_part = msg.get_body(preferencelist=("html",))
            plain = plain_part.get_content() if plain_part else ""
            html_text = _strip_html(html_part.get_content()) if html_part else ""
            body_text = _build_body_text(plain, html_text)

            to_list = [str(a) for a in (msg.get("To", "") or "").split(",") if a.strip()]
            cc_list = [str(a) for a in (msg.get("Cc", "") or "").split(",") if a.strip()]

            return {
                "subject": msg.subject or "",
                "body_text": body_text,
                "sender": msg.get("From", ""),
                "to": to_list,
                "cc": cc_list,
                "received_at": msg.get("Date", ""),
                "attachment_names": [
                    part.get_filename() or ""
                    for part in msg.walk()
                    if part.get_content_disposition() == "attachment"
                ],
                "parse_method": "msgconvert_eml",
            }
    except Exception:
        return None


def parse_msg(path, use_cache=True):
    """Parse a .msg file and return structured data.

    Args:
        path: Path to the .msg file.
        use_cache: If True, cache results to disk.

    Returns:
        dict with keys: subject, body_text, sender, to, cc,
        received_at, attachment_names, parse_method.
        On failure, returns a dict with parse_method="failed" and an error key.
    """
    path = Path(path)
    if not path.exists():
        return {"parse_method": "failed", "error": f"File not found: {path}"}

    # Check cache
    file_hash = _sha256(path)
    if use_cache:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file = CACHE_DIR / f"{CACHE_VERSION}-{file_hash}.json"
        if cache_file.exists():
            with open(cache_file) as f:
                cached = json.load(f)
            cached["_cached"] = True
            return cached

    # Try extract-msg first
    result = None
    try:
        result = _parse_with_extract_msg(path)
    except Exception as e:
        # Fallback to msgconvert
        result = _parse_with_msgconvert(path)
        if result is None:
            result = {
                "parse_method": "failed",
                "error": str(e),
                "subject": "",
                "body_text": "",
                "sender": "",
                "to": [],
                "cc": [],
                "received_at": None,
                "attachment_names": [],
            }

    # Add metadata
    result["source_file"] = str(path)
    result["file_hash"] = file_hash

    # Cache
    if use_cache and result.get("parse_method") != "failed":
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file = CACHE_DIR / f"{CACHE_VERSION}-{file_hash}.json"
        with open(cache_file, "w") as f:
            json.dump(result, f, indent=2, ensure_ascii=False, default=str)

    return result


def find_msgs_for_ticket(ticket_no, raw_base):
    """Find all .msg files associated with a ticket number."""
    raw_base = Path(raw_base)
    results = []
    for dirpath, dirnames, filenames in os.walk(raw_base):
        dirname = os.path.basename(dirpath)
        if dirname.startswith(ticket_no) or dirname == ticket_no:
            for f in filenames:
                if f.lower().endswith(".msg"):
                    results.append(Path(dirpath) / f)
    return results


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 msg_parser.py <path_to_msg>")
        sys.exit(1)
    result = parse_msg(Path(sys.argv[1]))
    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
