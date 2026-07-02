#!/usr/bin/env python3
"""
score_against_truth.py — Truly-blind J26-640 scoring vs the Aljeel-prepared
truth file. Extension of qc/score_against_canonical.py with:
  - emp_no scoring (col 12 in truth Details, col 16 in pipeline output)
  - all-5-segments-exact (excluding location, company — the 5 Aljeel-defined
    segments: account, cc, div, solution, agency)
  - all-5 + emp_no (true full-row blind score)
  - sponsorship-only and travel-only sub-scores
  - off-by-1-field breakdown
  - per-mismatch context: truth emp + name + CC vs pipeline emp + name + CC

Usage:
  python3 score_against_truth.py <pipeline_xlsx> <truth_xlsx> [--out <md_path>] [--json <json_path>]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl


_TICKET_RE = re.compile(r"(?<![\d])(\d{10}|26-\d{3})(?![\d])")


def extract_ticket(*sources):
    for s in sources:
        if s is None:
            continue
        m = _TICKET_RE.search(str(s))
        if m:
            return m.group(1)
    return None


def _norm(v) -> str:
    """Normalize segment value: lstrip leading zeros (treat empty/None as '0')."""
    s = '' if v is None else str(v).strip()
    return s.lstrip('0') or '0'


def _norm_emp(v) -> str:
    """Normalize emp_no. Truth uses '-' for sponsorship (= no emp). Pipeline uses '' or a number."""
    if v is None:
        return ''
    s = str(v).strip()
    if s in ('-', 'nan', 'None', ''):
        return ''
    # Strip trailing '.0' from float-to-string
    try:
        return str(int(float(s)))
    except (ValueError, TypeError):
        return s


def _norm_emp_name(emp_str, name_str):
    """Compose 'EMP - NAME' for display."""
    e = _norm_emp(emp_str) or '—'
    n = (name_str or '').strip()[:35]
    return f"{e} ({n})" if n else e


# ──────────────────────────────────────────────────────────────────────────────
# Truth loader
# ──────────────────────────────────────────────────────────────────────────────

def load_truth(path: Path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb['Details'] if 'Details' in wb.sheetnames else wb[wb.sheetnames[0]]
    by_ticket = {}
    skipped = 0
    # Truth Details:
    #   col 1  Sl. #
    #   col 4  Ticket No.
    #   col 5  Passenger Name
    #   col 6  Route
    #   col 12 Emp No New
    #   col 13 Notes (sponsorship OPEX hint)
    #   col 15 Company
    #   col 16 location
    #   col 17 Account
    #   col 19 Cost Center
    #   col 21 DIV
    #   col 23 Solution
    #   col 25 Agency
    for r in range(2, ws.max_row + 1):
        sl = ws.cell(r, 1).value
        if sl is None:
            continue
        ticket = extract_ticket(ws.cell(r, 4).value, ws.cell(r, 5).value)
        if not ticket:
            skipped += 1
            continue
        # If ticket already seen (e.g. 26-689 x3), append (we track all in a list)
        rec = {
            'sl': str(sl).strip(),
            'pax': str(ws.cell(r, 5).value or '').strip(),
            'route': str(ws.cell(r, 6).value or '').strip(),
            'emp_no': _norm_emp(ws.cell(r, 12).value),
            'note': str(ws.cell(r, 13).value or '').strip(),
            'company':  _norm(ws.cell(r, 15).value),
            'location': _norm(ws.cell(r, 16).value),
            'account':  _norm(ws.cell(r, 17).value),
            'cc':       _norm(ws.cell(r, 19).value),
            'div':      _norm(ws.cell(r, 21).value),
            'solution': _norm(ws.cell(r, 23).value),
            'agency':   _norm(ws.cell(r, 25).value),
            'amount':   ws.cell(r, 11).value,
        }
        by_ticket.setdefault(ticket, []).append(rec)
    return by_ticket, skipped


# ──────────────────────────────────────────────────────────────────────────────
# Pipeline loader
# ──────────────────────────────────────────────────────────────────────────────

def load_pipeline(path: Path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    # Find header row (3 or 1 or 2)
    hdr_row = None
    for r in (3, 1, 2):
        try:
            hdr = [str(c.value or '').strip() for c in ws[r]]
            if 'Description' in hdr and 'Location' in hdr:
                hdr_row = r
                break
        except Exception:
            pass
    if hdr_row is None:
        raise ValueError(f"Could not find header row in pipeline output {path}")
    hdr = [str(c.value or '').strip() for c in ws[hdr_row]]
    col = lambda name: hdr.index(name) if name in hdr else None

    cols = {
        'desc':    col('Description'),
        'emp_no':  col('Employee No'),
        'company': col('Company'),
        'location':col('Location'),
        'account': col('Account'),
        'cc':      col('Cost Center'),
        'div':     col('DIV'),
        'solution':col('Solution'),
        'agency':  col('Agency'),
        'method':  col('Agent Method') if 'Agent Method' in hdr else col('Resolution Layer'),
        'flags':   col('QC Catches') if 'QC Catches' in hdr else None,
    }
    missing = [k for k, v in cols.items() if v is None and k not in ('method','flags')]
    if missing:
        raise ValueError(f"Pipeline missing columns: {missing}")

    by_ticket = {}
    for r_idx, row in enumerate(ws.iter_rows(min_row=hdr_row + 1, values_only=True), start=1):
        if all(v is None for v in row):
            continue
        desc = row[cols['desc']]
        ticket = extract_ticket(desc)
        if not ticket:
            continue
        rec = {
            'row_idx': r_idx,
            'desc': str(desc or '')[:50],
            'emp_no':   _norm_emp(row[cols['emp_no']]),
            'company':  _norm(row[cols['company']]),
            'location': _norm(row[cols['location']]),
            'account':  _norm(row[cols['account']]),
            'cc':       _norm(row[cols['cc']]),
            'div':      _norm(row[cols['div']]),
            'solution': _norm(row[cols['solution']]),
            'agency':   _norm(row[cols['agency']]),
            'method':   str(row[cols['method']] or '').strip() if cols['method'] is not None else '',
            'flags':    str(row[cols['flags']] or '').strip() if cols['flags'] is not None else '',
        }
        by_ticket.setdefault(ticket, []).append(rec)
    return by_ticket


# ──────────────────────────────────────────────────────────────────────────────
# Pairing strategy for tickets with multiple rows (e.g. 26-689 x3)
# ──────────────────────────────────────────────────────────────────────────────

def pair_rows(truth_list, pipeline_list):
    """Pair truth and pipeline rows for the same ticket.
       - If 1:1 -> straightforward.
       - If N:1 (truth has more rows than pipeline; e.g. truth 3x, pipeline 1x):
         pair each truth row with the single pipeline row.
       - If 1:N: pair the single truth row with each pipeline row.
       - If N:M (same N): index-aligned.
    """
    pairs = []
    if not pipeline_list:
        for t in truth_list:
            pairs.append((t, None))
        return pairs
    if not truth_list:
        for p in pipeline_list:
            pairs.append((None, p))
        return pairs
    n, m = len(truth_list), len(pipeline_list)
    if n == m:
        for i in range(n):
            pairs.append((truth_list[i], pipeline_list[i]))
    elif m == 1:
        for t in truth_list:
            pairs.append((t, pipeline_list[0]))
    elif n == 1:
        for p in pipeline_list:
            pairs.append((truth_list[0], p))
    else:
        # Greedy: best-effort, just index-align up to min, then add extras
        k = min(n, m)
        for i in range(k):
            pairs.append((truth_list[i], pipeline_list[i]))
        if n > m:
            for i in range(m, n):
                pairs.append((truth_list[i], None))
        else:
            for i in range(n, m):
                pairs.append((None, pipeline_list[i]))
    return pairs


# ──────────────────────────────────────────────────────────────────────────────
# Scoring
# ──────────────────────────────────────────────────────────────────────────────

# The 5 Aljeel-defined Distribution Combination segments
FIVE_SEGS = ['account', 'cc', 'div', 'solution', 'agency']
ALL_FIELDS = FIVE_SEGS + ['emp_no']  # 6 fields for full-row exact


def is_sponsorship(truth_rec):
    """Heuristic: sponsorship if emp_no is empty/'-' OR note mentions sponsor/OPEX or solution != 00000 General."""
    if not truth_rec.get('emp_no'):
        # No employee assigned in truth — typically sponsorship
        return True
    note = (truth_rec.get('note') or '').lower()
    if any(k in note for k in ('opex', 'sponsor', 'spons')):
        return True
    # Account 60307021 = Sponsoring Expenses
    if truth_rec.get('account') == '60307021':
        return True
    return False


def score(truth_by_ticket, pipe_by_ticket):
    """Build paired rows and compute all metrics."""
    paired_rows = []  # each: dict {ticket, truth, pipeline, kind}
    only_truth = []
    only_pipe = []
    for ticket, truth_list in truth_by_ticket.items():
        pipe_list = pipe_by_ticket.get(ticket, [])
        if not pipe_list:
            only_truth.append(ticket)
            for t in truth_list:
                paired_rows.append({'ticket': ticket, 'truth': t, 'pipeline': None})
            continue
        for tr, pr in pair_rows(truth_list, pipe_list):
            paired_rows.append({'ticket': ticket, 'truth': tr, 'pipeline': pr})
    for ticket, pipe_list in pipe_by_ticket.items():
        if ticket not in truth_by_ticket:
            only_pipe.append(ticket)
            for p in pipe_list:
                paired_rows.append({'ticket': ticket, 'truth': None, 'pipeline': p})

    # Per-field tallies (only on rows where BOTH truth and pipeline exist)
    per_field = {f: {'match': 0, 'mismatch': 0, 'mismatches': []} for f in ALL_FIELDS}
    full5 = 0      # all 5 segments exact
    full5_emp = 0  # all 5 segments + emp_no exact
    off_by_1 = Counter()  # which single field differs when exactly 1 is off (across the 6)
    paired_evaluated = 0

    sponsorship_per_field = {f: {'match': 0, 'mismatch': 0} for f in ALL_FIELDS}
    travel_per_field = {f: {'match': 0, 'mismatch': 0} for f in ALL_FIELDS}
    sponsorship_full5 = sponsorship_full5_emp = 0
    travel_full5 = travel_full5_emp = 0
    sponsorship_n = travel_n = 0

    for pr_row in paired_rows:
        t, p = pr_row['truth'], pr_row['pipeline']
        if t is None or p is None:
            continue
        paired_evaluated += 1

        sp = is_sponsorship(t)
        if sp:
            sponsorship_n += 1
        else:
            travel_n += 1

        diffs = []
        for f in ALL_FIELDS:
            tv, pv = t[f], p[f]
            if tv == pv:
                per_field[f]['match'] += 1
                if sp: sponsorship_per_field[f]['match'] += 1
                else:  travel_per_field[f]['match'] += 1
            else:
                per_field[f]['mismatch'] += 1
                per_field[f]['mismatches'].append({
                    'ticket': pr_row['ticket'],
                    'truth':    tv,
                    'pipeline': pv,
                    'pax':      t.get('pax', ''),
                    'route':    t.get('route', ''),
                    'truth_emp':    t.get('emp_no', ''),
                    'pipe_emp':     p.get('emp_no', ''),
                    'truth_cc':     t.get('cc', ''),
                    'pipe_cc':      p.get('cc', ''),
                    'note':         t.get('note', ''),
                    'method':       p.get('method', ''),
                })
                diffs.append(f)
                if sp: sponsorship_per_field[f]['mismatch'] += 1
                else:  travel_per_field[f]['mismatch'] += 1

        # all-5
        seg_diffs = [f for f in FIVE_SEGS if f in diffs]
        if not seg_diffs:
            full5 += 1
            if sp: sponsorship_full5 += 1
            else:  travel_full5 += 1
        # all-5 + emp
        if not diffs:
            full5_emp += 1
            if sp: sponsorship_full5_emp += 1
            else:  travel_full5_emp += 1

        if len(diffs) == 1:
            off_by_1[diffs[0]] += 1

    return {
        'paired_evaluated': paired_evaluated,
        'truth_rows': sum(len(v) for v in truth_by_ticket.values()),
        'pipe_rows':  sum(len(v) for v in pipe_by_ticket.values()),
        'only_truth_tickets': only_truth,
        'only_pipe_tickets':  only_pipe,
        'per_field': per_field,
        'full5':     full5,
        'full5_emp': full5_emp,
        'off_by_1':  dict(off_by_1),
        'sponsorship': {
            'n': sponsorship_n,
            'per_field': sponsorship_per_field,
            'full5': sponsorship_full5,
            'full5_emp': sponsorship_full5_emp,
        },
        'travel': {
            'n': travel_n,
            'per_field': travel_per_field,
            'full5': travel_full5,
            'full5_emp': travel_full5_emp,
        },
    }


# ──────────────────────────────────────────────────────────────────────────────
# Report
# ──────────────────────────────────────────────────────────────────────────────

def pct(x, n):
    return f"{(x/n*100):.1f}%" if n else "n/a"


def render_md(result, pipe_path, truth_path):
    n = result['paired_evaluated']
    lines = []
    lines.append(f"# J26-640 Truly-Blind Scoring vs Truth")
    lines.append(f"")
    lines.append(f"- Pipeline output: `{pipe_path}`")
    lines.append(f"- Truth (Aljeel): `{truth_path}`")
    lines.append(f"- Truth rows:     {result['truth_rows']}")
    lines.append(f"- Pipeline rows:  {result['pipe_rows']}")
    lines.append(f"- Paired evaluated: {n}")
    if result['only_truth_tickets']:
        ot = result['only_truth_tickets']
        lines.append(f"- ⚠️ In truth, not in pipeline ({len(ot)}): {ot[:10]}{'...' if len(ot)>10 else ''}")
    if result['only_pipe_tickets']:
        op = result['only_pipe_tickets']
        lines.append(f"- ⚠️ In pipeline, not in truth ({len(op)}): {op[:10]}{'...' if len(op)>10 else ''}")
    lines.append(f"")
    lines.append("## Headline (truly-blind v15.12 hybrid)")
    lines.append(f"")
    lines.append(f"- **All-5-segments exact:** {result['full5']}/{n} = **{pct(result['full5'], n)}**")
    lines.append(f"- **All-5 + emp_no exact (full-row):** {result['full5_emp']}/{n} = **{pct(result['full5_emp'], n)}**")
    lines.append(f"")
    lines.append("## Per-field match rate")
    lines.append("")
    lines.append("| Field | Match | Mismatch | Match % |")
    lines.append("|---|---:|---:|---:|")
    for f in ALL_FIELDS:
        m = result['per_field'][f]['match']
        mm = result['per_field'][f]['mismatch']
        lines.append(f"| `{f}` | {m} | {mm} | {pct(m, m+mm)} |")
    lines.append(f"")
    lines.append("## Sponsorship vs Travel break-out")
    lines.append("")
    sp = result['sponsorship']
    tv = result['travel']
    lines.append(f"### Sponsorship (n={sp['n']}, includes OPEX, vouchers, account=60307021, emp='-')")
    lines.append(f"- All-5 exact: {sp['full5']}/{sp['n']} = {pct(sp['full5'], sp['n'])}")
    lines.append(f"- All-5 + emp: {sp['full5_emp']}/{sp['n']} = {pct(sp['full5_emp'], sp['n'])}")
    lines.append("")
    lines.append("| Field | Match | Mismatch | Match % |")
    lines.append("|---|---:|---:|---:|")
    for f in ALL_FIELDS:
        m = sp['per_field'][f]['match']
        mm = sp['per_field'][f]['mismatch']
        lines.append(f"| `{f}` | {m} | {mm} | {pct(m, m+mm)} |")
    lines.append("")
    lines.append(f"### Travel (n={tv['n']}, regular employee tickets)")
    lines.append(f"- All-5 exact: {tv['full5']}/{tv['n']} = {pct(tv['full5'], tv['n'])}")
    lines.append(f"- All-5 + emp: {tv['full5_emp']}/{tv['n']} = {pct(tv['full5_emp'], tv['n'])}")
    lines.append("")
    lines.append("| Field | Match | Mismatch | Match % |")
    lines.append("|---|---:|---:|---:|")
    for f in ALL_FIELDS:
        m = tv['per_field'][f]['match']
        mm = tv['per_field'][f]['mismatch']
        lines.append(f"| `{f}` | {m} | {mm} | {pct(m, m+mm)} |")
    lines.append("")
    lines.append("## Off-by-1-field breakdown")
    lines.append("")
    lines.append("Rows where exactly one field (of the 6) differs from truth:")
    lines.append("")
    lines.append("| Single-field-off | Count |")
    lines.append("|---|---:|")
    for f in ALL_FIELDS:
        lines.append(f"| `{f}` | {result['off_by_1'].get(f, 0)} |")
    total_off1 = sum(result['off_by_1'].values())
    lines.append(f"| **Total off-by-1** | **{total_off1}** |")
    lines.append("")
    lines.append("## Emp_no mismatches in detail (truth vs pipeline)")
    lines.append("")
    emp_mm = result['per_field']['emp_no']['mismatches']
    lines.append(f"Total emp_no mismatches: **{len(emp_mm)}**")
    lines.append("")
    if emp_mm:
        lines.append("| Ticket | Pax | Route | Truth emp | Pipe emp | Truth CC | Pipe CC | Method | Note |")
        lines.append("|---|---|---|---|---|---|---|---|---|")
        for m in emp_mm[:50]:
            note = (m.get('note') or '').replace('|',' ')[:40]
            method = (m.get('method') or '').replace('|',' ')[:25]
            lines.append(f"| {m['ticket']} | {m['pax'][:25]} | {m['route'][:18]} | {m['truth_emp'] or '—'} | {m['pipe_emp'] or '—'} | {m['truth_cc']} | {m['pipe_cc']} | {method} | {note} |")
        if len(emp_mm) > 50:
            lines.append(f"")
            lines.append(f"... ({len(emp_mm) - 50} more)")
    lines.append("")
    lines.append("## Cost Center mismatches (top 25)")
    lines.append("")
    cc_mm = result['per_field']['cc']['mismatches']
    lines.append(f"Total CC mismatches: **{len(cc_mm)}**")
    if cc_mm:
        lines.append("")
        lines.append("| Ticket | Pax | Truth CC | Pipe CC | Truth emp | Pipe emp | Method |")
        lines.append("|---|---|---|---|---|---|---|")
        for m in cc_mm[:25]:
            method = (m.get('method') or '').replace('|',' ')[:25]
            lines.append(f"| {m['ticket']} | {m['pax'][:25]} | {m['truth_cc']} | {m['pipe_cc']} | {m['truth_emp'] or '—'} | {m['pipe_emp'] or '—'} | {method} |")
        if len(cc_mm) > 25:
            lines.append(f"")
            lines.append(f"... ({len(cc_mm) - 25} more)")
    lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pipeline_xlsx')
    ap.add_argument('truth_xlsx')
    ap.add_argument('--out', default=None, help='Write markdown report to this path')
    ap.add_argument('--json', dest='json_out', default=None, help='Write JSON result to this path')
    args = ap.parse_args()

    pipe_path = Path(args.pipeline_xlsx)
    truth_path = Path(args.truth_xlsx)
    truth, t_skipped = load_truth(truth_path)
    pipe = load_pipeline(pipe_path)
    if t_skipped > 0:
        print(f'WARN: skipped {t_skipped} truth rows with no extractable ticket', file=sys.stderr)

    result = score(truth, pipe)

    md = render_md(result, pipe_path, truth_path)
    if args.out:
        Path(args.out).write_text(md)
        print(f'wrote {args.out}')
    else:
        print(md)
    if args.json_out:
        # JSON-friendly: drop the mismatches lists or include them
        Path(args.json_out).write_text(json.dumps(result, indent=2, default=str))
        print(f'wrote {args.json_out}')


if __name__ == '__main__':
    main()
