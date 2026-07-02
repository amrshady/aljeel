#!/usr/bin/env python3
"""
Sponsorship Pattern Detector — Heuristic detection of sponsorship/HCP emails.

If no Person Number in body, no OPEX PDF, and pax name NOT in Manpower,
likely a sponsorship.
"""
from __future__ import annotations

import re
from typing import Optional


# Keywords suggesting sponsorship (EN/AR)
SPONSORSHIP_KEYWORDS_EN = [
    r"\bhost\b", r"\bconsultant\b", r"\bdoctor\b", r"\bhcp\b",
    r"\bsponsor(?:ship|ing|ed)?\b", r"\bsymposium\s+guest\b",
    r"\bguest\s+speaker\b", r"\binvited\s+speaker\b",
    r"\bkey\s+opinion\s+leader\b", r"\bkol\b",
]
SPONSORSHIP_KEYWORDS_AR = [
    r"معالي", r"ضيف", r"راعي", r"مستشار",
    r"استشاري", r"طبيب", r"دكتور",
]


def detect_sponsorship(
    msg_body: str,
    subject: str,
    attachment_names: list[str],
    emp_no_from_form: Optional[str],
    emp_no_from_manpower: Optional[int],
    has_oracle_form: bool,
    has_opex_pdf: bool,
) -> Optional[dict]:
    """Detect if this email is a sponsorship/HCP case.
    
    Returns dict with form_type='sponsorship' or None.
    """
    # If we already have an Oracle form or OPEX PDF, it's not a pure sponsorship
    if has_oracle_form or has_opex_pdf:
        return None
    
    # If employee is in Manpower, it's not sponsorship
    if emp_no_from_manpower is not None:
        return None
    
    # If form had a Person Number and it's valid, not sponsorship
    if emp_no_from_form and len(emp_no_from_form) >= 7:
        return None
    
    # Check for sponsorship keywords
    combined = (msg_body or "") + " " + (subject or "")
    confidence = 0.0
    matched_keywords = []
    
    for pat in SPONSORSHIP_KEYWORDS_EN:
        if re.search(pat, combined, re.IGNORECASE):
            confidence += 0.2
            matched_keywords.append(pat)
    
    for pat in SPONSORSHIP_KEYWORDS_AR:
        if re.search(pat, combined):
            confidence += 0.15
            matched_keywords.append(pat)
    
    # Check for "Dr." prefix in description/body
    if re.search(r"\bDr\.?\s+[A-Z]", combined):
        confidence += 0.15
        matched_keywords.append("Dr. prefix")
    if re.search(r"د\.\s", combined):
        confidence += 0.15
        matched_keywords.append("Arabic Dr. prefix")
    
    # If no keywords matched but employee not in manpower, low confidence sponsorship
    if not matched_keywords:
        confidence = 0.3  # Base: not in manpower + no form
    
    confidence = min(1.0, confidence)
    
    if confidence < 0.25:
        return None
    
    # Try to extract host/guest name
    host_name_hint = None
    # Look for "Dr. FirstName LastName" pattern
    m = re.search(r"(?:Dr\.?\s+|د\.\s*)([A-Za-z][A-Za-z\s.'-]+?)(?:\s*[-,\n(]|$)", combined)
    if m:
        host_name_hint = m.group(1).strip()
    
    return {
        "form_type": "sponsorship",
        "auto_account": "60307021",  # Sponsoring Expenses
        "host_name_hint": host_name_hint,
        "confidence": round(confidence, 2),
        "matched_keywords": matched_keywords,
    }

# =============================================================================
# v15.11 (Amr May 25, Change #5): Sponsorship form lookup logic.
#
# When a sponsorship row has no employee number (guest/doctor scenario),
# open the request form (in the .msg chain or attached PDF), find the
# REQUESTING employee (the AlJeel staff member who sponsored the guest),
# verify approval process is complete, charge to requesting employee's GL,
# flag INCOMPLETE_SPONSORSHIP_APPROVAL if any approval step missing.
#
# Mai-approval check is intentionally NOT done here (per v15.11 Change #4:
# Mai is HR-only -- applies to training + annual tickets, not sponsorships).
# =============================================================================

import re as _re

# Approval-completion signals (forms with proper sign-off carry these markers).
APPROVAL_COMPLETE_TOKENS = (
    "approved", "approval", "approve",
    "\u064a\u0639\u062a\u0645\u062f",  # يعتمد
    "\u0645\u0639\u062a\u0645\u062f",  # معتمد
    "\u062a\u0645 \u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f",  # تم الاعتماد
    "signed", "sign-off", "signoff",
)

# Patterns that indicate a "requesting employee" field in a form.
REQUESTING_EMP_PATTERNS = (
    _re.compile(r"requested\s+by[:\s]+([^\n\r]+)", _re.IGNORECASE),
    _re.compile(r"requesting\s+employee[:\s]+([^\n\r]+)", _re.IGNORECASE),
    _re.compile(r"sponsor(?:ed)?\s+by[:\s]+([^\n\r]+)", _re.IGNORECASE),
    _re.compile(r"applicant[:\s]+([^\n\r]+)", _re.IGNORECASE),
    _re.compile(r"\u0645\u0642\u062f\u0645\s+\u0627\u0644\u0637\u0644\u0628[:\s]+([^\n\r]+)"),
    _re.compile(r"\u0627\u0633\u0645\s+\u0627\u0644\u0645\u0648\u0638\u0641[:\s]+([^\n\r]+)"),
)

# Employee number patterns embedded in form bodies (7-digit AlJeel emp_no, starts with 10).
EMP_NUMBER_PATTERN = _re.compile(r"\b(10\d{5})\b")


def find_requesting_employee_from_form(form_data, msg_body=None):
    """Extract the AlJeel staff member who requested/sponsored an HCP visit.

    Returns dict with:
      - requesting_emp_no (str or None)
      - requesting_emp_name (str or None)
      - approval_complete (bool)
      - flags (list[str]) -- INCOMPLETE_SPONSORSHIP_APPROVAL,
                             EXTERNAL_SPONSORSHIP_NO_EMP_NUM
    """
    result = {
        "requesting_emp_no": None,
        "requesting_emp_name": None,
        "approval_complete": False,
        "flags": [],
    }

    parts = []
    if isinstance(form_data, dict):
        for k in ("body_text", "subject", "form_body", "raw_text", "extracted_text"):
            v = form_data.get(k)
            if v:
                parts.append(str(v))
        for k in ("requesting_emp_no", "requester_emp_no", "applicant_emp_no"):
            v = form_data.get(k)
            if v:
                m = _re.search(r"\b(10\d{5})\b", str(v))
                if m:
                    result["requesting_emp_no"] = m.group(1)
        for k in ("requesting_emp_name", "requester_name", "applicant_name"):
            v = form_data.get(k)
            if v and not result["requesting_emp_name"]:
                result["requesting_emp_name"] = str(v).strip()
    if msg_body:
        parts.append(str(msg_body))
    blob = "\n".join(parts)

    if not result["requesting_emp_no"]:
        for pat in REQUESTING_EMP_PATTERNS:
            for m in pat.finditer(blob):
                start, end = m.span()
                ctx = blob[max(0, start - 50): min(len(blob), end + 200)]
                num_m = EMP_NUMBER_PATTERN.search(ctx)
                if num_m:
                    result["requesting_emp_no"] = num_m.group(1)
                if not result["requesting_emp_name"]:
                    candidate = m.group(1).strip()
                    candidate = _re.sub(r"[\s,;]+$", "", candidate)
                    if candidate and len(candidate) < 150:
                        result["requesting_emp_name"] = candidate
                if result["requesting_emp_no"]:
                    break
            if result["requesting_emp_no"]:
                break

    blob_low = blob.lower()
    matches = sum(1 for t in APPROVAL_COMPLETE_TOKENS if t.lower() in blob_low)
    result["approval_complete"] = matches >= 2

    if not result["approval_complete"]:
        result["flags"].append("INCOMPLETE_SPONSORSHIP_APPROVAL")
    if not result["requesting_emp_no"]:
        result["flags"].append("EXTERNAL_SPONSORSHIP_NO_EMP_NUM")

    return result
