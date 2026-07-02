#!/usr/bin/env python3
"""
Jawal travel-claim analyzer for Aljeel AP demo (v2).

Jawal Travel is Aljeel's outsourced travel agency. Each ticket is a folder
under `24-30apr/<day>/<ticket_no>/` containing:
  - 1 flight booking PDF (Sabre/GDS PNR confirmation), OR
  - sponsorship voucher artifacts (OPEX form + email approval),
  - approval .msg emails.

Plus the monthly invoice xlsx `J26-640.xlsx` (= INV-30 APR 26 AL JEEL.xlsx).
Two sheets matter:

  - Details (117 rows): every ticket line with cost-center / GL / VAT coding.
    Ticket numbers formatted as `<3-digit-ref> <10-digit-ticket>` (e.g.
    `390 6905264365`), or `26-XXX` for sponsorship vouchers.

  - INVOICE (117 rows): same tickets, but col 6 (`Ref. No.`) holds the human
    text reference (e.g. `RE: ISHLT Toronto Hotel`, `sponsor payment form`,
    `CRM-2026-27 Approval`). These match the folder names EXACTLY for the
    sponsorship-voucher-style entries (`26-XXX` tickets).

v2 changes vs v1 (per QC report 2026-05-15):
  - Added text-ref matching via INVOICE.col6 -> folder-name fuzzy match (CRIT-1).
  - Range folders `6905341979-80` now generate both IDs (CRIT-1.b).
  - Folder discovery no longer collides on parsed key (CRIT-2).
  - VAT expectation driven by col 13 `vat_class`, not GL heuristic (MAT-1).
  - DUP_ROUTE tightened to same-week + not a balanced there-and-back (MAT-3).
  - PERSONAL_CONTRIBUTION_LEAKAGE category added (P1 from QC).
  - NO_APPROVAL still fires (was correct in v1).
"""
import os
import re
import json
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime, timedelta

import pandas as pd
import pymupdf  # PyMuPDF — for reading PDF body text to find embedded ticket nos

ROOT     = Path('/home/clawdbot/.openclaw/workspace/aljeel')
MATCHED  = ROOT / 'matched'
MATCHED.mkdir(parents=True, exist_ok=True)

# v3: invoice xlsx + folder root discovered at runtime from raw/
_CFG = None
def _ensure_cfg():
    global _CFG
    if _CFG is None:
        from discover import discover_jawal
        _CFG = discover_jawal()
    return _CFG


# ---------------------------------------------------------------------------
# Load both sheets — Details for canonical fields, INVOICE for text refs
# ---------------------------------------------------------------------------

def load_details():
    cfg = _ensure_cfg()
    df = pd.read_excel(cfg.invoice_xlsx, sheet_name='Details', header=0)
    rename = {df.columns[0]: 'sl_no',
              df.columns[1]: 'issue_date',
              df.columns[2]: 'ref_no',
              df.columns[3]: 'ticket_no_raw',
              df.columns[4]: 'passenger_name',
              df.columns[5]: 'route',
              df.columns[6]: 'service_date',
              df.columns[7]: 'taxable_amt',
              df.columns[8]: 'vat_pct',
              df.columns[9]: 'vat_amt',
              df.columns[10]: 'total_incl_vat',
              df.columns[11]: 'emp_no_new',
              df.columns[12]: 'notes',
              df.columns[13]: 'vat_class',
              df.columns[16]: 'account_no',
              df.columns[17]: 'gl_name',
              df.columns[19]: 'cost_name',
              df.columns[23]: 'solution_name',
              df.columns[25]: 'agency_name'}
    df = df.rename(columns=rename)
    df = df[df['ticket_no_raw'].notna()].copy()

    df['ticket_no_raw'] = df['ticket_no_raw'].astype(str).str.strip()
    df['ticket_no'] = df['ticket_no_raw'].apply(
        lambda v: v.split()[-1] if ' ' in v else v
    )
    # `.replace('nan', '')` on an astype(str) column does NOT clear values that
    # were originally np.nan; pandas keeps a NaN sentinel after astype(str).
    # Fillna first, then string-strip.
    df['ref_no']    = df['ref_no'].fillna('').astype(str).str.strip().str.replace('nan', '', regex=False)
    df['route']     = df['route'].fillna('').astype(str).str.strip().str.replace('nan', '', regex=False)
    df['notes']     = df['notes'].fillna('').astype(str)
    df['gl_name']   = df['gl_name'].fillna('').astype(str)
    df['vat_class'] = df['vat_class'].fillna('').astype(str).str.strip()
    df['agency_name'] = df.get('agency_name', '').fillna('').astype(str)

    for c in ('taxable_amt', 'vat_amt', 'total_incl_vat', 'vat_pct'):
        df[c] = pd.to_numeric(df[c], errors='coerce')
    df['service_date_str'] = pd.to_datetime(df['service_date'], errors='coerce').dt.strftime('%Y-%m-%d')
    df['issue_date_str']   = pd.to_datetime(df['issue_date'],   errors='coerce').dt.strftime('%Y-%m-%d')
    df['account_no_str'] = df['account_no'].apply(
        lambda v: f'{int(v):08d}' if pd.notna(v) and isinstance(v, (int, float)) else ''
    )
    return df


def load_invoice_text_refs():
    """Parse the INVOICE sheet to extract the text Ref. No. (col 6) per ticket.

    Returns dict: ticket_no (10-digit or 26-XXX) -> text_ref string
    """
    cfg = _ensure_cfg()
    inv = pd.read_excel(cfg.invoice_xlsx, sheet_name='INVOICE', header=None)
    # The ticket list starts where col 0 has the Sl. No. (integer) and col 11
    # has the ticket number. Walk every row and capture (text_ref, ticket).
    out = {}
    for _, row in inv.iterrows():
        sl = row.iloc[0]
        if pd.isna(sl) or not isinstance(sl, (int, float)):
            continue
        text_ref = str(row.iloc[6]).strip() if pd.notna(row.iloc[6]) else ''
        ticket_raw = str(row.iloc[11]).strip() if pd.notna(row.iloc[11]) else ''
        if not ticket_raw:
            continue
        # Normalize ticket: 10-digit suffix for flights, full string for 26-XXX
        if ' ' in ticket_raw:
            ticket = ticket_raw.split()[-1]
        else:
            ticket = ticket_raw
        if text_ref and text_ref.lower() != 'nan':
            out[ticket] = text_ref
    return out


# ---------------------------------------------------------------------------
# Folder discovery (v2: no key collisions, full path retained per folder)
# ---------------------------------------------------------------------------

def _extract_ticket_ids_from_pdf(pdf_path: Path) -> set:
    """v3 (per QC v2 CRIT-2): open booking PDF body text and find ALL 10-digit
    ticket numbers embedded inside. Round-trip flights have 2 ticket numbers
    sharing one PDF; folder is named for the first leg only. Without this,
    the second leg lands in NO_FOLDER incorrectly.
    """
    ids = set()
    try:
        with pymupdf.open(str(pdf_path)) as doc:
            text = '\n'.join(page.get_text() for page in doc)
        # 10-digit ticket numbers (J&J ticket pattern) appearing in body
        for m in re.finditer(r'\b(\d{10})\b', text):
            ids.add(m.group(1))
        # 26-XXX sponsorship voucher numbers
        for m in re.finditer(r'\b(26-\d{3,4})\b', text):
            ids.add(m.group(1))
    except Exception:
        pass
    return ids


def _is_self_approval_msg(msg_path) -> bool:
    """Detect TRUE self-approval: the SENDER of the .msg (the person who hit
    reply to approve) is the same as the requester named in the subject.

    v4 (per QC 2026-05-15 — Amr feedback): the v3 rule keyed off the filename's
    'for X by X' pattern, but that pattern is Oracle Fusion workflow notation
    meaning "approval task <for> employee X, <submitted by> employee X" — it's
    the static title of the workflow task, NOT an approval signature. The
    actual approver is the sender of the email, which is always a different
    person in the Aljeel sample (verified: 38 of 38 'for X by X'-pattern .msg
    files have sender = Sanad F. Al Shammari, not the requester).

    True self-approval requires the SENDER metadata to match the requester.
    """
    try:
        msg_path = Path(msg_path) if not isinstance(msg_path, Path) else msg_path
        if not msg_path.exists() or msg_path.stat().st_size == 0:
            return False
        import extract_msg
        msg = extract_msg.Message(str(msg_path))
        subject = (msg.subject or '').strip()
        sender = (msg.sender or '').strip()
    except Exception:
        return False
    if 'personal contribution' not in (subject + ' ' + msg_path.name).lower():
        return False
    sm = re.search(r'for\s+(.+?)\s+\(\d+\)\s+on\s+\d{4}-\d{2}-\d{2}\s+by\s+(.+?)$',
                   subject, re.IGNORECASE)
    if not sm:
        return False
    requester = sm.group(1).strip().lower()
    requester = re.sub(r'\s+', ' ', requester)
    # Look for any 5+ char token of the requester name in the sender field
    requester_tokens = [t for t in requester.split() if len(t) >= 5]
    if not requester_tokens:
        return False
    sender_low = sender.lower()
    # True self-approval: sender's name (or email local-part) contains 2+
    # requester tokens. ERP Prod system notifications and human approvers like
    # Sanad Al Shammari will fail this test.
    matches = sum(1 for t in requester_tokens if t in sender_low)
    return matches >= 2


RAW_ROOT = Path('/home/clawdbot/.openclaw/workspace/aljeel/raw')


def scan_folders():
    """Walk <folder_root>/<day>/<ticket_dir>/ and return list of folder records.

    Each record:
      folder_name (raw)
      day (24apr..30apr)
      pdfs / msgs / opex_forms (filenames)
      ticket_ids (set of 10-digit IDs derived from folder name AND PDF body text)
      ref_text_key (normalized lowercase, punctuation-stripped) for fuzzy match
      personal_contribution: bool (any .msg with 'Personal Contribution' in name)
      self_approval: bool (any .msg where requester == approver)
    """
    cfg = _ensure_cfg()
    folders = []
    for day_dir in sorted(cfg.folder_root.iterdir()):
        if not day_dir.is_dir():
            continue
        for ticket_dir in sorted(day_dir.iterdir()):
            if not ticket_dir.is_dir():
                continue
            name = ticket_dir.name
            ticket_ids = set()
            # v2: handle range folders (`6905341979-80`, `6905369300-301`)
            m = re.match(r'^(\d{10})-(\d{2,3})$', name)
            if m:
                base = m.group(1)
                suffix = m.group(2)
                # base ticket
                ticket_ids.add(base)
                # second ticket: replace last N digits of base with suffix
                second = base[:-len(suffix)] + suffix
                ticket_ids.add(second)
            else:
                # plain numeric prefix → 10-digit ticket
                plain = re.match(r'^(\d{10})', name)
                if plain:
                    ticket_ids.add(plain.group(1))
            # Normalize text-ref key for non-numeric folders
            ref_text_key = re.sub(r'[^\w\s]', ' ', name).lower().strip()
            ref_text_key = re.sub(r'\s+', ' ', ref_text_key)

            pdfs, msgs, opex = [], [], []
            pdf_paths = []  # keep paths for body-text extraction
            personal_contrib = False
            self_approval = False
            for f in ticket_dir.rglob('*'):
                if f.is_file():
                    if f.suffix.lower() == '.pdf':
                        if 'opex' in f.stem.lower():
                            opex.append(f.name)
                        else:
                            pdfs.append(f.name)
                            pdf_paths.append(f)
                    elif f.suffix.lower() == '.msg':
                        msgs.append(f.name)
                        if 'personal contribution' in f.stem.lower():
                            personal_contrib = True
                        if _is_self_approval_msg(f):
                            self_approval = True
            # v3: extract ticket numbers from PDF body text and union into ticket_ids
            for pdf_p in pdf_paths:
                ticket_ids |= _extract_ticket_ids_from_pdf(pdf_p)
            # Folder relative path under raw/ so the dashboard can build URLs into
            # the files-mirror site.
            try:
                folder_rel_path = str(ticket_dir.relative_to(RAW_ROOT)).replace(os.sep, '/')
            except ValueError:
                folder_rel_path = None
            folders.append({
                'folder_name': name,
                'folder_rel_path': folder_rel_path,
                'day': day_dir.name,
                'ticket_ids': ticket_ids,
                'ref_text_key': ref_text_key,
                'pdfs': pdfs,
                'msgs': msgs,
                'opex_forms': opex,
                'personal_contribution': personal_contrib,
                'self_approval': self_approval,
            })
    return folders


def normalize_text_ref(s):
    s = re.sub(r'[^\w\s]', ' ', str(s)).lower().strip()
    s = re.sub(r'\s+', ' ', s)
    return s


# ---------------------------------------------------------------------------
# Matching: ticket -> folder
# ---------------------------------------------------------------------------

def match_tickets_to_folders(details_df, text_refs, folders):
    """Three-pass matching:
       1. By 10-digit ticket id (covers flight bookings + range folders).
       2. By INVOICE-sheet text Ref. No. ↔ folder name (for `26-XXX` vouchers).
       3. By passenger name ↔ PDF / .msg filename in folder (catches sponsorship
          vouchers where text_ref is just an employee ID, plus same-passenger
          26-XXX siblings).
       4. By route keyword (e.g. 'TRAIN TICKET' route -> `train booking`/`train ticket` folder).
    """
    # Index folders
    folders_by_ticket = defaultdict(list)
    folders_by_ref    = defaultdict(list)
    folders_all = list(folders)
    for f in folders:
        for t in f['ticket_ids']:
            folders_by_ticket[t].append(f)
        if f['ref_text_key']:
            folders_by_ref[f['ref_text_key']].append(f)

    def _name_variants(token):
        """Return likely OCR/transliteration variants for a name token.
        E.g. MOHAMMED <-> MOHAMED, MOHAMMAD <-> MOHAMED."""
        t = token.upper()
        variants = {t}
        # Trim a doubled consonant from 'MOHAMMED', 'MUHAMMAD' style spellings
        m = re.match(r'^MOHA?MM?[AE]D$', t)
        if m:
            variants |= {'MOHAMED', 'MOHAMMED', 'MOHAMMAD', 'MUHAMMAD'}
        return variants

    def passenger_in_folder(passenger, folder, allow_msg=False):
        """Match: ALL unique tokens of the passenger name appear in the same
        filename (with name-variant tolerance for common Arabic transliterations).

        v3.1 (per QC v3 MAT-1): allow common spelling variants per token.
        Default PDFs-only; pass allow_msg=True for system-coded PDFs (trains).
        """
        if not passenger:
            return False
        tokens = re.split(r'[\s/]+', passenger.upper())
        tokens = [t for t in tokens if t not in ('MR', 'MS', 'MRS', 'ENG', 'DR') and len(t) >= 4]
        unique_tokens = list(dict.fromkeys(tokens))
        if len(unique_tokens) < 2:
            return False
        # Pre-compute variant sets per token
        token_variants = [_name_variants(t) for t in unique_tokens]
        files = folder['pdfs'] + (folder['msgs'] if allow_msg else [])
        for fname in files:
            fn_upper = fname.upper()
            if all(any(v in fn_upper for v in vs) for vs in token_variants):
                return True
        return False

    matched = []
    for _, row in details_df.iterrows():
        tkt = str(row['ticket_no']).strip()
        text_ref = text_refs.get(tkt, '')
        text_ref_norm = normalize_text_ref(text_ref)
        passenger = str(row['passenger_name']) if pd.notna(row['passenger_name']) else ''
        route = str(row['route']).upper() if pd.notna(row['route']) else ''

        folder = None
        match_method = None

        # Pass 1: exact ticket id match
        if tkt in folders_by_ticket:
            folder = folders_by_ticket[tkt][0]
            match_method = 'ticket_id'

        # Pass 2: text-ref match
        if folder is None and text_ref_norm and text_ref_norm != 'nan':
            for ref_key, fl in folders_by_ref.items():
                if text_ref_norm in ref_key or ref_key in text_ref_norm:
                    folder = fl[0]
                    match_method = 'text_ref'
                    break
                t1 = set(text_ref_norm.split())
                t2 = set(ref_key.split())
                if t1 and t2 and len(t1 & t2) >= max(2, min(len(t1), len(t2)) - 1):
                    folder = fl[0]
                    match_method = 'text_ref'
                    break

        # Pass 3: route-keyword match (run before passenger-name to disambiguate
        # cases where a passenger has BOTH a flight and a train booking folder)
        if folder is None and 'TRAIN' in route:
            for f in folders_all:
                fk = f['ref_text_key']
                # Train folder PDFs are system-coded (e.g. 227_04292026_JDD_*.pdf)
                # so check .msg files too for passenger name
                if 'train' in fk and passenger_in_folder(passenger, f, allow_msg=True):
                    folder = f
                    match_method = 'route_keyword'
                    break

        # Pass 4: passenger-name strict match against PDF filenames
        # (sponsorship 26-XXX, mostly)
        if folder is None and tkt.startswith('26-'):
            for f in folders_all:
                if passenger_in_folder(passenger, f):
                    folder = f
                    match_method = 'passenger_name'
                    break

        matched.append({
            'sl_no':           int(row['sl_no']) if pd.notna(row['sl_no']) else None,
            'ticket_no':       tkt,
            'ticket_no_raw':   str(row['ticket_no_raw']),
            'ref_no':          row['ref_no'],
            'text_ref':        text_ref,
            'passenger_name':  str(row['passenger_name']) if pd.notna(row['passenger_name']) else '',
            'route':           row['route'],
            'service_date':    row['service_date_str'],
            'issue_date':      row['issue_date_str'],
            'taxable_amt':     float(row['taxable_amt']) if pd.notna(row['taxable_amt']) else None,
            'vat_pct':         float(row['vat_pct']) if pd.notna(row['vat_pct']) else None,
            'vat_amt':         float(row['vat_amt']) if pd.notna(row['vat_amt']) else None,
            'total_incl_vat':  float(row['total_incl_vat']) if pd.notna(row['total_incl_vat']) else None,
            'notes':           str(row['notes']),
            'gl_name':         row['gl_name'],
            'account_no':      row['account_no_str'],
            'vat_class':       row['vat_class'],
            'agency_name':     row['agency_name'],
            'has_folder':      folder is not None,
            'match_method':    match_method,
            'folder_name':     folder['folder_name'] if folder else None,
            'folder_rel_path': folder.get('folder_rel_path') if folder else None,
            'day_folder':      folder['day'] if folder else None,
            'pdf_count':       len(folder['pdfs']) if folder else 0,
            'msg_count':       len(folder['msgs']) if folder else 0,
            'opex_count':      len(folder['opex_forms']) if folder else 0,
            'pdfs':            folder['pdfs'] if folder else [],
            'msgs':            folder['msgs'] if folder else [],
            'opex_forms':      folder['opex_forms'] if folder else [],
            'personal_contribution': folder['personal_contribution'] if folder else False,
            'self_approval':   folder.get('self_approval', False) if folder else False,
        })
    return matched


# ---------------------------------------------------------------------------
# Catch exceptions (v2)
# ---------------------------------------------------------------------------

def _msg_label(msg_filename: str) -> str:
    """Derive a short, distinguishable tab label from a .msg filename."""
    name = msg_filename.rsplit('.msg', 1)[0]
    # Strip the leading 'Re_'/'RE_'/'Fw_' reply markers
    name = re.sub(r'^(re|fw|fwd)[_:]\s*', '', name, flags=re.IGNORECASE)
    # Strip the leading 'Approved_' / 'Approved:' marker
    name = re.sub(r'^approved[_:]\s*', '', name, flags=re.IGNORECASE)
    # Strip the noisy 'Personal Contribution Approval Requested for X (emp#) on YYYY-MM-DD by X' wrapper — just show 'PC approval: Name'
    m = re.search(r'personal contribution approval requested for\s+(.+?)\s+\(\d+\)', name, re.IGNORECASE)
    if m:
        return f'PC approval: {m.group(1).strip()[:24]}'
    # Otherwise truncate
    if len(name) > 38:
        return name[:36] + '…'
    return name


def catch_exceptions(recon, folders):
    catches = []

    # 1a. EMD_FEE — ticket numbers starting with '1936' are EMD fare-adjustment
    # tickets for an earlier booking; they don't get their own folder.
    # Surface as a LOW-severity informational catch instead of NO_FOLDER.
    for r in recon:
        if not r['has_folder'] and r['ticket_no'].startswith('1936'):
            v = r['total_incl_vat'] or 0
            catches.append({
                'category': 'EMD_FEE',
                'severity': 'LOW',
                'ticket_no': r['ticket_no'],
                'passenger': r['passenger_name'],
                'route':     r['route'],
                'value_at_risk_sar': 0.0,
                'detail': (
                    f"EMD fare-adjustment ticket {r['ticket_no']} ({r['passenger_name']}, "
                    f"{r['route']}, SAR {v:.2f}). Shares evidence with the original "
                    "booking - no separate folder expected."
                ),
            })

    # 1b. NO_FOLDER — genuinely missing folders (after all 4 matching passes)
    for r in recon:
        if r['has_folder']:
            continue
        if r['ticket_no'].startswith('1936'):
            continue  # handled by EMD_FEE above
        v = r['total_incl_vat'] or 0
        catches.append({
            'category': 'NO_FOLDER',
            'severity': 'HIGH' if v > 1500 else 'MEDIUM',
            'ticket_no': r['ticket_no'],
            'passenger': r['passenger_name'],
            'route':     r['route'],
            'value_at_risk_sar': v,
            'detail': (
                f"Ticket {r['ticket_no']} ({r['passenger_name']}, {r['route']}, "
                f"SAR {v:.2f}) is on the invoice but has no backing folder "
                "(neither by ticket number, text reference, passenger name, nor route keyword)."
            ),
            'evidence': {
                'ticket_no':    r['ticket_no'],
                'passenger':    r['passenger_name'],
                'route':        r['route'],
                'service_date': r['service_date'],
                'amount_sar':   v,
                'files':        [],  # explicitly empty
                'note':         'No folder match across all 4 passes (ticket id, text ref, passenger name, route keyword). Ask Jawal for the booking PDF + manager approval email.',
            },
        })

    # 2. ORPHAN_FOLDER — folders with no matching invoice row
    matched_folder_names = set()
    for r in recon:
        if r['folder_name']:
            matched_folder_names.add(r['folder_name'])
    for f in folders:
        if f['folder_name'] not in matched_folder_names:
            base = (f.get('folder_rel_path') or '')
            files_list = []
            for p in f['pdfs']:
                files_list.append({'label': p[:42], 'rel_path': f"{base}/{p}", 'type': 'pdf'})
            for p in f['opex_forms']:
                files_list.append({'label': f'OPEX: {p[:34]}', 'rel_path': f"{base}/{p}", 'type': 'pdf'})
            for p in f['msgs']:
                files_list.append({'label': _msg_label(p), 'rel_path': f"{base}/{p}", 'type': 'msg'})
            catches.append({
                'category': 'ORPHAN_FOLDER',
                'severity': 'LOW',
                'folder_name': f['folder_name'],
                'day': f['day'],
                'pdf_count': len(f['pdfs']),
                'msg_count': len(f['msgs']),
                'opex_count': len(f['opex_forms']),
                'detail': (
                    f"Folder `{f['folder_name']}` ({f['day']}, "
                    f"{len(f['pdfs'])} PDF, {len(f['msgs'])} msg, {len(f['opex_forms'])} OPEX) "
                    "has no matching row on the J26-640 invoice."
                ),
                'evidence': {
                    'folder_name':   f['folder_name'],
                    'folder_rel':    base,
                    'files':         files_list,
                    'note':          'Folder has supporting docs but no invoice line was matched. Confirm whether this is a cancelled booking or a billing item Jawal will send later.',
                },
            })

    # 3. NO_APPROVAL — folder exists but no .msg approval
    for r in recon:
        if r['has_folder'] and r['msg_count'] == 0:
            v = r['total_incl_vat'] or 0
            base = r.get('folder_rel_path') or ''
            files_list = []
            for p in (r.get('pdfs') or []):
                files_list.append({'label': p[:40], 'rel_path': f"{base}/{p}", 'type': 'pdf'})
            for p in (r.get('opex_forms') or []):
                files_list.append({'label': f'OPEX: {p[:32]}', 'rel_path': f"{base}/{p}", 'type': 'pdf'})
            catches.append({
                'category': 'NO_APPROVAL',
                'severity': 'HIGH' if v > 3000 else 'MEDIUM',
                'ticket_no': r['ticket_no'],
                'passenger': r['passenger_name'],
                'route':     r['route'],
                'value_at_risk_sar': v,
                'detail': (
                    f"Ticket {r['ticket_no']} ({r['passenger_name']}, "
                    f"SAR {v:.2f}) has booking docs but no approval email "
                    "(.msg) in the folder. Cannot confirm manager approval before booking."
                ),
                'evidence': {
                    'ticket_no':    r['ticket_no'],
                    'passenger':    r['passenger_name'],
                    'route':        r['route'],
                    'amount_sar':   v,
                    'folder_rel':   base,
                    'files':        files_list,
                    'note':         'Booking PDF is present but no .msg approval email. Confirm with line manager before posting.',
                },
            })

    # 4. SPONSOR_NO_CRM — Sponsoring without CRM-### / J-### tag
    for r in recon:
        is_sponsor = 'Sponsoring' in r['gl_name'] or r['account_no'] == '60307021'
        if is_sponsor and 'CRM-' not in r['notes'] and 'J-' not in r['notes']:
            v = r['total_incl_vat'] or 0
            catches.append({
                'category': 'SPONSOR_NO_CRM',
                'severity': 'HIGH',
                'ticket_no': r['ticket_no'],
                'passenger': r['passenger_name'],
                'value_at_risk_sar': v,
                'detail': (
                    f"Sponsoring ticket {r['ticket_no']} ({r['passenger_name']}, "
                    f"SAR {v:.2f}) has no CRM-### or J-### tag in Notes."
                ),
            })

    # 5. VAT_CLASS_VS_PCT — vat_class column is the source of truth
    for r in recon:
        vc = r['vat_class']
        pct = r['vat_pct']
        if pct is None or not vc:
            continue
        if vc == 'KSA VAT STANDARD' and abs(pct - 15) > 0.5:
            catches.append({
                'category': 'VAT_CLASS_VS_PCT',
                'severity': 'MEDIUM',
                'ticket_no': r['ticket_no'],
                'detail': f"Ticket {r['ticket_no']} classified KSA VAT STANDARD but VAT {pct:.0f}% (expected 15%).",
            })
        elif vc == 'KSA VAT ZERO' and abs(pct - 0) > 0.5:
            catches.append({
                'category': 'VAT_CLASS_VS_PCT',
                'severity': 'MEDIUM',
                'ticket_no': r['ticket_no'],
                'detail': f"Ticket {r['ticket_no']} classified KSA VAT ZERO but VAT {pct:.0f}% (expected 0%).",
            })

    # 6. GL_VS_VAT_CLASS — sponsorship-coded but VAT STANDARD (or vice versa)
    # for r in recon:
    #     is_sponsor_gl = 'Sponsoring' in r['gl_name'] or r['account_no'] == '60307021'
    #     vc = r['vat_class']
    #     if is_sponsor_gl and vc == 'KSA VAT STANDARD':
    #         catches.append({
    #             'category': 'GL_VS_VAT_CLASS',
    #             'severity': 'MEDIUM',
    #             'ticket_no': r['ticket_no'],
    #             'detail': f"Ticket {r['ticket_no']} coded to Sponsoring Expenses but VAT class is STANDARD (15%) — likely a venue/service charge miscoded as sponsorship.",
    #         })

    # 7. DUP_ROUTE_STRICT — same passenger + same route within ±2 days,
    # excluding EMD fee pairs (ticket_no starts with '1936' = change-fee tickets
    # against an original 6905* booking) and excluding the same logical row
    # split into multiple cost-center allocations (same passenger, route AND
    # ticket_no, but multiple rows on the invoice for cost-center split).
    by_pax = defaultdict(list)
    for r in recon:
        if r['passenger_name'] and r['route'] and r['service_date']:
            by_pax[r['passenger_name']].append(r)
    for pax, trips in by_pax.items():
        for i, t1 in enumerate(trips):
            for t2 in trips[i+1:]:
                if t1['route'] != t2['route']:
                    continue
                # v3: skip same-ticket cost-center splits (e.g. 26-689 x3)
                if t1['ticket_no'] == t2['ticket_no']:
                    continue
                # v3: skip EMD fee pairs (1936* ticket numbers are change fees,
                # not separate bookings)
                if t1['ticket_no'].startswith('1936') or t2['ticket_no'].startswith('1936'):
                    continue
                try:
                    d1 = datetime.strptime(t1['service_date'], '%Y-%m-%d')
                    d2 = datetime.strptime(t2['service_date'], '%Y-%m-%d')
                except Exception:
                    continue
                gap = abs((d2 - d1).days)
                if gap > 2:
                    continue
                # Build evidence files for both tickets
                files_list = []
                for tk in (t1, t2):
                    base = tk.get('folder_rel_path') or ''
                    if base:
                        for p in (tk.get('pdfs') or []):
                            files_list.append({'label': f"{tk['ticket_no']}: {p[:30]}", 'rel_path': f"{base}/{p}", 'type': 'pdf'})
                        for p in (tk.get('msgs') or []):
                            files_list.append({'label': f"{tk['ticket_no']}: {_msg_label(p)}", 'rel_path': f"{base}/{p}", 'type': 'msg'})
                catches.append({
                    'category': 'DUP_ROUTE_STRICT',
                    'severity': 'MEDIUM',
                    'passenger': pax,
                    'route':     t1['route'],
                    'occurrences': 2,
                    'tickets':   [t1['ticket_no'], t2['ticket_no']],
                    'dates':     [t1['service_date'], t2['service_date']],
                    'gap_days':  gap,
                    'total_sar': (t1['total_incl_vat'] or 0) + (t2['total_incl_vat'] or 0),
                    'detail': (
                        f"{pax} booked {t1['route']} twice within {gap} day(s) "
                        f"({t1['service_date']} + {t2['service_date']}) - "
                        "possible change-without-cancel double booking."
                    ),
                    'evidence': {
                        'passenger':  pax,
                        'route':      t1['route'],
                        'tickets':    [{'ticket_no': t1['ticket_no'], 'date': t1['service_date'], 'amount_sar': t1['total_incl_vat']},
                                       {'ticket_no': t2['ticket_no'], 'date': t2['service_date'], 'amount_sar': t2['total_incl_vat']}],
                        'files':      files_list,
                    },
                })

    # 8. PERSONAL_CONTRIB_SELF_APPROVAL (v3) - real audit catch the v1 implementation
    # missed. The .msg filename pattern is
    #   "Personal Contribution Approval Requested for X (emp#) on YYYY-MM-DD by X"
    # When the requester (X before 'on') matches the approver (X after 'by'),
    # the employee approved their own personal contribution - missing manager
    # oversight. Per QC v2 MAT-2: 51 of 74 .msg files exhibit this pattern.
    for r in recon:
        if r['has_folder'] and r['self_approval']:
            v = r['total_incl_vat'] or 0
            base = r.get('folder_rel_path') or ''
            files_list = []
            # Surface the self-approval .msg FIRST so it's the default tab
            for p in (r.get('msgs') or []):
                if 'personal contribution' in p.lower():
                    files_list.append({'label': f'Self-approval: {_msg_label(p)}', 'rel_path': f"{base}/{p}", 'type': 'msg'})
            for p in (r.get('pdfs') or []):
                files_list.append({'label': p[:38], 'rel_path': f"{base}/{p}", 'type': 'pdf'})
            # Other approval emails
            for p in (r.get('msgs') or []):
                if 'personal contribution' not in p.lower():
                    files_list.append({'label': _msg_label(p), 'rel_path': f"{base}/{p}", 'type': 'msg'})
            catches.append({
                'category': 'PERSONAL_CONTRIB_SELF_APPROVAL',
                'severity': 'MEDIUM',
                'ticket_no': r['ticket_no'],
                'passenger': r['passenger_name'],
                'route':     r['route'],
                'value_at_risk_sar': 0.0,  # control issue, not direct $ at risk
                'detail': (
                    f"Ticket {r['ticket_no']} ({r['passenger_name']}, SAR {v:.2f}): "
                    "the personal-contribution approval was self-signed (same employee "
                    "as both requester and approver). Missing manager oversight on "
                    "personal portion of the trip."
                ),
                'evidence': {
                    'ticket_no':    r['ticket_no'],
                    'passenger':    r['passenger_name'],
                    'route':        r['route'],
                    'amount_sar':   v,
                    'folder_rel':   base,
                    'files':        files_list,
                    'note':         'The personal-contribution form was both REQUESTED and APPROVED by the same employee. Confirm whether a separate manager approval exists outside this folder.',
                },
            })

    # 9. BOOKED_AFTER_TRAVEL — service_date < issue_date for flight tickets
    flight_gls = ('Travel Tickets Expense', 'Travel Cost Expense G&A', 'Accrued Employee Annual Tickets')
    for r in recon:
        if r['gl_name'] in flight_gls and r['service_date'] and r['issue_date']:
            try:
                sd = datetime.strptime(r['service_date'], '%Y-%m-%d')
                isd = datetime.strptime(r['issue_date'], '%Y-%m-%d')
                if sd < isd:
                    catches.append({
                        'category': 'BOOKED_AFTER_TRAVEL',
                        'severity': 'MEDIUM',
                        'ticket_no': r['ticket_no'],
                        'service_date': r['service_date'],
                        'issue_date':   r['issue_date'],
                        'detail': f"Ticket {r['ticket_no']} ({r['gl_name']}) service date {r['service_date']} is BEFORE issue date {r['issue_date']} - booking was made after travel.",
                    })
            except Exception:
                pass

    return catches


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def build_summary(recon, catches, folders):
    # v3 (per QC v2 CRIT-1): distinct ticket count, not row count (some tickets
    # appear as multiple rows for cost-center splits, e.g. 26-689 x 3).
    n_rows = len(recon)
    n_tickets = len(set(r['ticket_no'] for r in recon))
    matched_tickets = set(r['ticket_no'] for r in recon if r['has_folder'])
    n_matched = len(matched_tickets)
    total_sar = round(sum((r['total_incl_vat'] or 0) for r in recon), 2)
    by_cat = Counter(c['category'] for c in catches)
    val_at_risk = round(sum(c.get('value_at_risk_sar', 0) or 0 for c in catches), 2)
    cost_totals = defaultdict(float)
    for r in recon:
        cost_totals[r['gl_name'] or 'Uncategorized'] += (r['total_incl_vat'] or 0)
    top_costs = sorted(cost_totals.items(), key=lambda x: -x[1])[:7]

    n_text_ref = sum(1 for r in recon if r['match_method'] == 'text_ref')
    n_ticket_id = sum(1 for r in recon if r['match_method'] == 'ticket_id')

    # v3: derive vendor/invoice/period from the canonical INVOICE sheet, not hardcoded
    cfg = _ensure_cfg()
    inv_no = cfg.invoice_xlsx.stem  # e.g. 'J26-640'
    # Discover service date range
    dates = sorted({r['service_date'] for r in recon if r['service_date']})
    period = f"{dates[0]} to {dates[-1]}" if dates else 'unknown period'

    return {
        'vendor':          'Jawal Travel - corporate travel agency',
        'invoice_no':      inv_no,
        'period':          period,
        'ticket_count':    n_tickets,
        'row_count':       n_rows,
        'matched_count':   n_matched,
        'folder_count':    len(folders),
        'match_method_breakdown': {
            'by_ticket_id':  n_ticket_id,
            'by_text_ref':   n_text_ref,
            'by_passenger':  sum(1 for r in recon if r['match_method'] == 'passenger_name'),
            'by_route':      sum(1 for r in recon if r['match_method'] == 'route_keyword'),
            'unmatched':     n_rows - sum(1 for r in recon if r['has_folder']),
        },
        'reconciliation_rate': round(100 * n_matched / n_tickets, 1) if n_tickets else 0,
        'total_value_sar': total_sar,
        'exception_count': len(catches),
        'value_at_risk_sar': val_at_risk,
        'exceptions_by_category': dict(by_cat),
        'top_cost_centers': [{'name': k, 'total_sar': round(v, 2)} for k, v in top_costs],
    }


def main():
    print("-> Loading J26-640 Details sheet ...")
    df = load_details()
    print(f"  {len(df)} ticket rows")

    print("-> Loading J26-640 INVOICE sheet for text refs ...")
    text_refs = load_invoice_text_refs()
    print(f"  {len(text_refs)} ticket rows have text refs")

    print("-> Scanning folder tree ...")
    folders = scan_folders()
    print(f"  {len(folders)} physical folders")

    print("-> Matching tickets to folders ...")
    recon = match_tickets_to_folders(df, text_refs, folders)
    by_method = Counter(r['match_method'] for r in recon)
    print(f"  matched: {by_method}")

    print("-> Catching exceptions ...")
    catches = catch_exceptions(recon, folders)
    cats = Counter(c['category'] for c in catches)
    print(f"  {len(catches)} catches: {dict(cats)}")

    summary = build_summary(recon, catches, folders)

    # Sanitize NaN → None so the JSON is valid (browsers reject bare NaN).
    def _scrub(o):
        import math
        if isinstance(o, dict):
            return {k: _scrub(v) for k, v in o.items()}
        if isinstance(o, list):
            return [_scrub(v) for v in o]
        if isinstance(o, float) and math.isnan(o):
            return None
        return o

    (MATCHED / 'jawal-reconciliation.json').write_text(
        json.dumps(_scrub(recon), indent=2, default=str), encoding='utf-8')
    (MATCHED / 'jawal-catch.json').write_text(
        json.dumps(_scrub(catches), indent=2, default=str), encoding='utf-8')
    (MATCHED / 'jawal-summary.json').write_text(
        json.dumps(_scrub(summary), indent=2, default=str), encoding='utf-8')

    print("\n=== JAWAL SUMMARY ===")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
