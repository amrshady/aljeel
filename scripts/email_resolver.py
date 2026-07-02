#!/usr/bin/env python3
"""
Email Resolver — Layer 1.5 in the 10-layer resolution cascade.

Extracts employee @aljeel.com email from .msg email bodies and uses it as a
deterministic identity key for employee resolution.

Email extraction priority:
  a) Inner forwarded thread From: line (after Sanad gatekeeper)
  b) Oracle ERP Submitted-by / approval chain From:
  c) To: of the ERP Prod notification
  d) Any <user@aljeel.com> in body, excluding known intermediaries

Resolution path:
  - If Manpower has Email column → deterministic match (conf 1.0)
  - If no Email column → use learned email→emp_no cache from prior
    resolutions (conf 0.95)
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

# ============================================================================
# Constants
# ============================================================================

CACHE_PATH = Path("/home/clawdbot/.openclaw/workspace/aljeel/cache/email_to_empno.json")
DERIVED_PATH = Path("/home/clawdbot/.openclaw/workspace/aljeel/cache/manpower_email_derived.json")

# Known intermediaries / system emails to exclude
INTERMEDIARY_EMAILS = {
    "sfalshammari@aljeel.com",    # Sanad — gatekeeper, always outer From:
    "info@aljeel.com",             # Generic info
}
INTERMEDIARY_DOMAINS = {
    "jawwaltravel.net",            # Jawwal travel agent
    "oraclecloud.com",             # Oracle ERP workflow sender
}

ALJEEL_EMAIL_RE = re.compile(r'([\w.+-]+@aljeel\.com)', re.IGNORECASE)

# From: header pattern in forwarded body (captures Name <email> or just email)
INNER_FROM_RE = re.compile(
    r'From:\s*(?:[^<\n]*?<\s*)?([\w.+-]+@aljeel\.com)\s*>?',
    re.IGNORECASE
)

# Oracle approval chain: "Submitted by Name" or "Approved by Name" followed by email
APPROVAL_FROM_RE = re.compile(
    r'(?:Submitted|Approved)\s+by\s+[^<\n]*?<?\s*([\w.+-]+@aljeel\.com)\s*>?',
    re.IGNORECASE
)

# To: header pattern
TO_RE = re.compile(
    r'To:\s*(?:[^<\n]*?<\s*)?([\w.+-]+@aljeel\.com)\s*>?',
    re.IGNORECASE
)


# ============================================================================
# Email extraction
# ============================================================================

def _is_intermediary(email: str) -> bool:
    """Check if an email is a known intermediary/system address."""
    email_lower = email.lower().strip()
    if email_lower in INTERMEDIARY_EMAILS:
        return True
    domain = email_lower.split("@", 1)[-1] if "@" in email_lower else ""
    for d in INTERMEDIARY_DOMAINS:
        if d in domain:
            return True
    return False


def _clean_email(raw: str) -> str:
    """Clean up email: strip mailto:, angle brackets, whitespace."""
    e = raw.strip().lower()
    e = re.sub(r'\s*<\s*mailto:', '', e)
    e = re.sub(r'\s*<\s*', '', e)
    e = re.sub(r'\s*>\s*', '', e)
    e = e.strip()
    return e


def extract_employee_email(msg_body: str, msg_sender: str = "",
                            msg_to: list[str] = None) -> Optional[str]:
    """Extract the employee's @aljeel.com email from .msg data.
    
    Priority:
      a) Inner forwarded From: (skipping outer gatekeeper)
      b) Oracle approval chain From:
      c) To: of ERP notification
      d) Any non-intermediary @aljeel.com in body
    
    Returns cleaned email or None.
    """
    if not msg_body:
        return None
    
    # Strategy (a): Inner forwarded From: lines
    # The outer email is typically from Sanad (sfalshammari@aljeel.com) forwarding
    # The inner From: is the actual employee
    inner_froms = INNER_FROM_RE.findall(msg_body)
    # Take all From: emails, filter intermediaries, take the LAST one
    # (in forwarded chains, last From: = innermost = the employee)
    candidate_froms = []
    for e in inner_froms:
        clean = _clean_email(e)
        if not _is_intermediary(clean) and '@aljeel.com' in clean:
            candidate_froms.append(clean)
    
    if candidate_froms:
        # In Oracle form emails, the employee From: is typically the first non-intermediary
        # In forwarded chains, it's the innermost (last)
        # Heuristic: if the .msg filename contains "Approved_ Personal Contribution",
        # the employee From: is first non-intermediary. Otherwise, try last.
        # Simplification: first non-intermediary From: is usually the employee
        return candidate_froms[0]
    
    # Strategy (b): Oracle approval chain
    approval_emails = APPROVAL_FROM_RE.findall(msg_body)
    for e in approval_emails:
        clean = _clean_email(e)
        if not _is_intermediary(clean) and '@aljeel.com' in clean:
            return clean
    
    # Strategy (c): To: of ERP notification
    to_emails = TO_RE.findall(msg_body)
    for e in to_emails:
        clean = _clean_email(e)
        if not _is_intermediary(clean) and '@aljeel.com' in clean:
            return clean
    
    # Strategy (d): Any non-intermediary @aljeel.com in body
    all_aljeel = ALJEEL_EMAIL_RE.findall(msg_body)
    non_intermediary = []
    for e in all_aljeel:
        clean = _clean_email(e)
        if not _is_intermediary(clean) and '@aljeel.com' in clean:
            non_intermediary.append(clean)
    
    if len(non_intermediary) == 1:
        # Only one non-intermediary email — likely the employee
        return non_intermediary[0]
    elif len(non_intermediary) > 1:
        # Multiple candidates — can't determine which is the employee
        # Return None; let other layers handle it
        return None
    
    return None


# ============================================================================
# Email→Emp Resolution
# ============================================================================

def _load_email_cache() -> dict:
    """Load email→emp_no cache."""
    if CACHE_PATH.exists():
        try:
            with open(CACHE_PATH) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def save_email_cache(cache: dict):
    """Save email→emp_no cache."""
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)


def resolve_by_email(email: str, md, manpower_emails: dict = None) -> Optional[dict]:
    """Try to resolve an employee via email.
    
    Args:
        email: The @aljeel.com email to resolve
        md: MasterData instance
        manpower_emails: dict mapping email→emp_no from Manpower Email column (if exists)
    
    Returns:
        dict with emp_no, confidence, source, or None
    """
    if not email:
        return None
    
    email_lower = email.lower().strip()
    
    # Priority 1: Manpower Email column (if exists)
    if manpower_emails and email_lower in manpower_emails:
        emp_no = manpower_emails[email_lower]
        if emp_no in md.employees:
            return {
                "emp_no": emp_no,
                "confidence": 1.0,
                "source": "manpower_email",
                "flag": "RESOLVED_VIA_MANPOWER_EMAIL",
            }
    
    # Priority 2: Learned email→emp_no cache
    cache = _load_email_cache()
    if email_lower in cache:
        emp_no = cache[email_lower]
        if emp_no in md.employees:
            return {
                "emp_no": emp_no,
                "confidence": 0.95,
                "source": "learned_email_cache",
                "flag": "RESOLVED_VIA_LEARNED_EMAIL",
            }
    
    return None


# ============================================================================
# Cache enrichment (called after full resolution)
# ============================================================================

def enrich_email_cache(pairs: list[tuple[str, int, str, float]]):
    """Add resolved email→emp_no pairs to cache.
    
    Args:
        pairs: list of (email, emp_no, resolution_source, confidence) tuples
    """
    cache = _load_email_cache()
    derived = _load_derived_cache()
    
    for email, emp_no, source, conf in pairs:
        if email and emp_no:
            email_lower = email.lower().strip()
            cache[email_lower] = emp_no
            
            # Also update the derived Manpower email mapping
            emp_key = str(emp_no)
            if emp_key not in derived:
                derived[emp_key] = {
                    "email": email_lower,
                    "source": source,
                    "confidence": conf,
                    "first_seen": _today(),
                    "batches": [],
                }
            derived[emp_key]["email"] = email_lower
            derived[emp_key]["confidence"] = max(derived[emp_key].get("confidence", 0), conf)
    
    save_email_cache(cache)
    _save_derived_cache(derived)


def _load_derived_cache() -> dict:
    if DERIVED_PATH.exists():
        try:
            with open(DERIVED_PATH) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def _save_derived_cache(data: dict):
    DERIVED_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DERIVED_PATH, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def update_derived_batch(batch_id: str):
    """Update the derived cache with the batch ID."""
    derived = _load_derived_cache()
    for key in derived:
        if "batches" not in derived[key]:
            derived[key]["batches"] = []
        if batch_id and batch_id not in derived[key]["batches"]:
            derived[key]["batches"].append(batch_id)
    _save_derived_cache(derived)


def _today() -> str:
    from datetime import date
    return date.today().isoformat()


# ============================================================================
# Manpower Email column detection
# ============================================================================

def detect_manpower_email_column(master_data_xlsx) -> dict:
    """Check if Manpower sheet has an Email column and build email→emp_no map.
    
    Returns dict mapping email_lower → emp_no, or empty dict if no Email column.
    """
    import pandas as pd
    try:
        mp = pd.read_excel(master_data_xlsx, sheet_name="Manpower", header=6)
        # Look for Email/Mail/Address column
        email_col = None
        for i, col in enumerate(mp.columns):
            col_str = str(col).lower()
            if any(kw in col_str for kw in ["email", "mail", "e-mail"]):
                # Verify it actually contains @ values
                sample = mp.iloc[:, i].dropna().astype(str)
                if sample.str.contains("@").any():
                    email_col = i
                    break
        
        if email_col is None:
            return {}
        
        mapping = {}
        for _, row in mp.iterrows():
            emp_no = row.iloc[0]
            email_val = row.iloc[email_col]
            if pd.notna(emp_no) and pd.notna(email_val):
                try:
                    eno = int(float(str(emp_no)))
                    email_str = str(email_val).strip().lower()
                    if "@" in email_str:
                        mapping[email_str] = eno
                except (ValueError, TypeError):
                    continue
        
        return mapping
    except Exception:
        return {}


# ============================================================================
# Report generation
# ============================================================================

def generate_email_report(
    extraction_log: list[dict],
    derived_cache: dict,
    report_dir: Path,
    batch_ids: list[str],
):
    """Generate email extraction reports and deliverables.
    
    Args:
        extraction_log: per-line extraction records
        derived_cache: the manpower_email_derived cache
        report_dir: where to write reports
        batch_ids: list of processed batch IDs
    """
    report_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Email extraction report (markdown)
    total = len(extraction_log)
    with_email = sum(1 for e in extraction_log if e.get("extracted_email"))
    resolved_via_email = sum(1 for e in extraction_log if e.get("resolved_via_email"))
    
    lines = [
        "# Email Extraction Report",
        f"",
        f"**Generated:** {_today()}",
        f"**Batches:** {', '.join(batch_ids)}",
        f"",
        f"## Summary",
        f"",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Total lines processed | {total} |",
        f"| Lines with .msg email extracted | {with_email} ({100*with_email//max(total,1)}%) |",
        f"| Lines resolved via email (L1.5) | {resolved_via_email} |",
        f"| Unique emails in derived cache | {len(derived_cache)} |",
        f"",
        f"## Extraction Details",
        f"",
    ]
    
    for entry in extraction_log:
        if entry.get("extracted_email"):
            flag = " ✅" if entry.get("resolved_via_email") else ""
            lines.append(
                f"- **{entry.get('passenger', '?')}** | "
                f"email=`{entry['extracted_email']}` | "
                f"emp={entry.get('emp_no', 'N/A')}{flag}"
            )
    
    lines.append("")
    lines.append("## Unextracted Lines")
    lines.append("")
    for entry in extraction_log:
        if not entry.get("extracted_email"):
            lines.append(f"- {entry.get('passenger', '?')} | reason: {entry.get('no_email_reason', 'unknown')}")
    
    with open(report_dir / "email-extraction-report.md", "w") as f:
        f.write("\n".join(lines))
    
    # 2. Proposed Manpower email column CSV
    csv_lines = ["Emp No,Email"]
    for emp_key, data in sorted(derived_cache.items()):
        csv_lines.append(f"{emp_key},{data['email']}")
    
    with open(report_dir / "proposed-manpower-email-column.csv", "w") as f:
        f.write("\n".join(csv_lines))
    
    # 3. Email extraction cache JSON
    cache = _load_email_cache()
    with open(report_dir / "email-extraction-cache.json", "w") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)
    
    return {
        "total_lines": total,
        "with_email": with_email,
        "resolved_via_email": resolved_via_email,
        "unique_derived": len(derived_cache),
    }
