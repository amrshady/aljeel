
# Pull shared resources from the parent fea module
import json as _json_mod
import sys as _sys_mod
from pathlib import Path as _Path
_sys_mod.path.insert(0, str(_Path(__file__).parent))
import full_evidence_agent as _fea
CACHE_DIR = _fea.CACHE_DIR
call_gemini = _fea.call_gemini
json = _json_mod  # make json available in this module scope

# ============================================================
# v16 ADDITIONS — Employee vs Sponsorship Classifier
# Added 2026-05-26. Call before full LLM resolution when
# cascade got no email evidence (FORM_NOT_FOUND_IN_EMAIL).
# ============================================================

def get_day_folders(invoice_date_str: str, all_folders: list) -> list:
    """Return folders whose parent day-dir matches the invoice row date."""
    try:
        from datetime import datetime
        dt = datetime.strptime(str(invoice_date_str)[:10], "%Y-%m-%d")
        day_key  = "{}{}".format(dt.day, dt.strftime('%b').lower())    # e.g. '16apr'
        day_key0 = "{:02d}{}".format(dt.day, dt.strftime('%b').lower()) # '02may'
        matched = [f for f in all_folders
                   if f.parent.name.lower().rstrip() in (day_key, day_key0)]
        if matched:
            return matched
    except Exception:
        pass
    return all_folders


def _build_folder_listing(candidate_folders: list) -> list:
    listing = []
    for f in candidate_folders[:40]:
        files = []
        try:
            files = [c.name for c in sorted(f.iterdir()) if c.is_file()][:6]
        except Exception:
            pass
        listing.append({"folder": f.name, "files": files})
    return listing


def build_classify_prompt(row: dict, candidate_folders: list) -> str:
    folder_listing = _build_folder_listing(candidate_folders)
    listing_json = json.dumps(folder_listing, ensure_ascii=False, indent=1)
    passenger = row.get('passenger', '')
    route = row.get('route', '')
    ticket_no = row.get('ticket_no', '')
    amount = row.get('amount', '')
    date = row.get('date', '')
    notes = row.get('notes', '') or '(none)'

    return (
        "You are an AP classification specialist for AlJeel Medical (Saudi healthcare).\n\n"
        "Determine whether the following invoice row is:\n"
        "  TYPE_EMPLOYEE   - regular business trip by an AlJeel employee (accounts 60301003/60301004)\n"
        "  TYPE_SPONSORED  - external person (doctor/guest) funded by AlJeel sponsorship (account 60307021).\n"
        "                    Typically: international medical conference/congress trips.\n"
        "  TYPE_TRAINING   - AlJeel employee attending a training course/programme (account 60308009).\n"
        "                    Evidence: OPEX form or email mentions training, GL codes show 60308009.\n"
        "  TYPE_UNKNOWN    - insufficient evidence to classify\n\n"
        "Also identify: which nearby folder contains the approval evidence, and the AlJeel\n"
        "requester/approver emp_no if this is a sponsorship.\n\n"
        "## INVOICE ROW\n"
        "Passenger:    {passenger}\n"
        "Route:        {route}\n"
        "Ticket #:     {ticket_no}\n"
        "Amount (SAR): {amount}\n"
        "Date:         {date}\n"
        "Notes:        {notes}\n\n"
        "## NEARBY EVIDENCE FOLDERS (check folder names + file names for clues)\n"
        "{listing}\n\n"
        "## RULES\n"
        "- Folder named after a conference/event (Barcelona, Munich, ISHLT, AATS, EHRA, HRS,\n"
        "  CRM, EP) matching the route destination -> TYPE_SPONSORED\n"
        "- OPEX-*.pdf, J-2026-*.pdf, or HF-*.pdf in any nearby folder -> TYPE_SPONSORED\n"
        "- 'Personal Contribution' or 'Business Trip' email in the ticket folder -> TYPE_EMPLOYEE\n"
        "- Passenger name is a venue/service (meeting room, hotel, transfer) -> TYPE_SPONSORED\n"
        "- Group booking folder with multiple passengers going to same destination -> TYPE_SPONSORED\n"
        "- No evidence either way -> TYPE_UNKNOWN (pipeline uses cascade defaults)\n\n"
        "## OUTPUT - return ONLY this JSON, no prose, no code fences:\n"
        "{{\n"
        '  "row_type": "TYPE_EMPLOYEE | TYPE_SPONSORED | TYPE_TRAINING | TYPE_UNKNOWN",\n'
        '  "evidence_folder": "<folder name from the list above, or null>",\n'
        '  "requester_emp_no": "<7-digit AlJeel emp_no of organizer/requester, or null>",\n'
        '  "reasoning": "<1-2 sentences citing specific folder/file names>"\n'
        "}}\n"
    ).format(
        passenger=passenger, route=route, ticket_no=ticket_no,
        amount=amount, date=date, notes=notes, listing=listing_json,
    )


def classify_employee_or_sponsorship(
    row: dict,
    invoice_date_str: str,
    all_folders: list,
    batch_id: str,
    row_idx: int,
) -> dict:
    """First-step LLM call (Flash - cheap) to classify employee vs sponsored.
    Returns: row_type, evidence_folder, requester_emp_no, reasoning, _model, _cached.
    """
    ticket_no = row.get("ticket_no", "") or ""
    cache_key = "v16-classify-{}-row{:03d}-{}.json".format(
        batch_id, row_idx, ticket_no or "noticket"
    )
    cache_path = CACHE_DIR / cache_key
    if cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text())
            cached["_cached"] = True
            return cached
        except Exception:
            pass

    # Pass all folders (not day-filtered) — Oracle invoice date is the batch end date
    # for ALL rows, so day-filtering misses group-booking event folders from earlier days.
    # The 40-folder cap in _build_folder_listing is enough to keep the prompt concise.
    prompt = build_classify_prompt(row, all_folders)
    res = call_gemini(prompt, "gemini-2.5-flash")
    j = res.get("json", {}) or {}
    out = {
        "row_type": j.get("row_type", "TYPE_UNKNOWN"),
        "evidence_folder": j.get("evidence_folder"),
        "requester_emp_no": j.get("requester_emp_no"),
        "reasoning": j.get("reasoning", ""),
        "_model": res.get("model", ""),
        "_in_tokens": res.get("in_tokens", 0),
        "_out_tokens": res.get("out_tokens", 0),
        "_error": res.get("error", ""),
        "_cached": False,
    }
    try:
        cache_path.write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str))
    except Exception:
        pass
    return out


def find_folder_by_name(name: str, all_folders: list):
    """Find a folder by exact or fuzzy name match (used by v16 to resolve classifier hint)."""
    if not name:
        return None
    name_up = name.strip().upper()
    for f in all_folders:
        if f.name.strip().upper() == name_up:
            return f
    for f in all_folders:
        if name_up in f.name.upper() or f.name.upper() in name_up:
            return f
    return None
