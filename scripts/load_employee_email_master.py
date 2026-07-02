#!/usr/bin/env python3
"""Load the standalone Employee Email Master into an email->emp_no dict.

The Manpower sheet in master-data-003.xlsx has no Email column. This helper
reads the separately-supplied Employee_Email_Master_<date>.xlsx (columns:
Emp No, Name, Arabic Name, Email) and returns {email_lower: emp_no_int}.

Designed to be layered ON TOP of detect_manpower_email_column() in
process_batch.py:

    manpower_emails = detect_manpower_email_column(master_data_path)
    extra = load_employee_email_master(EMAIL_MASTER_PATH)
    manpower_emails.update(extra)  # extra wins on conflict (newer file)

Wired May 25, 2026 in response to AlJeel finance feedback that emp lookup
was failing on names. Email is now the deterministic key for ~640/679 staff.
"""
from __future__ import annotations
from pathlib import Path
import pandas as pd


def load_employee_email_master(xlsx_path) -> dict:
    """Read Employee_Email_Master*.xlsx -> {email_lowercased: emp_no_int}.

    Skips rows with missing email or emp_no, or where emp_no can't be cast to int.
    Returns empty dict on file-not-found or read error (silent — caller decides).
    """
    p = Path(xlsx_path)
    if not p.exists():
        return {}
    try:
        df = pd.read_excel(p)
    except Exception:
        return {}

    # Find columns case-insensitively
    cols = {str(c).strip().lower(): c for c in df.columns}
    emp_col = cols.get('emp no') or cols.get('emp_no') or cols.get('empno')
    email_col = cols.get('email') or cols.get('e-mail') or cols.get('mail')
    if not emp_col or not email_col:
        return {}

    mapping = {}
    for _, row in df.iterrows():
        eno_raw = row[emp_col]
        email_raw = row[email_col]
        if pd.isna(eno_raw) or pd.isna(email_raw):
            continue
        try:
            eno = int(float(str(eno_raw)))
        except (ValueError, TypeError):
            continue
        email = str(email_raw).strip().lower()
        if '@' not in email:
            continue
        mapping[email] = eno

    return mapping


if __name__ == '__main__':
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else \
        '/home/clawdbot/.openclaw/workspace/aljeel/qc/master-data/Employee_Email_Master_2026-05-25.xlsx'
    m = load_employee_email_master(path)
    print(f'Loaded {len(m)} email->emp_no mappings from {path}')
    for email, eno in list(m.items())[:5]:
        print(f'  {email} -> {eno}')
