#!/usr/bin/env python3
"""
Cost Center Resolver — loads master data, resolves employee segments,
builds the full 10-segment Distribution Combination string.

Per cost-center-rulebook-v1.md (2026-05-21).

Format: {Company:2}-{Location:5}-{Account:8}-{CostCenter:6}-{DIV:3}-{Solution:5}-{Agency:5}-{Project:5}-{Intercompany:2}-{Future1:6}
Example: 03-40100-60301003-160014-170-10017-10072-00000-00-000000
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import pandas as pd
from openpyxl import load_workbook
# v15.6: deterministic location resolver (Manpower location irrelevant)
try:
    from location_resolver import resolve_location_v15_7 as _resolve_location_v15_7
    _LOCATION_RESOLVER_AVAILABLE = True
except ImportError:
    def _resolve_location_v15_7(description):
        return '20100', 'fallback', 'LOCATION_DEFAULT_CENTRAL_20100'
    _LOCATION_RESOLVER_AVAILABLE = False

# ---------------------------------------------------------------------------
# Segment widths (exact, per rulebook Section 1)
# ---------------------------------------------------------------------------
SEGMENT_WIDTHS = [2, 5, 8, 6, 3, 5, 5, 5, 2, 6]
SEGMENT_NAMES = ["Company", "Location", "Account", "CostCenter", "DIV",
                  "Solution", "Agency", "Project", "Intercompany", "Future1"]
COMBO_TOTAL_LEN = sum(SEGMENT_WIDTHS) + 9  # 49 chars + 9 hyphens = 58? No, 49 is segment chars only
# Actually: 2+5+8+6+3+5+5+5+2+6 = 47 segment chars + 9 hyphens = 56

COMPANY = "03"
PROJECT = "00000"
INTERCOMPANY = "00"
FUTURE1 = "000000"
ANNUAL_TICKET_DIV = "888"
ANNUAL_TICKET_SOLUTION = "00000"
ANNUAL_TICKET_AGENCY = "88888"

# Solution code mapping for named solutions in Manpower
SOLUTION_CODE_MAP = {
    "CRM": "10017",
    "HF":  "10050",
    "EP":  "10064",
}

# ---------------------------------------------------------------------------
# Account classification — rebuilt around Labadi's verbatim rules (2026-05-22)
# ---------------------------------------------------------------------------
# Sponsorship detection: OPEX forms and event reference codes in description
SPONSORSHIP_PATTERNS = [
    r"OPEX[-\s]",
    r"CRM-\d{4}-\d+",
    r"HF-\d{4}-\d+",
    r"EP-\d{4}-\d+",
    r"SIS-\d+-\d{4}",
    r"ISHLT",
    r"Heart Failure",
    r"CardioMEMS",
    r"HeartMate",
    r"Prague Rhythm",
    r"DDW\s+\d{4}",
    r"IEPC",
    r"Barcelona Registrati",
]

# OPEX reference code → segment defaults for NON-EMPLOYEE sponsor rows
# When employee IS in master, Manpower segments are used instead.
OPEX_REF_SEGMENTS = {
    # pattern → (CC, DIV, Agency, Solution)
    "CRM":  ("160014", "170", "10072", "10017"),
    "HF":   ("160014", "170", "10072", "10050"),
    "EP":   ("160014", "170", "10072", "10064"),
    "SIS":  ("160011", "196", "10043", "00000"),
    "DMS":  ("160013", "192", "10202", "00000"),
    # Default sponsor (when no specific ref matched)
    "_DEFAULT": ("160014", "170", "10072", "00000"),
}

# DIVs that map to G&A travel account (60301004)
GA_DIVS = {888, 190}
# All other S&M / revenue DIVs → 60301003


@dataclass
class Employee:
    emp_no: int
    old_emp_no: Optional[int]
    name: str
    arabic_name: str
    location: int
    manager_no: Optional[int]
    line_manager: str
    div_code: int
    div_name: str
    agency_code: int
    agency_name: str
    cost_center: int
    cost_center_name: str
    sol_flag: str       # "Can Be used", "Need to allocate", etc.
    solution_name: str  # "CRM", "HF", "EP", or ""


@dataclass
class MasterData:
    employees: dict[int, Employee]         # emp_no -> Employee
    valid_accounts: set[str]               # from INDEX tab
    valid_divs: set[str]                   # from DIV tab
    valid_agencies: set[str]               # from Agency tab
    valid_solutions: set[str]              # from Solution tab
    valid_cost_centers: set[str]           # from Manpower plus optional segment master
    valid_locations: set[str]              # {10100, 20100, 30100, 40100}


@dataclass
class ResolvedLine:
    """Result of resolving one invoice line."""
    sl_no: int
    passenger_name: str
    emp_no: Optional[int]
    emp_match_method: str  # "emp_no_direct", "name_fuzzy", "msg_filename", "not_found"

    # 10 segments
    company: str
    location: str
    account: str
    cost_center: str
    div: str
    solution: str
    agency: str
    project: str
    intercompany: str
    future1: str

    combo: str  # The full 49-char hyphenated string
    gl_description: str = ""

    # v12: Manpower div name for Block 2 lookup fallback
    manpower_div_name: str = ""

    # Flags
    flags: list[str] = field(default_factory=list)
    action: str = "Post to GL"
    account_rule: str = ""
    routing_reason: str = ""
    sol_flag: str = ""


def load_master_data(
    master_data_xlsx: str | Path,
    reference_xlsx: str | Path,
) -> MasterData:
    """Load Manpower + reference tables."""
    master_data_xlsx = Path(master_data_xlsx)
    reference_xlsx = Path(reference_xlsx)

    # --- Manpower (header row 7 = index 6) ---
    mp = pd.read_excel(master_data_xlsx, sheet_name="Manpower", header=6)
    employees = {}
    for _, row in mp.iterrows():
        raw_emp = row.iloc[0]
        if pd.isna(raw_emp):
            continue
        try:
            emp_no = int(float(str(raw_emp)))
        except (ValueError, TypeError):
            continue

        old_raw = row.iloc[1]
        old_emp = None
        if pd.notna(old_raw):
            try:
                old_emp = int(float(str(old_raw)))
            except (ValueError, TypeError):
                pass

        def _safe_int(v, default=0):
            if pd.isna(v):
                return default
            try:
                return int(float(str(v)))
            except (ValueError, TypeError):
                return default

        def _safe_str(v, default=""):
            if pd.isna(v):
                return default
            return str(v).strip()

        loc = _safe_int(row.iloc[4], 0)
        mgr = None
        if pd.notna(row.iloc[5]):
            try:
                mgr = int(float(str(row.iloc[5])))
            except (ValueError, TypeError):
                pass

        sol_flag = _safe_str(row.iloc[14])
        sol_name = _safe_str(row.iloc[15])

        employees[emp_no] = Employee(
            emp_no=emp_no,
            old_emp_no=old_emp,
            name=_safe_str(row.iloc[2]),
            arabic_name=_safe_str(row.iloc[3]),
            location=loc,
            manager_no=mgr,
            line_manager=_safe_str(row.iloc[6]),
            div_code=_safe_int(row.iloc[8], 0),
            div_name=_safe_str(row.iloc[9]),
            agency_code=_safe_int(row.iloc[10], 0),
            agency_name=_safe_str(row.iloc[11]),
            cost_center=_safe_int(row.iloc[12], 0),
            cost_center_name=_safe_str(row.iloc[13]),
            sol_flag=sol_flag,
            solution_name=sol_name,
        )

    # --- Reference tables from Aljeel_Lookups-v2 ---
    # Account tab
    idx_df = pd.read_excel(reference_xlsx, sheet_name="Account", header=0)
    valid_accounts = set()
    for _, row in idx_df.iterrows():
        acc = row.iloc[0]
        if pd.notna(acc):
            s = str(acc).strip()
            if s.isdigit() and len(s) == 8:
                valid_accounts.add(s)

    # DIV tab — col 0 (DIV) is the code in Aljeel_Lookups-v2
    div_df = pd.read_excel(reference_xlsx, sheet_name="DIV", header=0)
    valid_divs = set()
    for _, row in div_df.iterrows():
        v = row.iloc[0]
        if pd.notna(v):
            s = str(v).strip()
            if s.isdigit():
                valid_divs.add(s.zfill(3))

    # Agency tab — col 0 (AG) is the code in Aljeel_Lookups-v2
    ag_df = pd.read_excel(reference_xlsx, sheet_name="Agency", header=0)
    valid_agencies = set()
    for _, row in ag_df.iterrows():
        v = row.iloc[0]
        if pd.notna(v):
            s = str(v).strip()
            if s.isdigit():
                valid_agencies.add(s.zfill(5))

    # Solution tab — col 0 (Solution) is the code
    sol_df = pd.read_excel(reference_xlsx, sheet_name="Solution", header=0)
    valid_solutions = set()
    for _, row in sol_df.iterrows():
        v = row.iloc[0]
        if pd.notna(v):
            s = str(v).strip()
            if s.isdigit() or s == "00000":
                valid_solutions.add(s.zfill(5))

    valid_cost_centers = set()
    try:
        # Optional legacy segment master. AlJeel Lookups-v2 carries production
        # employee CCs in Manpower "New cost center" instead.
        cc_sheet = "Cost Center" if "Cost Center" in pd.ExcelFile(reference_xlsx).sheet_names else "Cost Center Segment"
        cc_df = pd.read_excel(reference_xlsx, sheet_name=cc_sheet, header=0)
        for _, row in cc_df.iterrows():
            v = row.iloc[0]
            if pd.notna(v):
                s = str(v).strip()
                if s.isdigit():
                    valid_cost_centers.add(s.zfill(6))
    except Exception:
        pass

    # Include all CCs from Manpower "New cost center" (column 12), which is
    # the intended production source for AlJeel employee cost centers.
    for emp in employees.values():
        if emp.cost_center:
            valid_cost_centers.add(str(emp.cost_center).zfill(6))

    valid_locations = {"10100", "20100", "30100", "40100"}  # v15.6: 20100 = Central Region (valid)

    return MasterData(
        employees=employees,
        valid_accounts=valid_accounts,
        valid_divs=valid_divs,
        valid_agencies=valid_agencies,
        valid_solutions=valid_solutions,
        valid_cost_centers=valid_cost_centers,
        valid_locations=valid_locations,
    )


def _fuzzy_name_match(name: str, employees: dict[int, Employee], threshold=0.85) -> Optional[int]:
    """Fuzzy match passenger name to Manpower. Returns emp_no or None."""
    if not name:
        return None
    # Normalize: LASTNAME/FIRSTNAME MR → tokens
    name_up = name.upper()
    # Remove titles
    for title in ["MR", "MS", "MRS", "DR", "ENG", "(CHD)", "(INF)"]:
        name_up = name_up.replace(title, "")
    # Split on / and space
    pax_tokens = [t.strip() for t in re.split(r"[/\s,]+", name_up) if len(t.strip()) >= 3]
    if len(pax_tokens) < 2:
        return None

    best_emp = None
    best_score = 0.0
    for emp_no, emp in employees.items():
        emp_tokens = [t.strip() for t in emp.name.upper().split() if len(t.strip()) >= 3]
        if not emp_tokens:
            continue
        # Token-set overlap
        matches = 0
        for pt in pax_tokens:
            for et in emp_tokens:
                if pt in et or et in pt:
                    matches += 1
                    break
        score = matches / max(len(pax_tokens), len(emp_tokens))
        if score > best_score:
            best_score = score
            best_emp = emp_no

    if best_emp and best_score >= threshold:
        return best_emp
    return None


def _is_sponsorship(description: str) -> tuple[bool, str]:
    """Check if a description contains sponsorship / OPEX event references."""
    for pat in SPONSORSHIP_PATTERNS:
        if re.search(pat, description or "", re.IGNORECASE):
            return True, pat
    return False, ""


def _extract_opex_ref_key(description: str) -> str:
    """Extract the OPEX reference key (CRM, HF, EP, SIS, DMS) from description."""
    desc = description or ""
    # Order matters: check specific patterns first
    if re.search(r"CRM-\d{4}-\d+", desc, re.IGNORECASE):
        return "CRM"
    if re.search(r"HF-\d{4}-\d+|OPEX\s+HF|Heart Failure|CardioMEMS|HeartMate|ISHLT", desc, re.IGNORECASE):
        return "HF"
    if re.search(r"EP-\d{4}-\d+|Prague Rhythm", desc, re.IGNORECASE):
        return "EP"
    if re.search(r"SIS-\d+-\d{4}|DDW\s+\d{4}", desc, re.IGNORECASE):
        return "SIS"
    if re.search(r"DMS-\d{4}|OPEX-\d+-DMS", desc, re.IGNORECASE):
        return "DMS"
    return "_DEFAULT"


def derive_sponsor_segments(description: str) -> dict:
    """For non-employee sponsor rows, derive CC/DIV/Agency/Solution from OPEX ref.

    Returns dict with keys: cost_center, div, agency, solution, location, opex_key.
    """
    key = _extract_opex_ref_key(description)
    cc, div, agency, sol = OPEX_REF_SEGMENTS.get(key, OPEX_REF_SEGMENTS["_DEFAULT"])
    return {
        "cost_center": cc,
        "div": div,
        "agency": agency,
        "solution": sol,
        "location": "10100",  # v15.6: overridden by resolve_location_v15_6 in resolve_line()
        "opex_key": key,
    }


def classify_account(description: str, emp: Optional[Employee], md: MasterData,
                     approver_name: str = "") -> tuple[str, str]:
    """Classify expense type → Account code per Labadi matrix (2026-05-22).

    Priority order:
      L1  Sponsorship (OPEX / event refs)
      L2  Recruitment (keywords OR HR approver Elham/Hessa)
      L3  Annual leave award
      L4  Training / course / certification
      L5  Personal travel
      L6  GE warranty/project
      L7  DIV=888 or 190 → G&A travel (60301004)
      L8  All other DIVs → S&M travel (60301003)
      L9  External (not in Manpower) → sponsor default

    Returns (account_code, rule_description).
    """
    desc_lower = (description or "").lower()

    # L1: Sponsorship — OPEX form / event reference codes
    is_sponsor, sponsor_pat = _is_sponsorship(description)
    if is_sponsor:
        return ("60307021", f"L1_sponsor: {sponsor_pat}")

    # L2: Recruitment
    for kw in ("new employee", "new hire", "candidate", "interview"):
        if kw in desc_lower:
            return ("60308007", f"L2_recruitment: {kw}")
    if approver_name:
        approver_low = approver_name.lower()
        for hr in ("elham", "hessa"):
            if hr in approver_low:
                return ("60308007", f"L2_recruitment: approver={approver_name}")

    # L3: Annual leave / annual ticket
    for kw in ("annual ticket", "annual leave", "vacation entitlement"):
        if kw in desc_lower:
            return ("21070229", f"L3_annual: {kw}")

    # L4: Training
    for kw in ("training", "course", "certification"):
        if kw in desc_lower:
            return ("60308009", f"L4_training: {kw}")

    # L5: Personal travel
    # v15.11 (Amr May 25): drop GL 11034013 entirely. Route personal to 21070229
    # (Accrued Employee Annual Tickets) with General segments (handled at the
    # combo level in process_batch.py via _v15_11_apply_personal_account_override).
    if "personal" in desc_lower:
        return ("21070229", f"L5_personal_v15.11")

    # L9: External (not in Manpower)
    # Only classify as sponsor if OPEX/event refs are present in description.
    # Otherwise, use default S&M travel account (regular travel, not sponsor).
    if emp is None:
        is_sponsor, sp_pat = _is_sponsorship(description)
        if is_sponsor:
            return ("60307021", f"L9_external_sponsor: {sp_pat}")
        return ("60301003", "L9_external_travel: not in Manpower, no OPEX ref")

    # L6: GE agency + warranty/project
    if emp.agency_code == 10081:
        for kw in ("warranty", "project"):
            if kw in desc_lower:
                return ("21070227", f"L6_ge_warranty: {kw}")

    # L7: G&A travel — DIV=888 (G&A) or DIV=190 (S&M overhead)
    if emp.div_code in GA_DIVS:
        return ("60301004", f"L7_ga_travel: DIV={emp.div_code}")

    # L8: S&M travel — all remaining divisions
    return ("60301003", f"L8_sm_travel: DIV={emp.div_code}")


def resolve_solution_code(emp: Employee) -> tuple[str, list[str]]:
    """Get the 5-digit solution code for an employee.

    Returns (solution_code, flags).
    """
    flags = []
    if not emp.solution_name:
        return ("00000", flags)

    sol_name = emp.solution_name.upper().strip()
    if sol_name in SOLUTION_CODE_MAP:
        code = SOLUTION_CODE_MAP[sol_name]
        return (code, flags)

    # Unknown solution name
    flags.append("SOLUTION_CODE_PENDING")
    return ("00000", flags)


def build_combo(
    company: str,
    location: str,
    account: str,
    cost_center: str,
    div: str,
    solution: str,
    agency: str,
    project: str = PROJECT,
    intercompany: str = INTERCOMPANY,
    future1: str = FUTURE1,
) -> str:
    """Build the 10-segment Distribution Combination string."""
    segments = [company, location, account, cost_center, div, solution,
                agency, project, intercompany, future1]
    padded = []
    for seg, width in zip(segments, SEGMENT_WIDTHS):
        s = str(seg).strip()
        if not s or s.lower() == "nan":
            s = "0"
        padded.append(s.zfill(width))
    return "-".join(padded)


def build_gl_description(combo, lookup, include_tail=True) -> str:
    """Build the human-readable GL Description from a final combo string."""
    expansion = lookup.expand_combo(combo)

    def _clean(v):
        s = (v or "").strip() if isinstance(v, str) else (v or "")
        return s if s and s != "#N/A" else "—"

    parts = [
        _clean(expansion.get("GL")),
        _clean(expansion.get("Cost Name")),
        _clean(expansion.get("Contribution")),
        _clean(expansion.get("Solution Name")),
        _clean(expansion.get("Agency Name")),
    ]
    if include_tail:
        parts.extend(["00000", "00", "000000"])
    return " · ".join(parts)


def sync_row_derived_fields(r, lookup):
    """Synchronize derived fields from the row's authoritative segment fields."""
    def _get(name, default=""):
        if isinstance(r, dict):
            return r.get(name, default)
        return getattr(r, name, default)

    def _set(name, value):
        if isinstance(r, dict):
            r[name] = value
        else:
            setattr(r, name, value)

    combo = build_combo(
        _get("company", COMPANY),
        _get("location", ""),
        _get("account", ""),
        _get("cost_center", ""),
        _get("div", ""),
        _get("solution", ""),
        _get("agency", ""),
        _get("project", PROJECT),
        _get("intercompany", INTERCOMPANY),
        _get("future1", FUTURE1),
    )
    _set("combo", combo)
    _set("gl_description", build_gl_description(combo, lookup))


def resolve_line(
    sl_no: int,
    description: str,
    emp_no_raw: Optional[int],
    passenger_name: str,
    amount: float,
    md: MasterData,
    msg_filenames: list[str] | None = None,
) -> ResolvedLine:
    """Resolve one invoice line to full 10-segment combo."""
    flags = []
    emp = None
    match_method = "not_found"

    # Step 1: Identify the employee
    # 1a: Direct emp_no match
    if emp_no_raw and emp_no_raw in md.employees:
        emp = md.employees[emp_no_raw]
        match_method = "emp_no_direct"
    else:
        # 1b: Fuzzy name match
        matched_emp_no = _fuzzy_name_match(passenger_name, md.employees, threshold=0.60)
        if matched_emp_no:
            emp = md.employees[matched_emp_no]
            match_method = "name_fuzzy"
        else:
            # 1c: msg filename emp_no override
            if msg_filenames:
                emp_re = re.compile(r"\((\d{7,8})\)")
                for fname in msg_filenames:
                    m = emp_re.search(fname)
                    if m:
                        cand = int(m.group(1))
                        if cand in md.employees:
                            emp = md.employees[cand]
                            match_method = "msg_filename"
                            break

    # Step 2: Check employee flag
    sol_flag = ""
    if emp:
        sol_flag = emp.sol_flag
        if sol_flag == "Need to allocate":
            flags.append("ALLOCATION_TARGET_MISSING")  # Soft gate S1
        elif sol_flag == "Charge to Medsource":
            flags.append("MEDSOURCE_ROUTE")  # Soft gate S2
        elif "erbe" in sol_flag.lower():
            flags.append("ERBE_EXCEPTION")  # Soft gate S3

    # If employee not found
    if emp is None:
        flags.append("EMPLOYEE_NOT_IN_MASTER")
        # Classify account first (may detect sponsorship from description)
        account, account_rule = classify_account(description, None, md)
        if account == "60307021":
            # Sponsorship: derive segments from OPEX reference code
            sponsor_segs = derive_sponsor_segments(description)
            # Default location for unknown sponsors
            location = "20100"
            cost_center = sponsor_segs["cost_center"]
            div = sponsor_segs["div"]
            agency = sponsor_segs["agency"]
            solution = sponsor_segs["solution"]
        else:
            # Non-sponsor, not in master — use v15.6 deterministic location from itinerary
            _loc_code, _, _loc_flag = _resolve_location_v15_7(description)
            location = _loc_code
            _loc_flag_nm = _loc_flag
            cost_center = "999999"
            div = "000"
            solution = "00000"
            agency = "00000"
    else:
        # Step 3: Classify account
        account, account_rule = classify_account(description, emp, md)
        account_flag = None

        # (L7/L8 in classify_account now handle DIV-based routing)

        # Step 4: Pull segments from Manpower
        
        # Determine actual GL Location code:
        # In Aljeel_Lookups-v2, '10100' is the branch code for Head Office, which maps to GL Location '20100' (Central)
        # '40100' (Western) and '30100' (Eastern) map directly.
        raw_loc = str(int(emp.location)).strip() if emp.location else ""
        if raw_loc:
            location = raw_loc
        else:
            # Fallback to itinerary if Manpower is missing or invalid
            _loc_code, _, _loc_flag = _resolve_location_v15_7(description)
            location = _loc_code
            if _loc_flag:
                flags.append(_loc_flag)
                
        cost_center = str(emp.cost_center).zfill(6)
        div = str(emp.div_code).zfill(3)
        agency = str(emp.agency_code).zfill(5)
        manpower_div_name_val = emp.div_name  # v12: store for Block 2 lookup

        # Solution
        solution, sol_flags = resolve_solution_code(emp)
        flags.extend(sol_flags)

        # Check DIV not in master (192/194/196)
        if div not in md.valid_divs and div in {"192", "194", "196"}:
            flags.append("MANPOWER_DIV_NOT_IN_MASTER")

    # Step 5: Fixed tail
    project = PROJECT
    intercompany = INTERCOMPANY
    future1 = FUTURE1
    company = COMPANY

    if account == "21070229":
        div = ANNUAL_TICKET_DIV
        solution = ANNUAL_TICKET_SOLUTION
        agency = ANNUAL_TICKET_AGENCY

    # Build combo
    combo = build_combo(company, location, account, cost_center, div,
                        solution, agency, project, intercompany, future1)

    # Determine action
    if "EMPLOYEE_NOT_IN_MASTER" in flags:
        action = "HOLD - employee not in Master Data"
    elif "ALLOCATION_TARGET_MISSING" in flags:
        action = "HOLD - Need to allocate (subordinate lookup required)"
    elif "MEDSOURCE_ROUTE" in flags:
        action = "HOLD - Charge to Medsource"
    elif flags:
        action = "HOLD - " + "; ".join(flags)
    else:
        action = "Post to GL"

    return ResolvedLine(
        sl_no=sl_no,
        passenger_name=passenger_name,
        emp_no=emp.emp_no if emp else None,
        emp_match_method=match_method,
        company=company,
        location=location,
        account=account,
        cost_center=cost_center,
        div=div,
        solution=solution,
        agency=agency,
        project=project,
        intercompany=intercompany,
        future1=future1,
        combo=combo,
        manpower_div_name=manpower_div_name_val if emp else "",
        flags=flags,
        action=action,
        account_rule=account_rule,
        routing_reason=match_method,
        sol_flag=sol_flag,
    )
