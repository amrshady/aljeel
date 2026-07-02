#!/usr/bin/env python3
"""
AlJeel AP Pipeline v26 — Sponsoring-row CC correction + v4_preserved review

One new fix over v25:

  FIX D — Sponsoring-row emp_no review (new LLM routing condition)
    Root cause: cascade rows with account=60307021 and a non-empty emp_no were never
    routed to the LLM because the existing routing conditions only trigger for:
      - NOT_RESOLVED (empty CC)
      - SPONSORSHIP_NO_AGENCY
      - EMPLOYEE_NOT_IN_MASTER
      - OPEX_PDF_TRAVEL_ACCOUNT (non-sponsoring only)
    This left three classes of errors undetected:
      1. v4_preserved rows where the v4 CC is wrong (e.g. ALBASIRI: used requestor's
         home CC 160013/DMS/Ansell instead of event CC 160014/Contribution/EP/Abbott)
      2. v4_preserved rows where the v4 account is wrong (hotel rows 26-731/732/733/734:
         should be 21070229 Personal Contribution, not 60307021 Sponsoring)
      3. L1_sponsor_override rows for AlJeel employees doing conference registrations
         (AMMAR CHAUDHARY 26-743: should be 60308009 Training, not 60307021 Sponsoring)

    New routing condition SPONSORING_EMPNO_REVIEW:
      If account=60307021 AND emp_no is non-empty in the cascade input → route to LLM.
      The LLM reads evidence and assigns correct account + CC, or confirms 60307021 with
      proper event-CC. emp_no is then handled by existing blanking rules.

Root causes fixed (J26-788 — Mohammed Labadi flags, 2026-06-03):
  ALBASIRI/SALEH MR         6905428831 — v4_preserved wrong CC → Fix D (IEPC/EP/Abbott)
  MOSTAFA AMER hotel        26-731/732 — v4_preserved 60307021, PC evidence → Fix D (21070229)
  SULTAN ABU DOGHMEH hotel  26-733/734 — v4_preserved 60307021, PC evidence → Fix D (21070229)
  AMMAR CHAUDHARY reg       26-743     — L1_sponsor HF override on employee → Fix D (60308009)

Inherits all v25 fixes (A, B, C).

Usage:
    python3 scripts/run_v26.py J26-788 --input-suffix v15.11.2  # primary fix target
    python3 scripts/run_v26.py J26-640                          # golden regression check
    python3 scripts/run_v26.py J26-593                          # blind regression check
    python3 scripts/run_v26.py J26-589
    python3 scripts/run_v26.py J26-550
    python3 scripts/run_v26.py J26-788 --limit 15 --skip-fraud  # smoke test rows 1-15
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import shutil
import sys
import time
import traceback
from collections import Counter
from pathlib import Path
from typing import Any

import openpyxl

ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
sys.path.insert(0, str(ROOT / "scripts"))

import full_evidence_agent as fea
import run_hybrid_v15_12 as v15

# Import everything from v16 (core logic)
from run_v16 import (
    _clean_passenger,
    build_personal_contribution_index,
    build_reverse_folder_index,
    find_folder_with_index,
    _needs_classification,
    _folder_has_opex,
    _folder_has_pc_email,
    _get_email_tail,
    _get_opex_text,
    classify_row,
    _norm_master_code,
    resolve_from_master,
    resolve_sponsorship_from_master,
    full_resolve_row,
    _build_classify_hint,
    enforce_sponsorship_rules,
    apply_overlays_v16,
    _resolve_text_code,
    process_row,
    apply_family_cluster_unification,
    _PC_SIGNAL,
    _PC_EMP_RE,
)
# Import v17.1 booking-group detection
from run_v17 import (
    build_booking_groups,
    _is_family_group,
    _pick_anchor,
    apply_booking_group_propagation,
    collect_patches,
    write_xlsx_patches,
    read_xlsx_rows,
    ALL_GL_BREAKDOWN_COLS,
    COMBO_SEGMENT_COLS,
    COMBO_LOOKUP_COLS,
    parse_combo_segments,
)
# Import fraud detection
from cross_batch_fraud import (
    run_cross_batch_fraud,
    update_cross_batch_history,
    load_history as load_cross_batch_history,
    save_history as save_cross_batch_history,
)
# Import find_folder_with_index to call as fallback from v25 override
from run_v16 import find_folder_with_index as _find_folder_v16

# Import v24 helpers (booking-groups inline, fraud wiring, utc_ts, etc.)
from run_v24 import (
    apply_booking_groups_inline,
    run_fraud_detection,
    _build_fraud_lines,
    _extract_ticket_no,
    _parse_route_corridor,
    utc_ts,
)

VERSION      = "v26"
COST_CEILING = 4.0

_TICKET_10_RE_V25 = re.compile(r"^(\d{10})")

# ─── FIX A-part-2: ticket-first lookup (prevents bad surname match) ──────────

def find_folder_v25(
    ticket_no: str,
    passenger: str,
    notes: str,
    all_folders: list[Path],
    reverse_index: dict[str, Path],
) -> Path | None:
    """
    v25 override of find_folder_with_index.

    KEY CHANGE: check the reverse_index for the exact ticket number BEFORE
    calling find_ticket_folder's surname-based matching.  The reverse index
    now contains adjacent-ticket entries for family/PC folders, so ticket
    6904732430 resolves to '6904732429 family' — not to an unrelated folder
    found by surname ('HUSSEIN' -> 6904687314, 'SALEM' -> train ticket 2).

    Exact/substring/range folder discovery runs first (deterministic, zero false
    positives).  Then reverse_index ticket match.  Surname fallback is last.
    """
    # Step 1: exact / substring / range — identical to fea.find_ticket_folder steps 1-2
    for f in all_folders:
        if f.name.strip() == ticket_no:
            return f
    for f in all_folders:
        fname = f.name.strip()
        m = re.match(r"^(\d{10,})", fname)
        if m and m.group(1).startswith(ticket_no):
            return f
        m2 = re.match(r"^(\d{10})-(\d{1,3})", fname)
        if m2:
            base, end = m2.group(1), m2.group(2)
            if ticket_no == base:
                return f
            if len(end) < 10:
                candidate = base[:10 - len(end)] + end
                if ticket_no == candidate:
                    return f
        if ticket_no in fname:
            return f

    # Step 2: reverse_index exact ticket match (includes adjacent-ticket entries)
    if ticket_no in reverse_index:
        return reverse_index[ticket_no]

    # Step 3: 26-NNN in notes
    for m in re.finditer(r"\b(26-\d{3})\b", notes or ""):
        if m.group(1) in reverse_index:
            return reverse_index[m.group(1)]

    # Step 4: surname fallback — delegate to original (handles PDF name words, etc.)
    return _find_folder_v16(ticket_no, passenger, notes, all_folders, reverse_index)


# ─── FIX A: adjacent-ticket reverse index expansion ──────────────────────────

def build_reverse_folder_index_v25(
    all_folders: list[Path],
    adj_radius: int = 5,
) -> dict[str, Path]:
    """
    Build the standard reverse folder index, then expand it with adjacent-ticket
    entries for:
      (a) Folders named  "<10-digit> family[...]"  (explicit family booking folder)
      (b) Folders that contain a Personal Contribution approval .msg file

    Adjacent tickets ±1..adj_radius are added with setdefault so that dedicated
    single-ticket folders (exact name match, already indexed first) take priority.
    """
    # Build the standard index
    index = build_reverse_folder_index(all_folders)

    # Expand for family/PC folders
    expanded = 0
    for folder in all_folders:
        if not folder.exists():
            continue
        fname = folder.name.strip()
        m_base = _TICKET_10_RE_V25.match(fname)
        if not m_base:
            continue   # folder not named by a ticket number

        base_ticket = int(m_base.group(1))
        # v25 conservative: only expand for folders EXPLICITLY named "family"
        # (e.g. "6904732429 family").  PC-email alone is NOT sufficient — individual
        # employee tickets also have PC emails, and adjacent-ticket expansion based
        # on them causes false-positive folder corrections for unrelated rows.
        is_family_folder = "family" in fname.lower()

        if not is_family_folder:
            continue

        for delta in range(-adj_radius, adj_radius + 1):
            if delta == 0:
                continue
            adj_ticket = str(base_ticket + delta)
            if adj_ticket not in index:           # don't override dedicated folders
                index[adj_ticket] = folder
                expanded += 1

    if expanded:
        print(
            f"[v25-fix-a] {expanded} adjacent-ticket entries added "
            f"(family/PC folder expansion ±{adj_radius})",
            flush=True,
        )
    return index


# ─── FIX B: inject PC-email emp_no hint into classify context ─────────────────

def _build_pc_hint(pc_rec: dict | None) -> str:
    """
    Build a LLM routing context block from a PC index record.
    pc_rec = {"emp_no": "1002466", "name": "Mahmoud Elkilany Hussein", "filename": "..."}
    """
    if not pc_rec:
        return ""
    emp_no = pc_rec.get("emp_no", "").strip()
    name   = pc_rec.get("name", "").strip()
    fname  = pc_rec.get("filename", "").strip()
    if not emp_no:
        return ""
    lines = [
        "\n[ROUTING CONTEXT v25 — PERSONAL CONTRIBUTION EMAIL DETECTED]",
        f"The evidence folder contains a Personal Contribution approval .msg file.",
        f"• Responsible employee (from filename): {name} ({emp_no})",
        f"• Set account=21070229 (Personal Contribution).",
        f"• Use employee {emp_no}'s GL allocation (CC, DIV, Agency) from master data.",
        f"• If the passenger IS {name}, set emp_no={emp_no}.",
        f"• If the passenger is a FAMILY MEMBER / DEPENDENT of {name}, set emp_no=\"\" (blank).",
        f"  (Children CHD/INF and spouses traveling on a family PC booking are not employees.)",
        f"• Filename for reference: {fname}",
    ]
    return "\n".join(lines) + "\n"


def process_row_v25(
    row_idx: int,
    cascade_row: dict,
    route_reason: str,
    batch_id: str,
    raw_root: Path,
    all_folders: list[Path],
    manpower: dict,
    lookups: dict,
    reverse_index: dict[str, Path] | None = None,
    pc_index: dict[str, dict] | None = None,
    no_cache: bool = True,
) -> dict:
    """
    v25 process_row with folder-correction (Fix A+B).

    classify_row is called first (it may find the wrong folder for family bookings
    via surname matching).  We then check if find_folder_v25 returns a BETTER folder
    (one that is in the reverse_index via adjacent-ticket expansion).  If the better
    folder has a PC email, we override classify's cached _folder / _evidence before
    calling full_resolve_row, and we reuse route_reason="CHD_PC_EVIDENCE" so that
    the prompt hint fires for family members just as it does for CHD/INF passengers.
    """
    import time as _t
    from run_v16 import (
        classify_row, full_resolve_row,
        resolve_from_master, resolve_sponsorship_from_master,
        apply_overlays_v16, enforce_sponsorship_rules,
        _clean_passenger, _norm_master_code,
    )

    desc  = str(cascade_row.get("Description", "") or "")
    notes = str(cascade_row.get("Notes", "") or "")
    text  = desc + " " + notes
    m     = re.search(r"\b(\d{10,})\b", text)
    ticket = m.group(1) if m else ""
    if not ticket:
        m2 = re.search(r"\b(26-\d{3})\b", text)
        ticket = m2.group(1) if m2 else ""
    passenger = desc.split(" - ", 1)[0].strip() if " - " in desc else ""

    trace: dict = {
        "row_idx":      row_idx,
        "description":  desc[:80],
        "route_reason": route_reason,
        "call1": None, "call2": None, "shortcut": None, "final": None,
    }

    # ── CALL 1: classify ─────────────────────────────────────────────────
    t1 = _t.time()
    classify = classify_row(row_idx, cascade_row, batch_id, raw_root, all_folders,
                            reverse_index=reverse_index, no_cache=no_cache)

    # ── FIX A+B: correct folder if classify found wrong one ──────────────
    # find_folder_v25 prioritises reverse_index (adjacent-ticket entries) over
    # surname matching.  If it finds a DIFFERENT folder with a PC email,
    # override classify's evidence so Call 2 sees the right documents.
    correct_folder = find_folder_v25(ticket, passenger, notes, all_folders, reverse_index or {})
    classify_folder_str = classify.get("_folder", "")
    folder_corrected = False

    if correct_folder and str(correct_folder) != classify_folder_str:
        # v25 conservative: only correct if the better folder is an explicit family
        # folder (folder name contains 'family') AND has a PC email.  Pure PC-email
        # folders without 'family' in the name are individual employee tickets and
        # should not override a classify result that already found a valid folder.
        is_family_folder = "family" in correct_folder.name.lower()
        if is_family_folder and _folder_has_pc_email(correct_folder):
            correct_evidence = fea.collect_evidence(correct_folder)
            classify["_folder"]   = str(correct_folder)
            classify["_evidence"] = correct_evidence
            folder_corrected = True
            # Escalate route_reason so Call 2 gets the CHD_PC_EVIDENCE hint
            if route_reason not in ("CHD_PC_EVIDENCE", "FAMILY_PC_EVIDENCE"):
                route_reason = "FAMILY_PC_EVIDENCE"
            print(
                f"[v25-fix-ab] row {row_idx} ({passenger}): folder corrected "
                f"{Path(classify_folder_str).name if classify_folder_str else '(none)'} "
                f"→ {correct_folder.name}",
                flush=True,
            )

    trace["call1"] = {
        "model":                classify.get("_llm_model", ""),
        "from_cache":           classify.get("_from_cache", False),
        "elapsed_sec":          round(_t.time() - t1, 2),
        "row_type":             classify.get("row_type", ""),
        "employee_no_in_doc":   classify.get("employee_no_in_doc", ""),
        "requesting_emp_no":    classify.get("requesting_emp_no", ""),
        "opex_code":            classify.get("opex_code", ""),
        "classification_basis": str(classify.get("classification_basis", "") or "")[:200],
        "evidence_folder":      classify.get("_folder", ""),
        "evidence_files":       list((classify.get("_evidence") or {}).get("files", [])),
        "evidence_chars":       int((classify.get("_evidence") or {}).get("total_chars", 0)),
        "in_tokens":            classify.get("_llm_in_tokens", 0),
        "out_tokens":           classify.get("_llm_out_tokens", 0),
        "error":                classify.get("_llm_error", ""),
        "folder_corrected":     folder_corrected,
    }

    row_type       = classify.get("row_type", "unclear")
    emp_no_hint    = classify.get("employee_no_in_doc", "").strip()
    requesting_no  = classify.get("requesting_emp_no", "").strip()

    # v19 Fix 2b: downgrade "employee" with no evidence files + surname not in master
    if row_type == "employee" and not emp_no_hint:
        ev_files = list((classify.get("_evidence") or {}).get("files", []))
        if not ev_files:
            desc_for_chk = desc.upper()
            pax_part = desc_for_chk.split(" - ", 1)[0].strip().upper()
            surname = pax_part.split("/")[0].strip() if "/" in pax_part else ""
            surname_in_master = surname and any(
                surname in str(v.get("name", "") or "").upper()
                for v in manpower.values()
            )
            if not surname_in_master:
                row_type = "unclear"
                classify["row_type"] = "unclear"
                classify["classification_basis"] = (
                    str(classify.get("classification_basis", "") or "") +
                    " [v19: overridden unclear — no evidence files + surname not in master]"
                )
                trace["call1"]["row_type"] = "unclear"

    # ── Master shortcut: employee found in doc AND in master? Skip Call 2 ──
    if row_type == "employee" and emp_no_hint and emp_no_hint in manpower:
        rec = resolve_from_master(emp_no_hint, manpower)
        if rec:
            final = enforce_sponsorship_rules(rec, classify, cascade_row)
            final["_agent_method"]  = "v16_master_shortcut"
            final["_classify"]      = row_type
            final["_classify_emp"]  = emp_no_hint
            final["_route_reason"]  = route_reason
            final["_llm_in_tokens"] = classify.get("_llm_in_tokens", 0)
            final["_llm_out_tokens"]= classify.get("_llm_out_tokens", 0)
            final["_from_cache"]    = classify.get("_from_cache", False)
            trace["shortcut"] = {"type": "master_shortcut_employee", "emp_no": emp_no_hint}
            trace["final"] = {k: v for k, v in final.items() if not k.startswith("_")}
            final["_step_trace"] = trace
            return final

    # ── Master shortcut: sponsorship with requesting emp in master? ──────
    if row_type == "sponsorship" and requesting_no and requesting_no in manpower:
        rec = resolve_sponsorship_from_master(requesting_no, manpower, lookups)
        if rec:
            final = enforce_sponsorship_rules(rec, classify, cascade_row)
            final["_agent_method"]  = "v16_sponsorship_master"
            final["_classify"]      = row_type
            final["_classify_req"]  = requesting_no
            final["_route_reason"]  = route_reason
            final["_llm_in_tokens"] = classify.get("_llm_in_tokens", 0)
            final["_llm_out_tokens"]= classify.get("_llm_out_tokens", 0)
            final["_from_cache"]    = classify.get("_from_cache", False)
            trace["shortcut"] = {"type": "master_shortcut_sponsorship", "requesting_emp_no": requesting_no}
            trace["final"] = {k: v for k, v in final.items() if not k.startswith("_")}
            final["_step_trace"] = trace
            return final

    # ── CALL 2: full evidence resolve ─────────────────────────────────────
    # For FAMILY_PC_EVIDENCE, reuse the CHD_PC_EVIDENCE route_reason so the
    # existing prompt-hint in full_resolve_row fires correctly.
    effective_reason = "CHD_PC_EVIDENCE" if route_reason == "FAMILY_PC_EVIDENCE" else route_reason

    t2 = _t.time()
    llm = full_resolve_row(
        row_idx, cascade_row, classify, batch_id, raw_root, all_folders,
        manpower, lookups, reverse_index=reverse_index,
        no_cache=no_cache, route_reason=effective_reason,
    )
    trace["call2"] = {
        "model":       llm.get("_llm_model", ""),
        "from_cache":  llm.get("_from_cache", False),
        "elapsed_sec": round(_t.time() - t2, 2),
        "emp_no":      llm.get("emp_no", ""),
        "account":     llm.get("account", ""),
        "cost_center": llm.get("cost_center", ""),
        "agency":      llm.get("agency", ""),
        "confidence":  llm.get("confidence", ""),
        "reasoning":   str(llm.get("reasoning", "") or "")[:400],
        "in_tokens":   llm.get("_llm_in_tokens", 0),
        "out_tokens":  llm.get("_llm_out_tokens", 0),
        "error":       llm.get("_llm_error", ""),
    }

    if llm.get("_llm_error"):
        trace["final"] = {"error": llm.get("_llm_error", "")}
        result = {
            "_agent_method":  "cascade_fallback",
            "_route_reason":  route_reason,
            "_llm_error":     llm.get("_llm_error", ""),
            "_classify":      row_type,
            "_llm_in_tokens": classify.get("_llm_in_tokens", 0) + llm.get("_llm_in_tokens", 0),
            "_llm_out_tokens":classify.get("_llm_out_tokens", 0) + llm.get("_llm_out_tokens", 0),
            "_step_trace":    trace,
        }
        return result

    final, method = apply_overlays_v16(llm, cascade_row, classify)
    final = enforce_sponsorship_rules(final, classify, cascade_row)

    # v20 Fix B: PC / family-of-employee reasoning override
    llm_reasoning = str(llm.get("reasoning", "") or "").lower()
    PC_SIGNALS = (
        "personal contribution", "family of employee", "family member of employee",
        "family members of employee", "dependent of employee", "dependents of employee",
        "employee's family", "employee's dependent", "is a family", "are family of",
    )
    is_pc_signal   = any(sig in llm_reasoning for sig in PC_SIGNALS)
    is_26nnn_route = (route_reason == "26NNN_LIKELY_SPONSORSHIP")

    if is_26nnn_route and is_pc_signal:
        desc_for_nm = str(cascade_row.get("Description", "") or "").upper()
        nm_match = re.search(r"for ([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*\(\d",
                             str(llm.get("reasoning", "") or ""))
        if nm_match:
            pc_name_upper = nm_match.group(1).upper()
            # Require BOTH first AND last name of the passenger to appear in the
            # PC email name. A single common name is never a sufficient match.
            pax_part = desc_for_nm.split(" - ", 1)[0].strip() if " - " in desc_for_nm else desc_for_nm
            TITLE_SKIP = {"MRS","MR","MS","CHD","INF","INFANT"}
            pax_tokens = [t for t in re.findall(r"[A-Z]{3,}", pax_part) if t not in TITLE_SKIP]
            pc_tokens   = set(re.findall(r"[A-Z]{3,}", pc_name_upper))
            if len(pax_tokens) >= 2:
                name_match_found = (pax_tokens[0] in pc_tokens) and (pax_tokens[-1] in pc_tokens)
            elif len(pax_tokens) == 1:
                name_match_found = pax_tokens[0] in pc_tokens
            else:
                name_match_found = False
            is_26nnn_route = not name_match_found

    if is_pc_signal and not is_26nnn_route and final.get("account") != "21070229":
        final["account"] = "21070229"
        pc_emp = final.get("emp_no") or llm.get("emp_no") or ""
        if pc_emp and pc_emp in manpower:
            rec = resolve_from_master(pc_emp, manpower)
            if rec:
                for k in ("cost_center", "div", "solution", "agency"):
                    if rec.get(k):
                        final[k] = rec[k]
        method = "llm_agent_pc_override"

    final["_agent_method"]  = f"v16_{method}"

    # v21 Fix 2: 26-NNN sponsorship override
    if (route_reason == "26NNN_LIKELY_SPONSORSHIP"
            and final.get("account") in ("60301003", "60301004")
            and final.get("account") != "21070229"):
        final["account"] = "60307021"
        final["_agent_method"] = "v16_26nnn_forced_sponsorship"

    final["_classify"]      = row_type
    final["_route_reason"]  = route_reason
    final["_llm_in_tokens"] = classify.get("_llm_in_tokens", 0) + llm.get("_llm_in_tokens", 0)
    final["_llm_out_tokens"]= classify.get("_llm_out_tokens", 0) + llm.get("_llm_out_tokens", 0)
    final["_from_cache"]    = classify.get("_from_cache", False) and llm.get("_from_cache", False)
    trace["final"] = {k: v for k, v in final.items() if not k.startswith("_")}
    final["_step_trace"]    = trace
    return final


# ─── FIX C: PC-family dependent emp_no blanking ──────────────────────────────

def apply_pc_family_emp_no_rule(
    hybrid_rows: list[dict],
    cascade_rows: list[dict],
    manpower: dict,
    pc_index: dict[str, dict],
    all_folders: list[Path],
    reverse_index: dict[str, Path],
) -> int:
    """
    For rows where account=21070229 (personal contribution), blank emp_no when
    the passenger is a family dependent rather than the responsible employee.

    Detection rule:
      1. Look up the responsible employee from the PC index for that ticket's folder.
      2. Extract the passenger's first name from "LASTNAME/FIRSTNAME" format.
      3. If the passenger's first name does NOT appear in the responsible employee's
         full name → the passenger is a family member → emp_no = "".

    This safely preserves emp_no for the actual employee's own PC ticket while
    clearing it for CHD/INF and spouse passengers.

    Returns count of rows where emp_no was blanked.
    """
    blanked = 0
    for i, hr in enumerate(hybrid_rows):
        account = str(hr.get("account", "") or "").strip()
        if account != "21070229":
            continue
        emp_no = str(hr.get("emp_no", "") or "").strip()
        if not emp_no:
            continue  # already blank — nothing to do

        # Find the evidence folder for this row
        cr    = cascade_rows[i]
        desc  = str(cr.get("Description", "") or "")
        notes = str(cr.get("Notes", "") or "")
        text  = desc + " " + notes
        m     = re.search(r"\b(\d{10,})\b", text)
        ticket = m.group(1) if m else ""
        if not ticket:
            m2 = re.search(r"\b(26-\d{3})\b", text)
            ticket = m2.group(1) if m2 else ""

        passenger = desc.split(" - ", 1)[0].strip() if " - " in desc else ""
        # Use find_folder_v25 (adj-ticket aware) instead of fea.find_ticket_folder
        folder    = find_folder_v25(ticket, passenger, notes, all_folders, reverse_index)

        # Get PC record
        pc_rec = pc_index.get(str(folder)) if folder else None

        if pc_rec:
            # Use the employee name from the PC email filename
            pc_emp_name = (pc_rec.get("name", "") or "").upper()
        else:
            # Fall back: use the employee's name from master data
            rec = manpower.get(emp_no, {})
            pc_emp_name = (rec.get("emp_name", "") or "").upper()

        if not pc_emp_name:
            continue   # can't determine — leave as-is

        # Extract passenger's first name: "HUSSEIN/TALIA MS(CHD)" → "TALIA"
        pax_first = ""
        m_slash = re.search(r"[/\\]([A-Z]+)", passenger.upper())
        if m_slash:
            pax_first = m_slash.group(1).strip()
        if not pax_first:
            continue   # can't parse — leave as-is

        # If passenger first name is NOT a token in the responsible employee's name
        # → this is a family dependent → blank emp_no
        emp_name_tokens = set(pc_emp_name.split())
        if pax_first not in emp_name_tokens:
            hybrid_rows[i]["emp_no"] = ""
            blanked += 1
            print(
                f"[v25-fix-c] row {i} ({passenger}): emp_no blanked "
                f"('{pax_first}' not in PC employee '{pc_emp_name}')",
                flush=True,
            )

    return blanked


# ─── booking-group inline (same as v24) ──────────────────────────────────────

def apply_booking_groups_inline_v25(out_xlsx: Path) -> tuple[int, int]:
    """
    Thin wrapper around v24's apply_booking_groups_inline with VERSION=v25.
    (We can't call v24's function directly because it uses v24's VERSION constant.)
    """
    import copy
    print(f"\n[booking-groups] scanning for family groups...", flush=True)
    headers, rows, hdr_row = read_xlsx_rows(out_xlsx)

    combo_hdr = next((h for h in headers if h and "distribution combination" in str(h).lower()), None)
    acct_hdr  = next((h for h in headers if h and str(h).strip().lower() == "account"), None)
    cc_hdr    = next((h for h in headers if h and "cost center" in str(h).lower()), None)
    div_hdr   = next((h for h in headers if h and str(h).strip().lower() == "div"), None)
    sol_hdr   = next((h for h in headers if h and str(h).strip().lower() == "solution"), None)
    ag_hdr    = next((h for h in headers if h and str(h).strip().lower() == "agency"), None)
    loc_hdr   = next((h for h in headers if h and str(h).strip().lower() == "location"), None)
    co_hdr    = next((h for h in headers if h and str(h).strip().lower() == "company"), None)

    def _pad(v, w):
        s = str(v or "").strip()
        return s.zfill(w) if s.isdigit() else (s or "0"*w)

    combos_fixed = 0
    if combo_hdr and acct_hdr:
        for row in rows:
            existing_combo = str(row.get(combo_hdr, "") or "")
            acct = str(row.get(acct_hdr, "") or "").strip()
            if not acct or not existing_combo:
                continue
            parts = existing_combo.split("-")
            combo_acct = (parts[2].strip() if len(parts) > 2 else "").lstrip("0") or "0"
            clean_acct = acct.lstrip("0") or "0"
            if combo_acct != clean_acct:
                co  = str(row.get(co_hdr, "03") or "03").strip() or "03"
                loc = str(row.get(loc_hdr, "") or "").strip() or (parts[1] if len(parts) > 1 else "20100")
                cc  = str(row.get(cc_hdr, "") or "").strip() or (parts[3] if len(parts) > 3 else "000000")
                div = str(row.get(div_hdr, "") or "").strip() or (parts[4] if len(parts) > 4 else "000")
                sol = str(row.get(sol_hdr, "") or "").strip() or (parts[5] if len(parts) > 5 else "00000")
                ag  = str(row.get(ag_hdr, "") or "").strip() or (parts[6] if len(parts) > 6 else "00000")
                proj = parts[7] if len(parts) > 7 else "00000"
                ic   = parts[8] if len(parts) > 8 else "00"
                f1   = parts[9] if len(parts) > 9 else "000000"
                row[combo_hdr] = (
                    f"{_pad(co,2)}-{_pad(loc,5)}-{_pad(acct,8)}-{_pad(cc,6)}-{_pad(div,3)}"
                    f"-{_pad(sol,5)}-{_pad(ag,5)}-{_pad(proj,5)}-{_pad(ic,2)}-{_pad(f1,6)}"
                )
                # Flag as high-confidence PC anchor when account=21070229
                if acct.lstrip("0") == "21070229".lstrip("0") or acct == "21070229":
                    row["_pc_resynced"] = True
                combos_fixed += 1
    if combos_fixed:
        print(f"[booking-groups] {combos_fixed} combo(s) synced from Account column (PC override fix)", flush=True)

    orig_rows = copy.deepcopy(rows)
    groups = build_booking_groups(rows)
    family_groups = [g for g in groups if _is_family_group(g, rows)]
    skipped       = len(groups) - len(family_groups)
    print(f"[booking-groups] {len(groups)} groups detected  ({len(family_groups)} family, {skipped} colleague-skip)", flush=True)

    propagated, conflicts, conflict_descs = apply_booking_group_propagation(rows, verbose=True)
    patches = collect_patches(rows, orig_rows)
    if patches:
        tmp = out_xlsx.with_name(out_xlsx.stem + ".__patch__.xlsx")
        write_xlsx_patches(out_xlsx, tmp, patches)
        tmp.replace(out_xlsx)
        print(f"[booking-groups] {len(patches)} rows patched in {out_xlsx.name}", flush=True)
    else:
        print(f"[booking-groups] no changes needed", flush=True)

    if conflicts:
        print(f"[booking-groups] ⚠️  {conflicts} FAMILY_CONFLICT groups — review catches JSON", flush=True)

    catches_out = out_xlsx.parent / f"catches-booking-groups-{VERSION}.json"
    catches_out.write_text(json.dumps({
        "batch_id":    out_xlsx.parent.parent.name,
        "version":     VERSION,
        "propagated":  propagated,
        "conflicts":   conflicts,
        "conflict_details": conflict_descs,
        "groups_found": len(groups),
        "family_groups": len(family_groups),
    }, indent=2))

    return propagated, conflicts


# ─── main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=f"AlJeel AP Pipeline {VERSION}")
    ap.add_argument("batch_id")
    ap.add_argument("--invoice-id", default=None)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--cost-ceiling", type=float, default=COST_CEILING)
    ap.add_argument("--input-suffix", default="v15.11",
                    help="Cascade input version (default: v15.11)")
    ap.add_argument("--skip-fraud", action="store_true")
    ap.add_argument("--use-cache", action="store_true")
    args = ap.parse_args()

    batch_id   = args.batch_id
    batch_dir  = ROOT / "batches" / f"jawal-{batch_id}"
    raw_root   = batch_dir / "raw"
    invoice_id = args.invoice_id or batch_id

    if not batch_dir.exists():
        print(f"[fatal] batch dir not found: {batch_dir}", file=sys.stderr)
        sys.exit(2)

    # ── find cascade input ─────────────────────────────────────────────────
    out_dir = batch_dir / "output"
    out_dir.mkdir(parents=True, exist_ok=True)

    exact_cascade = out_dir / f"Spreadsheet-{invoice_id}-FILLED-{args.input_suffix}.xlsx"
    if exact_cascade.exists():
        cascade_xlsx = exact_cascade
    else:
        pattern    = f"Spreadsheet-{invoice_id}-FILLED-{args.input_suffix}*.xlsx"
        candidates = sorted(out_dir.glob(pattern),
                            key=lambda p: p.stat().st_mtime, reverse=True)
        candidates = [c for c in candidates if not re.search(r"v1[78]", c.name)]
        if not candidates:
            print(f"[fatal] cascade input not found: {out_dir}/{pattern}", file=sys.stderr)
            sys.exit(3)
        cascade_xlsx = candidates[0]
    print(f"[load] cascade: {cascade_xlsx.name}", flush=True)

    # ── output path ────────────────────────────────────────────────────────
    out_xlsx = out_dir / f"Spreadsheet-{invoice_id}-FILLED-{VERSION}.xlsx"
    if out_xlsx.exists():
        bak = out_xlsx.with_suffix(out_xlsx.suffix + f".bak-pre-{VERSION}-{utc_ts()}")
        shutil.copy2(out_xlsx, bak)
        print(f"[backup] {bak.name}", flush=True)

    # ── load inputs ────────────────────────────────────────────────────────
    cascade_rows, headers, hdr_row = v15.read_cascade_xlsx(cascade_xlsx)
    print(f"[load] {len(cascade_rows)} cascade rows", flush=True)
    if args.limit > 0:
        cascade_rows = cascade_rows[:args.limit]

    print("[load] master data...", flush=True)
    manpower    = fea.load_manpower()
    lookups     = fea.load_lookups()
    all_folders = fea.collect_all_folders(raw_root)
    print(f"[scan] {len(all_folders)} evidence folders in {raw_root}", flush=True)

    # ── FIX A: build expanded reverse index with adjacent-ticket entries ───
    print("[scan] building reverse folder + PC index (v25 — adj-ticket expansion)...", flush=True)
    reverse_index = build_reverse_folder_index_v25(all_folders)
    pc_index      = build_personal_contribution_index(all_folders)
    print(f"[scan] reverse={len(reverse_index)} mappings  pc={len(pc_index)} PC folders", flush=True)

    # ── stage 1: routing ───────────────────────────────────────────────────
    # ── v26 Fix D: routing override for sponsoring rows with non-empty emp_no ─
    def _needs_classification_v26(
        row: dict, all_folders_: list[Path], rev_idx: dict | None
    ) -> tuple[bool, str]:
        """v26 adds SPONSORING_EMPNO_REVIEW before falling back to v16 logic.

        Catches rows where account=60307021 already set (via v4_preserved or
        L1_sponsor_override) but emp_no is non-empty in cascade output.
        This indicates the CC/account may be wrong (requestor CC used instead
        of event CC, or employee misclassified as sponsored external party).
        """
        account = str(row.get("Account", "") or "").strip()
        emp_no  = str(row.get("Employee No", "") or "").strip()
        if account == "60307021" and emp_no and emp_no not in ("", "0", "-", "None"):
            return True, "SPONSORING_EMPNO_REVIEW"
        return _needs_classification(row, all_folders_, rev_idx)

    routed: list[tuple[int, str]] = []
    for i, row in enumerate(cascade_rows):
        should, reason = _needs_classification_v26(row, all_folders, reverse_index)
        if should:
            routed.append((i, reason))

    reason_counts: dict[str, int] = Counter(r for _, r in routed)
    print(f"[route] {len(routed)} rows → LLM  /  {len(cascade_rows) - len(routed)} stay cascade",
          flush=True)

    # ── stage 2: init hybrid_rows from cascade ────────────────────────────
    hybrid_rows: list[dict] = []
    for c in cascade_rows:
        hybrid_rows.append({
            "_row_idx":      c["_row_idx"],
            "_agent_method": "cascade",
            "emp_no":        c.get("Employee No", "") or "",
            "account":       c.get("Account", "") or "",
            "cost_center":   c.get("Cost Center", "") or "",
            "div":           c.get("DIV", "") or "",
            "solution":      c.get("Solution", "") or "",
            "agency":        c.get("Agency", "") or "",
            "location":      c.get("Location", "") or "",
        })

    # Blank emp_no on cascade sponsorship rows
    blanked_cascade = 0
    for i, c in enumerate(cascade_rows):
        if str(c.get("Account", "") or "").strip() == "60307021":
            if str(hybrid_rows[i]["emp_no"]).strip() not in ("", "0", "-"):
                hybrid_rows[i]["emp_no"] = ""
                blanked_cascade += 1
    if blanked_cascade:
        print(f"[blank] {blanked_cascade} cascade sponsorship rows → emp_no cleared", flush=True)

    # ── stage 3: LLM two-call resolution (v25 wrapper — Fix B) ───────────
    no_cache = not args.use_cache
    if no_cache:
        print("[llm] cache DISABLED — all LLM calls will be fresh", flush=True)
    else:
        print("[llm] cache ENABLED (--use-cache)", flush=True)

    total_in = total_out = llm_errors = 0
    pricing_pro = fea.GEMINI_PRICING["gemini-2.5-pro"]
    step_traces: list[dict] = []

    def worker(idx_reason):
        idx, reason = idx_reason
        try:
            return idx, reason, process_row_v25(
                idx, cascade_rows[idx], reason,
                batch_id, raw_root, all_folders, manpower, lookups,
                reverse_index=reverse_index,
                pc_index=pc_index,
                no_cache=no_cache,
            )
        except Exception as e:
            return idx, reason, {
                "_agent_method": "cascade_fallback",
                "_llm_error":    f"{type(e).__name__}: {e}",
                "_tb":           traceback.format_exc()[-500:],
            }

    t_start = time.time()
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(worker, ir) for ir in routed]
        try:
            for fut in concurrent.futures.as_completed(futs):
                idx, reason, res = fut.result()
                done += 1
                tok_in  = res.get("_llm_in_tokens", 0) or 0
                tok_out = res.get("_llm_out_tokens", 0) or 0
                total_in  += tok_in
                total_out += tok_out
                cost_est = (total_in * pricing_pro["in"]) + (total_out * pricing_pro["out"])
                elapsed  = time.time() - t_start
                print(
                    f"[{done:3d}/{len(routed)}] row {idx:3d} "
                    f"({reason} → {res.get('_classify','?')})  "
                    f"method={res.get('_agent_method','?')}"
                    f"  t={elapsed:5.1f}s  cost~=${cost_est:.3f}"
                    f"{' [C]' if res.get('_from_cache') else ''}"
                    f"{' ERR=' + res.get('_llm_error','')[:60] if res.get('_llm_error') else ''}",
                    flush=True,
                )
                if res.get("_llm_error"):
                    llm_errors += 1
                method = res.get("_agent_method", "cascade_fallback")
                hybrid_rows[idx]["_agent_method"] = method
                if "cascade_fallback" not in method:
                    for key in ("emp_no", "account", "cost_center", "div", "solution", "agency"):
                        v = res.get(key)
                        if v is not None:
                            hybrid_rows[idx][key] = v
                hybrid_rows[idx]["_route_reason"] = reason
                hybrid_rows[idx]["_classify"]      = res.get("_classify", "?")

                if res.get("_step_trace"):
                    step_traces.append(res["_step_trace"])

                if cost_est > args.cost_ceiling:
                    print(f"[fatal] cost ceiling ${args.cost_ceiling:.2f} hit — saving partial.",
                          file=sys.stderr)
                    for f in futs:
                        f.cancel()
                    break
        except KeyboardInterrupt:
            print("\n[interrupt] saving partial...", flush=True)

    # ── stage 3b: family cluster unification ──────────────────────────────
    unified = apply_family_cluster_unification(hybrid_rows, cascade_rows)
    print(f"[cluster] {unified} rows emp_no-unified within family clusters", flush=True)

    # ── stage 3c: personal contribution overlay (v25 — uses find_folder_v25) ──
    # Two v25 changes vs v24:
    #   1. Use find_folder_v25 for folder lookup (correct adjacent-ticket routing)
    #   2. Skip rows where the LLM already resolved to account=21070229 with a
    #      valid CC — avoids overwriting a correct LLM result with a wrong PC folder.
    pc_applied = 0
    for i, c in enumerate(cascade_rows):
        desc  = str(c.get("Description", "") or "")
        notes = str(c.get("Notes", "") or "")
        text  = desc + " " + notes
        tm    = re.search(r"\b(\d{10,})\b", text)
        ticket = tm.group(1) if tm else ""
        if not ticket:
            tm2 = re.search(r"\b(26-\d{3})\b", text)
            ticket = tm2.group(1) if tm2 else ""
        passenger = desc.split(" - ", 1)[0].strip() if " - " in desc else ""

        # v25: skip rows already correctly resolved by LLM to PC with valid CC
        # Also skip rows resolved to sponsorship (60307021) — PC overlay must not
        # overwrite a correctly-resolved sponsorship account even when the evidence
        # folder contains a contaminating PC email.
        hybrid_acct = str(hybrid_rows[i].get("account", "") or "").strip()
        hybrid_cc   = str(hybrid_rows[i].get("cost_center", "") or "").strip()
        if hybrid_acct == "21070229" and hybrid_cc not in ("", "000000", "999999"):
            continue   # LLM already nailed it — don't overwrite
        if hybrid_acct == "60307021":
            continue   # already resolved to sponsorship — PC overlay must not overwrite

        # v25: use find_folder_v25 (not fea.find_ticket_folder) to avoid surname mismatch
        folder = find_folder_v25(ticket, passenger, notes, all_folders, reverse_index)
        if not folder:
            continue
        pc_rec = pc_index.get(str(folder))
        if not pc_rec:
            continue
        cascade_account = str(c.get("Account", "") or "").strip()
        if cascade_account in ("21070229", "60307021"):
            continue
        res_layer = str(c.get("Resolution Layer", "") or "").strip().lower()
        if "not_resolved" not in res_layer and "not resolved" not in res_layer:
            continue
        flags     = str(c.get("Agent Flags", "") or "")
        cascade_cc = str(c.get("Cost Center", "") or "").strip()
        if "EMPLOYEE_NOT_IN_MASTER" not in flags and cascade_cc not in ("", "000000", "999999"):
            continue
        emp_no = pc_rec.get("emp_no", "")
        rec    = manpower.get(emp_no, {})
        hybrid_rows[i]["account"]  = "21070229"
        hybrid_rows[i]["emp_no"]   = emp_no
        if rec:
            hybrid_rows[i]["cost_center"] = _norm_master_code(rec.get("cost_center", ""), "cc")
            hybrid_rows[i]["div"]         = _norm_master_code(rec.get("div_code", ""), "div")
            hybrid_rows[i]["solution"]    = _norm_master_code(rec.get("solution", ""), "solution")
            hybrid_rows[i]["agency"]      = _norm_master_code(rec.get("agency_code", ""), "agency")
        hybrid_rows[i]["_agent_method"] = "v25_personal_contribution"
        pc_applied += 1
    if pc_applied:
        print(f"[pc] {pc_applied} rows → account=21070229 (personal contribution)", flush=True)

    # ── stage 3d: FIX C — PC-family dependent emp_no blanking ─────────────
    pc_family_blanked = apply_pc_family_emp_no_rule(
        hybrid_rows, cascade_rows, manpower, pc_index, all_folders, reverse_index,
    )
    print(f"[v25-fix-c] {pc_family_blanked} PC-family dependent rows → emp_no blanked", flush=True)

    # ── stage 3e: v26 — NTS hotel rows with PC email (folder-by-empno lookup) ─────
    # Problem: hotel rows like "26-731 / MOSTAFA AMER - Kimpton Vividora Barcelona - 1 NTS"
    # use "26-NNN" ticket keys. The evidence folder is named "hotel amer + sultan" (not a
    # ticket-number folder) so find_folder_v25 misses it. Stage 3c PC overlay also misses
    # it. Fix: build a secondary index emp_no→folder from pc_index, then match by passenger
    # name via manpower. If a PC email exists for the passenger → apply 21070229 + master CC.
    pc_by_empno: dict[str, Path] = {}
    for _fp, _prec in pc_index.items():
        _eno = _prec.get("emp_no", "").strip()
        if _eno:
            pc_by_empno[_eno] = Path(_fp)

    nts_pc_count = 0
    for i, c in enumerate(cascade_rows):
        acct = str(hybrid_rows[i].get("account") or "").strip()
        if acct not in ("60301003", "60301004", "60307021"):
            continue
        desc = str(c.get("Description", "") or "")
        # Target: 26-NNN rows with NTS (hotel nights) in description
        if not re.search(r"26-[0-9]{3}", desc) or "NTS" not in desc.upper():
            continue
        passenger = desc.split(" - ", 1)[0].strip() if " - " in desc else ""
        if not passenger:
            continue

        # Resolve passenger to emp_no via manpower name lookup.
        # Passenger may be "LASTNAME/FIRSTNAME" (IATA) or "FIRSTNAME LASTNAME" (non-IATA).
        tokens = [t for t in re.split(r"[/\s]+", passenger.upper()) if len(t) >= 4]
        matched_eno = None
        # Pass 1: two-token match (preferred)
        for eno, mrec in manpower.items():
            name_en = (mrec.get("name") or "").upper()
            if sum(1 for tok in tokens if re.search(r"\b" + re.escape(tok) + r"\b", name_en)) >= 2:
                matched_eno = eno
                break
        # Pass 2: single long-token match (fallback)
        if not matched_eno:
            for eno, mrec in manpower.items():
                name_en = (mrec.get("name") or "").upper()
                if any(re.search(r"\b" + re.escape(tok) + r"\b", name_en) for tok in tokens if len(tok) >= 5):
                    matched_eno = eno
                    break

        if not matched_eno:
            continue

        # Find PC folder — check pc_by_empno first, then scan all PC folder files.
        pc_folder_nts: "Path | None" = pc_by_empno.get(matched_eno)
        if not pc_folder_nts:
            last_token = tokens[-1] if tokens else ""
            for _fp, _prec in pc_index.items():
                try:
                    _fdir = Path(_fp)
                    for _msg_f in _fdir.glob("*.msg"):
                        if "personal contribution" in _msg_f.name.lower() and last_token in _msg_f.name.upper():
                            pc_folder_nts = _fdir
                            break
                    if pc_folder_nts:
                        break
                except Exception:
                    pass

        if not pc_folder_nts or not pc_folder_nts.exists():
            continue
        has_pc = any(
            "personal contribution" in f.name.lower()
            for f in pc_folder_nts.iterdir()
            if f.suffix.lower() == ".msg"
        )
        if not has_pc:
            continue
        # Apply PC account + master CC
        mrec_nts = manpower.get(matched_eno, {})
        hybrid_rows[i]["account"]  = "21070229"
        hybrid_rows[i]["emp_no"]   = matched_eno
        if mrec_nts:
            hybrid_rows[i]["cost_center"] = _norm_master_code(mrec_nts.get("cost_center", ""), "cc")
            hybrid_rows[i]["div"]         = _norm_master_code(mrec_nts.get("div_code", ""), "div")
            hybrid_rows[i]["solution"]    = _norm_master_code(mrec_nts.get("solution", ""), "solution")
            hybrid_rows[i]["agency"]      = _norm_master_code(mrec_nts.get("agency_code", ""), "agency")
        hybrid_rows[i]["_agent_method"] = "v26_nts_pc_overlay"
        hybrid_rows[i]["_route_reason"] = "NTS_PC_FOLDER"
        nts_pc_count += 1
        print(f"  [v26-nts-pc] row {i+1}: {passenger} -> 21070229 via {pc_folder_nts.name}", flush=True)
    print(f"[v26-nts-pc] {nts_pc_count} hotel/NTS rows -> account=21070229", flush=True)

    # ── stage 3f: v26 — employee conference registration rows (26-NNN) ────────────
    # Problem: rows like "AMMAR CHAUDHARY - Heart Failure 2026, Barcelona Registrati (26-743)"
    # trigger L1_sponsor_override (HF keyword) setting account=60307021. But the passenger
    # IS an AlJeel employee (in manpower). Conference registrations by employees = 60308009
    # (Training Expenses), not 60307021 (Sponsoring).
    # Rule: 26-NNN row with "Registration" in description, account=60307021, passenger in
    # manpower → account=60308009, emp_no=employee, CC from master.
    emp_reg_count = 0
    for i, c in enumerate(cascade_rows):
        if str(hybrid_rows[i].get("account") or "").strip() != "60307021":
            continue
        desc = str(c.get("Description", "") or "")
        if not re.search(r"26-\d{3}", desc) or "REGISTRAT" not in desc.upper():
            continue
        passenger = desc.split(" - ", 1)[0].strip() if " - " in desc else ""
        if not passenger:
            continue
        # Resolve passenger → emp_no via manpower (non-IATA format: "FIRSTNAME LASTNAME")
        # Note: passenger name on Jawal ticket may not match Oracle master exactly.
        # Strategy: require 2 token matches (preferred) or 1 long-token match (fallback).
        name_parts = [t for t in passenger.upper().split() if len(t) >= 4]
        if not name_parts:
            continue
        matched_eno = None
        # Pass 1: two-token match
        for eno, mrec in manpower.items():
            name_en = (mrec.get("name") or "").upper()
            if sum(1 for p in name_parts if re.search(r"\b" + re.escape(p) + r"\b", name_en)) >= 2:
                matched_eno = eno
                break
        # Pass 2: single token match (≥5 chars)
        if not matched_eno:
            for eno, mrec in manpower.items():
                name_en = (mrec.get("name") or "").upper()
                if any(re.search(r"\b" + re.escape(p) + r"\b", name_en) for p in name_parts if len(p) >= 5):
                    matched_eno = eno
                    break
        if not matched_eno:
            continue
        # Apply Training account + master CC
        mrec = manpower.get(matched_eno, {})
        hybrid_rows[i]["account"]  = "60308009"
        hybrid_rows[i]["emp_no"]   = matched_eno
        if mrec:
            hybrid_rows[i]["cost_center"] = _norm_master_code(mrec.get("cost_center", ""), "cc")
            hybrid_rows[i]["div"]         = _norm_master_code(mrec.get("div_code", ""), "div")
            hybrid_rows[i]["solution"]    = _norm_master_code(mrec.get("solution", ""), "solution")
            hybrid_rows[i]["agency"]      = _norm_master_code(mrec.get("agency_code", ""), "agency")
        hybrid_rows[i]["_agent_method"] = "v26_emp_registration"
        hybrid_rows[i]["_route_reason"] = "EMP_REGISTRATION_TRAINING"
        emp_reg_count += 1
        print(f"  [v26-emp-reg] row {i+1}: {passenger} → 60308009 (Training) via master", flush=True)
    print(f"[v26-emp-reg] {emp_reg_count} employee registration rows → account=60308009", flush=True)

        # ── stage 3d: OPEX event-folder sponsorship overlay (v26) ──────────────
    # POST-PROCESSING — no LLM call. Deterministic overlay.
    # For tickets with account 60301003/60301004, no individual folder, whose
    # passenger surname appears in a conference/event folder .msg that also
    # contains an OPEX-*.pdf AND sponsorship language near the name.
    # => account=60307021, emp_no=blank, all other segments unchanged.
    opex_event_overlay_count = 0
    try:
        import extract_msg as _emsg_v26
        from datetime import datetime as _dt26
        SPONSOR_SIGNALS = (
            "NON-MEMBER", "NON MEMBER", "HCP", "SPONSORSHIP", "SPONSORED",
            "EXTERNAL", "PHYSICIAN", "DOCTOR", "SPECIALIST", "PROFESSOR",
            "NOMINATION", "ATTENDEE", "\u0637\u0628\u064a\u0628", "\u0645\u062e\u062a\u0635",
        )
        for idx, h in enumerate(hybrid_rows):
            acct = str(h.get("account", h.get("Account", "")) or "").strip()
            if acct not in ("60301003", "60301004"):
                continue
            desc  = str(cascade_rows[idx].get("Description", "") or "")
            notes = str(cascade_rows[idx].get("Notes", "") or "")
            tm    = re.search(r"\b(\d{10,})\b", desc + " " + notes)
            ticket_no = tm.group(1) if tm else ""
            if not ticket_no:
                continue
            passenger = desc.split(" - ", 1)[0].strip() if " - " in desc else ""
            surname = passenger.split("/")[0].strip().upper() if "/" in passenger else passenger.strip().upper()
            if len(surname) < 3:
                continue
            # Skip if passenger is in AlJeel Manpower — sponsored parties are external, never employees
            if any(surname in ((e.get("name_en","") or e.get("name","") or "")).upper()
                   for e in manpower.values()):
                continue
            inv_date = cascade_rows[idx].get("*Invoice Date", "")
            try:
                _d = _dt26.strptime(str(inv_date)[:10], "%Y-%m-%d")
                date_dir = raw_root / f"{_d.day:02d}{_d.strftime('%b').lower()}"
            except Exception:
                continue
            if not date_dir.exists():
                continue
            if any(ticket_no in sub.name for sub in date_dir.iterdir() if sub.is_dir()):
                continue  # has own folder
            found_folder = None
            for sub in sorted(date_dir.iterdir()):
                if not sub.is_dir() or re.match(r"^\d{10}", sub.name):
                    continue
                opex_pdfs = list(sub.glob("OPEX-*.pdf")) + list(sub.glob("OPEX-*.PDF"))
                if not opex_pdfs:
                    continue
                for msg_path in sub.glob("*.msg"):
                    try:
                        msg_obj = _emsg_v26.Message(str(msg_path))
                        body = (msg_obj.body or "").upper()
                        subj = (msg_obj.subject or "").upper()
                        if surname not in body and surname not in subj:
                            continue
                        if any(sig in body or sig in subj for sig in SPONSOR_SIGNALS):
                            found_folder = sub
                            break
                    except Exception:
                        continue
                if found_folder:
                    break
            if found_folder:
                # Look up requesting employee from OPEX folder name for agency/cc
                opex_emp_no = None
                opex_emp_rec = None
                for opex_f in (found_folder.glob("OPEX-*.pdf") or []):
                    # OPEX filename encodes the J-code; requesting emp is in the .msg body
                    pass
                # Try to find requesting emp from the .msg body (look for emp_no in "Emp No: XXXXXXX")
                for msg_p in found_folder.glob("*.msg"):
                    try:
                        _msg2 = _emsg_v26.Message(str(msg_p))
                        import re as _re26
                        _m = _re26.search(r"(?:emp(?:loyee)?[\s#:]*no[.\s:]*|employee\s+id\s*:?\s*)(\d{7})", (_msg2.body or "").lower())
                        if _m:
                            opex_emp_no = _m.group(1)
                            opex_emp_rec = manpower.get(opex_emp_no)
                            break
                    except Exception:
                        pass
                h["account"]        = "60307021"
                h["emp_no"]         = ""
                h["location"]       = "40100"   # sponsorship location
                h["gl_name"]        = "Sponsoring Expenses"
                # If requesting emp found in master, use their agency/cc/div/solution
                if opex_emp_rec:
                    try:
                        h["cost_center"] = str(opex_emp_rec.cost_center or h.get("cost_center", "")).zfill(6)
                        h["div"]         = str(opex_emp_rec.div_code or h.get("div", "")).zfill(3)
                        h["agency"]      = str(opex_emp_rec.agency_code or h.get("agency", "")).zfill(5)
                        h["solution"]    = str(opex_emp_rec.solution or h.get("solution", "00000")).zfill(5)
                    except Exception:
                        pass
                h["_agent_method"]  = "v26_opex_event_overlay"
                h["_route_reason"]  = "OPEX_EVENT_FOLDER_MATCH"
                h["_v2_trace"]      = f"v26 overlay: {surname} found in {found_folder.name} (OPEX sponsorship confirmed)"
                opex_event_overlay_count += 1
                print(f"  [v26-overlay] row {idx+1}: {passenger} -> 60307021 via {found_folder.name}", flush=True)
    except Exception as _v26_err:
        print(f"[v26-overlay] error: {_v26_err}", flush=True)
    print(f"[v26-overlay] {opex_event_overlay_count} rows -> 60307021 via OPEX event folder match", flush=True)


    # ── stage 4: write XLSX ────────────────────────────────────────────────
    for h in hybrid_rows:
        m = h.get("_agent_method", "")
        if m.startswith("v26_") or m.startswith("v25_") or m.startswith("v18_") or m.startswith("v16_") or m in (
            "v16_master_shortcut", "v16_sponsorship_master"
        ):
            h["_agent_method_orig"] = m
            h["_agent_method"] = "cluster_unified" if "cluster" in m else "llm_agent"

    v15.write_v15_12_xlsx(cascade_xlsx, out_xlsx, hybrid_rows, cascade_rows, hdr_row)

    for h in hybrid_rows:
        if "_agent_method_orig" in h:
            h["_agent_method"] = h.pop("_agent_method_orig")

    print(f"[out] {out_xlsx.name} (v25 pass complete)", flush=True)

    # ── stage 4.5: v26 — GL Description trailing zeros ──────────────────────────
    # Mohammed Labadi request (2026-06-03): append · 00000 · 00 · 000000 to
    # every GL Description so Oracle can see Project/Intercompany/Future1 zeros.
    try:
        _gl_wb = openpyxl.load_workbook(out_xlsx)
        _gl_ws = _gl_wb.active
        _gl_headers = [c.value for c in _gl_ws[3]]
        _gl_col = None
        for _ci, _ch in enumerate(_gl_headers, 1):
            if _ch == "GL Description":
                _gl_col = _ci
                break
        if _gl_col:
            _gl_updated = 0
            for _row in _gl_ws.iter_rows(min_row=4):
                cell = _row[_gl_col - 1]
                val = cell.value
                if val and isinstance(val, str) and not val.endswith("000000"):
                    cell.value = val.rstrip() + " · 00000 · 00 · 000000"
                    _gl_updated += 1
            _gl_wb.save(out_xlsx)
            print(f"[v26-gl-desc] {_gl_updated} GL Description cells updated (+Project/Interco/Future1 zeros)", flush=True)
        else:
            print("[v26-gl-desc] WARNING: GL Description column not found", flush=True)
    except Exception as _gl_err:
        print(f"[v26-gl-desc] ERROR: {_gl_err}", flush=True)

    # ── stage 5: booking-group detection ──────────────────────────────────
    bg_propagated, bg_conflicts = apply_booking_groups_inline_v25(out_xlsx)

    # ── stage 6: fraud detection ───────────────────────────────────────────
    fraud_catches: list[dict] = []
    if not args.skip_fraud:
        fraud_catches = run_fraud_detection(batch_id, cascade_rows, hybrid_rows, out_dir)
        # Override fraud output filename to v25
        fraud_out_v24 = out_dir / "fraud-watch-v24.json"
        fraud_out_v25 = out_dir / f"fraud-watch-{VERSION}.json"
        if fraud_out_v24.exists() and not fraud_out_v25.exists():
            import shutil as _shutil
            _shutil.copy2(fraud_out_v24, fraud_out_v25)
    else:
        print("[fraud] skipped (--skip-fraud)", flush=True)

    # ── stage 7: step trace ────────────────────────────────────────────────
    trace_path = out_dir / f"step-trace-{VERSION}.jsonl"
    if step_traces:
        with open(trace_path, "w") as tf:
            for t in step_traces:
                tf.write(json.dumps(t, default=str) + "\n")
        print(f"[trace] {len(step_traces)} routed rows → {trace_path.name}", flush=True)

    # ── stage 8: auto-score ────────────────────────────────────────────────
    auto_score: str = "N/A"
    truth_candidates = list(batch_dir.glob(f"{batch_id}.xlsx"))
    if truth_candidates:
        try:
            import subprocess
            qc_script = ROOT / "qc" / "score_against_truth.py"
            score_out = out_dir / f"score-{VERSION}.md"
            result = subprocess.run(
                ["python3", str(qc_script), str(out_xlsx), str(truth_candidates[0])],
                capture_output=True, text=True, timeout=120,
            )
            score_out.write_text(result.stdout)
            for line in reversed(result.stdout.splitlines()):
                m = re.search(r"All-5-segments exact.*?(\d+\.\d+)%", line)
                if m:
                    auto_score = f"{m.group(1)}%"
                    break
            print(f"[score] {auto_score}  → {score_out.name}", flush=True)
        except Exception as e:
            print(f"[score] auto-score failed: {e}", flush=True)
    else:
        print(f"[score] no truth file found (blind run)", flush=True)

    # ── summary ───────────────────────────────────────────────────────────
    cost_usd = (total_in * pricing_pro["in"]) + (total_out * pricing_pro["out"])
    method_counts: dict[str, int] = Counter(h["_agent_method"] for h in hybrid_rows)
    fraud_cats = Counter(c["category"] for c in fraud_catches)

    summary = {
        "batch_id":                   batch_id,
        "version":                    VERSION,
        "timestamp_utc":              utc_ts(),
        "total_rows":                 len(cascade_rows),
        "routed_to_llm":              len(routed),
        "routing_reasons":            dict(reason_counts),
        "method_counts":              dict(method_counts),
        "cascade_blanked_spon":       blanked_cascade,
        "cluster_unified":            unified,
        "pc_applied":                 pc_applied,
        "pc_family_blanked":          pc_family_blanked,
        "booking_group_propagated":   bg_propagated,
        "booking_group_conflicts":    bg_conflicts,
        "llm_errors":                 llm_errors,
        "no_cache":                   no_cache,
        "auto_score_all5":            auto_score,
        "fraud_catches":              len(fraud_catches),
        "fraud_categories":           dict(fraud_cats),
        "llm_in_tokens":              total_in,
        "llm_out_tokens":             total_out,
        "cost_usd_est":               round(cost_usd, 4),
        "cost_ceiling":               args.cost_ceiling,
        "runtime_sec":                round(time.time() - t_start, 1),
        "cascade_input":              str(cascade_xlsx),
        "output":                     str(out_xlsx),
    }
    (out_dir / f"summary-{VERSION}.json").write_text(
        json.dumps(summary, indent=2, default=str)
    )

    print()
    print("=" * 65)
    print(f"  {VERSION} done — {batch_id}")
    print(f"  Rows:              {summary['total_rows']}  ({len(routed)} routed to LLM)")
    print(f"  Cascade blanked:   {blanked_cascade}")
    print(f"  Methods:           {dict(method_counts)}")
    print(f"  Cluster unif.:     {unified}")
    print(f"  PC applied:        {pc_applied}")
    print(f"  PC-family blanked: {pc_family_blanked}")
    print(f"  Booking groups:    {bg_propagated} propagated  "
          f"{bg_conflicts} conflicts {'⚠️' if bg_conflicts else '✅'}")
    print(f"  Fraud catches:     {len(fraud_catches)}"
          f"  {dict(fraud_cats) if fraud_cats else '(none)'}")
    print(f"  LLM cost (est):    ${cost_usd:.4f}  ({total_in:,} in / {total_out:,} out)")
    print(f"  Runtime:           {summary['runtime_sec']:.1f}s")
    print(f"  Score (auto):      {auto_score}")
    print(f"  Step trace:        {len(step_traces)} rows → step-trace-{VERSION}.jsonl")
    print(f"  Output:            {out_xlsx.name}")
    print("=" * 65)


if __name__ == "__main__":
    main()
