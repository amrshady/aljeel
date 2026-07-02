#!/usr/bin/env python3
"""
Oracle Fusion Form Parser — Deep-body extraction of structured Oracle Fusion
request forms from .msg email bodies.

Handles both English and Arabic form fields.
Extracts: employee details, trip info, Division/Agency/Solution codes,
approver chain, and all structured form fields.
"""
from __future__ import annotations

import re
from typing import Optional


# Eastern Arabic numeral conversion
_EASTERN_ARABIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def _to_western(s: str) -> str:
    return s.translate(_EASTERN_ARABIC)


def _normalize_ws(s: str) -> str:
    return re.sub(r"[ \t]+", " ", s).strip()


def _extract_field(body: str, labels: list[str], stop_labels: list[str] = None) -> Optional[str]:
    """Extract field value after a label. Oracle form uses label\\n\\nvalue pattern."""
    for label in labels:
        escaped = re.escape(label)
        # Pattern: label + whitespace/newlines + value (next non-empty line)
        pat = escaped + r"\s*\n+\s*\n*\s*([^\n]+)"
        m = re.search(pat, body, re.IGNORECASE)
        if m:
            val = _normalize_ws(m.group(1))
            if val and not val.startswith("http") and not val.startswith("<http") and not val.startswith("mailto:"):
                if stop_labels:
                    if any(val.lower().startswith(sl.lower()) for sl in stop_labels):
                        continue
                return val

        # Tab-separated: label\tvalue
        pat2 = escaped + r"\s*\t+\s*([^\n\t]+)"
        m2 = re.search(pat2, body, re.IGNORECASE)
        if m2:
            val = _normalize_ws(m2.group(1))
            if val and not val.startswith("http"):
                return val
    return None


def _parse_date_flexible(s: str) -> Optional[str]:
    """Parse dates like '27-Apr-2026', '٣٠-أبريل-٢٠٢٦' to YYYY-MM-DD."""
    if not s:
        return None
    s = _to_western(s.strip())
    month_map = {
        "jan": "01", "feb": "02", "mar": "03", "apr": "04",
        "may": "05", "jun": "06", "jul": "07", "aug": "08",
        "sep": "09", "oct": "10", "nov": "11", "dec": "12",
        "january": "01", "february": "02", "march": "03", "april": "04",
        "june": "06", "july": "07", "august": "08", "september": "09",
        "october": "10", "november": "11", "december": "12",
        "يناير": "01", "فبراير": "02", "مارس": "03", "أبريل": "04",
        "أبر": "04", "مايو": "05", "يونيو": "06", "يوليو": "07",
        "أغسطس": "08", "سبتمبر": "09", "أكتوبر": "10", "نوفمبر": "11",
        "ديسمبر": "12",
    }
    m = re.match(r"(\d{1,2})\s*[-/]\s*(\S+)\s*[-/]\s*(\d{4})", s)
    if m:
        day = m.group(1).zfill(2)
        month_str = m.group(2).lower().strip(".")
        year = m.group(3)
        month = month_map.get(month_str)
        if month:
            return f"{year}-{month}-{day}"
    m2 = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m2:
        return s[:10]
    return None


def _parse_amount(s: str) -> Optional[float]:
    if not s:
        return None
    s = _to_western(s)
    s = re.sub(r"(Saudi\s*Riyal|ريال\s*سعودي|SAR|SR)", "", s, flags=re.IGNORECASE).strip()
    s = s.replace(",", "")
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _find_form_section(body: str) -> Optional[tuple[int, str]]:
    """Locate the actual Oracle Fusion form section — the standalone header
    followed by a name and Person Number, not the subject-line mention."""

    # Look for the standalone form header pattern:
    # "Personal Contribution\n\n\nName\n\n\nPerson Number XXXXXXX"
    # or Arabic equivalent
    en_pats = [
        # Standalone header: "Personal Contribution" as its own block, followed by name + Person Number
        r"Personal\s+Contribution\s*[\r\n]+\s*[\r\n]+\s*[\r\n]*([A-Za-z][A-Za-z\s.]+?)\s*[\r\n]+\s*[\r\n]*Person\s+Number\s+(\d{7,8})",
    ]
    ar_pats = [
        r"الإسهام\s+الشخصي\s*[\r\n]+\s*[\r\n]+\s*[\r\n]*(.+?)\s*[\r\n]+\s*[\r\n]*رقم\s+الشخص\s+(\d{7,8})",
        r"المساهمة\s+الشخصية\s*[\r\n]+\s*[\r\n]+\s*[\r\n]*(.+?)\s*[\r\n]+\s*[\r\n]*رقم\s+الشخص\s+(\d{7,8})",
    ]

    for pat in en_pats:
        m = re.search(pat, body, re.IGNORECASE)
        if m:
            return (m.start(), "en", m.group(1).strip(), m.group(2))

    for pat in ar_pats:
        m = re.search(pat, body)
        if m:
            return (m.start(), "ar", m.group(1).strip(), m.group(2))

    # Fallback: look for Person Number near a form-like section
    # Find Person Number occurrences
    for pm in re.finditer(r"Person\s+Number\s+(\d{7,8})", body, re.IGNORECASE):
        # Check if preceding context has form-like indicators
        pre = body[max(0, pm.start()-500):pm.start()]
        if re.search(r"Personal\s+Contribution", pre, re.IGNORECASE):
            # Extract name between header and Person Number
            hm = list(re.finditer(r"Personal\s+Contribution", pre, re.IGNORECASE))
            if hm:
                last_h = hm[-1]
                between = pre[last_h.end():]
                # Check it's the standalone version (not subject line)
                between_clean = between.strip()
                if not between_clean.startswith("Approval"):
                    name_lines = [l.strip() for l in between.split("\n") if l.strip() and not l.strip().startswith("http")]
                    emp_name = name_lines[0] if name_lines else None
                    return (pm.start() - len(pre) + last_h.start(), "en", emp_name, pm.group(1))

    # Arabic fallback
    for pm in re.finditer(r"رقم\s+الشخص\s+(\d{7,8})", body):
        pre = body[max(0, pm.start()-500):pm.start()]
        for ar_hdr in [r"الإسهام\s+الشخصي", r"المساهمة\s+الشخصية"]:
            hm = list(re.finditer(ar_hdr, pre))
            if hm:
                last_h = hm[-1]
                between = pre[last_h.end():]
                between_clean = between.strip()
                name_lines = [l.strip() for l in between.split("\n") if l.strip() and len(l.strip()) > 2 and not l.strip().startswith("http")]
                emp_name = name_lines[0] if name_lines else None
                return (pm.start() - len(pre) + last_h.start(), "ar", emp_name, pm.group(1))

    return None


def _extract_approvers(body: str) -> list[dict]:
    approvers = []
    for pat in [
        r"(Approved|Submitted)\s+by\s+(.+?)\s+(\d{1,2}-\w+-\d{4}\s+\d{1,2}:\d{2}\s*[APap][Mm])",
        r"(تم التخصيص إلى|تم التقديم بواسطة)\s+(.+?)\s+(\d{1,2}-\S+-\d{4}\s+\d{1,2}:\d{2}\s*[مص])",
    ]:
        for m in re.finditer(pat, body):
            action = m.group(1).strip()
            name = _normalize_ws(m.group(2))
            dt_str = _normalize_ws(m.group(3))
            action_map = {
                "تم التخصيص إلى": "Approved by",
                "تم التقديم بواسطة": "Submitted by",
            }
            action = action_map.get(action, action)
            approvers.append({"action": action, "name": name, "datetime_str": dt_str})
    return approvers


def parse_form(msg_body: str) -> Optional[dict]:
    """Parse Oracle Fusion form from email body. Returns dict or None."""
    if not msg_body or len(msg_body) < 200:
        return None

    form_loc = _find_form_section(msg_body)
    if form_loc is None:
        return None

    start_idx, lang, emp_name_form, emp_no = form_loc
    form_body = msg_body[start_idx:]

    # Determine form type
    form_type = "personal_contribution"
    if re.search(r"Business\s+Trip", form_body, re.IGNORECASE):
        form_type = "business_trip"

    # Value
    value_str = _extract_field(form_body, ["Value", "القيمة"],
        stop_labels=["Start Date", "تاريخ البداية"])
    value_sar = _parse_amount(value_str)

    # Effective date
    effective_str = _extract_field(form_body, ["Effective", "فعال"],
        stop_labels=["New Awards", "المِنح الجديدة", "المنح الجديدة", "اعتماد", "Approve"])
    effective_date = _parse_date_flexible(effective_str)

    # Trip dates
    trip_start = _extract_field(form_body, ["Trip Start Date"],
        stop_labels=["Trip End Date"])
    trip_end = _extract_field(form_body, ["Trip End Date"],
        stop_labels=["Ticket Start Date"])

    # Cities
    from_city = _extract_field(form_body, ["From City"],
        stop_labels=["To City"])
    to_city = _extract_field(form_body, ["To City"],
        stop_labels=["Reason"])

    # Trip Cost For
    trip_cost_for = _extract_field(form_body, ["Trip Cost For"],
        stop_labels=["Notes"])
    if trip_cost_for:
        trip_cost_for = re.sub(r"\s+", "", trip_cost_for)
        if not trip_cost_for.isdigit():
            trip_cost_for = None

    # Division
    form_division = _extract_field(form_body, ["Division"],
        stop_labels=["Agency"])
    if form_division:
        form_division = _to_western(re.sub(r"\s+", "", form_division))
        if not form_division.isdigit():
            form_division = None

    # Agency
    form_agency = _extract_field(form_body, ["Agency"],
        stop_labels=["Solution"])
    if form_agency:
        form_agency = _to_western(re.sub(r"\s+", "", form_agency))
        if not form_agency.isdigit():
            form_agency = None

    # Solution
    form_solution = _extract_field(form_body, ["Solution"],
        stop_labels=["Number of Days", "عدد الأيام"])
    if form_solution:
        form_solution = _to_western(re.sub(r"\s+", "", form_solution))
        if not form_solution.isdigit():
            form_solution = None

    # Number of Days
    num_days = _extract_field(form_body, ["Number of Days", "عدد الأيام"],
        stop_labels=["Fuel Amount", "مبلغ الوقود"])
    if num_days:
        num_days = _to_western(re.sub(r"\s+", "", num_days))

    # Perdiem Class
    perdiem_class = _extract_field(form_body, ["Perdeim Class", "Perdiem Class", "فئة البدل اليومي"],
        stop_labels=["View Attachments", "عرض المرفقات"])

    # Award Name and Subtype — extracted from "New Awards" section
    award_name = None
    award_subtype = None
    _awards_m = re.search(r"New Awards\s*\n+\s*\n*\s*(\S[^\n]+)", form_body, re.IGNORECASE)
    if _awards_m:
        award_name = _normalize_ws(_awards_m.group(1))
        # Subtype is the next non-empty line after award name
        _rest = form_body[_awards_m.end():]
        _sub_lines = [l.strip() for l in _rest.split("\n") if l.strip()]
        if _sub_lines:
            _candidate = _sub_lines[0]
            # Subtype should be a short label, not a field value
            if not re.match(r"(Value|\\d|Start Date|Frequency|Trip|Travel|Car Rent)", _candidate, re.IGNORECASE):
                award_subtype = _candidate

    # Accommodation Type
    accommodation_type = _extract_field(form_body, ["Accommodation Type"],
        stop_labels=["Host Name"])

    # Trip Goal
    trip_goal = _extract_field(form_body, ["Trip Goal"],
        stop_labels=["Travel Method"])

    # Travel Method
    travel_method = _extract_field(form_body, ["Travel Method"],
        stop_labels=["Car Rent From"])

    # Assignment Number
    assignment_no = _extract_field(form_body, ["Assignment Number", "رقم التكليف"],
        stop_labels=["Job", "الوظيفة"])

    # Job
    job_title = _extract_field(form_body, ["Job", "الوظيفة"],
        stop_labels=["Grade", "الدرجة"])

    # Grade
    grade = _extract_field(form_body, ["Grade", "الدرجة"],
        stop_labels=["Approvers", "المُعتمِدون", "المعتمدون"])

    # Approvers
    approvers = _extract_approvers(form_body)
    approver_name = None
    approver_date = None
    submitter_name = None
    for a in approvers:
        if "Approved" in a["action"]:
            approver_name = a["name"]
            approver_date = a["datetime_str"]
        elif "Submitted" in a["action"]:
            submitter_name = a["name"]

    # Parse trip dates
    trip_start_date = _parse_date_flexible(trip_start)
    trip_end_date = _parse_date_flexible(trip_end)

    # Confidence based on key fields extracted
    fields_found = sum(1 for v in [
        emp_no, emp_name_form, value_sar, trip_start_date,
        form_division, form_agency, form_solution, approver_name,
    ] if v is not None)
    confidence = min(1.0, fields_found / 8.0)

    return {
        "form_type": form_type,
        "form_language": lang,
        "emp_no": emp_no,
        "emp_name_form": emp_name_form,
        "award_name": award_name,
        "award_subtype": award_subtype,
        "accommodation_type": accommodation_type,
        "value_sar": value_sar,
        "effective_date": effective_date,
        "trip_start_date": trip_start_date,
        "trip_end_date": trip_end_date,
        "from_city": from_city,
        "to_city": to_city,
        "trip_cost_for": trip_cost_for,
        "form_division": form_division,
        "form_agency": form_agency,
        "form_solution": form_solution,
        "perdiem_class": perdiem_class,
        "trip_goal": trip_goal,
        "travel_method": travel_method,
        "num_days": num_days,
        "assignment_number": assignment_no,
        "job_title": job_title,
        "grade": grade,
        "approver_name": approver_name,
        "approver_date": approver_date,
        "submitter_name": submitter_name,
        "form_extraction_confidence": round(confidence, 2),
        "raw_match_span": [start_idx, start_idx + min(len(form_body), 3000)],
    }


if __name__ == "__main__":
    import json, sys
    if len(sys.argv) < 2:
        print("Usage: python3 oracle_form_parser.py <msg_body_text_file>")
        sys.exit(1)
    with open(sys.argv[1]) as f:
        body = f.read()
    result = parse_form(body)
    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
