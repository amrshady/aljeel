#!/usr/bin/env python3
"""
Build the static JSON files the dashboard front-end will consume.

Outputs to ~/.openclaw/workspace/aljeel/dashboard/public/data/
"""
import json
from pathlib import Path
from datetime import datetime, timezone

ROOT     = Path('/home/clawdbot/.openclaw/workspace/aljeel')
MATCHED  = ROOT / 'matched'
EXTRACT  = ROOT / 'extracted'
DASH     = ROOT / 'dashboard' / 'public'
DATA     = DASH / 'data'
DATA.mkdir(parents=True, exist_ok=True)

# ---- Top-level summary across all 3 deliverables ----
generated_at = datetime.now(timezone.utc).isoformat()

# J&J results (only deliverable with data so far)
jj_summary = json.loads((MATCHED / 'jj-summary.json').read_text())

# Pull headline numbers from catch reports
deliverables = []

# J&J card
jj_invoices = []
total_sar = 0
total_exc = 0
total_lines = 0
for inv in jj_summary:
    catch = json.loads(Path(inv['catch']).read_text())
    head  = catch['headline_numbers']
    jj_invoices.append({
        'invoice_no':         head['invoice_no'],
        'total_sar':          head['invoice_total_sar'],
        'total_lines':        head['total_lines'],
        'matched_lines':      head['matched_lines'],
        'exception_lines':    head['exception_lines'],
        'match_rate_pct':     head['match_rate_pct'],
        'narrative':          catch.get('narrative_summary',''),
    })
    total_sar  += head['invoice_total_sar']
    total_exc  += head['exception_lines']
    total_lines += head['total_lines']

deliverables.append({
    'id':            'jj',
    'label':         'J&J / DePuy 3-Way Match',
    'subtitle':      'Multi-PO commercial invoices — invoice ↔ PO ↔ GR/ASN',
    'invoice_count': len(jj_invoices),
    'total_sar':     total_sar,
    'total_lines':   total_lines,
    'total_exceptions': total_exc,
    'status':        'ready',
    'invoices':      jj_invoices,
    'value_proposition': 'Reconciles vendor commercial invoices against Aljeel\'s Oracle Fusion POs and delivery-note GR data. Catches duplicate posts, qty breaks, price breaks, and unmatched lines before they post.',
})

deliverables.append({
    'id':       'asateel',
    'label':    'Asateel Scanned Vendor Invoices',
    'subtitle': '117 multi-page scanned PDF invoices — vision OCR + duplicate detection',
    'invoice_count': 117,
    'total_sar':     None,
    'total_lines':   None,
    'total_exceptions': None,
    'status':   'pending',
    'invoices': [],
    'value_proposition': 'Vision OCR on scanned vendor documents (≈40 pages each), with line extraction, header validation, and duplicate detection across the supplier history.',
})

deliverables.append({
    'id':       'jawal',
    'label':    'Jawal Travel Claims',
    'subtitle': '90 travel approval PDFs + 78 supporting emails — multi-line allocation',
    'invoice_count': 168,
    'total_sar':     None,
    'total_lines':   None,
    'total_exceptions': None,
    'status':   'pending',
    'invoices': [],
    'value_proposition': 'Multi-line travel-claim parsing across employee approval forms and email threads, with cost-center allocation drafts and GL coding suggestions.',
})

summary_out = {
    'generated_at': generated_at,
    'client': {
        'name':     'Aljeel Medical Company',
        'cfo':      'Yasser',
        'contact':  'Qasim Mohammad — Senior Finance Manager',
        'erp':      'Oracle Fusion',
        'currency': 'SAR (with USD / EUR / JPY exposure)',
    },
    'agent_engineer': 'Accord Partners — AI Finance Team',
    'pipeline_version': '0.1.0',
    'model_stack': {
        'extraction':       'Gemini 2.5 Flash (vision OCR + structured JSON)',
        'match_engine':     'Deterministic Python (3-way: Invoice ↔ PO ↔ GR/ASN)',
        'catch_report':     'Claude Sonnet 4.5 (exception classification + narrative)',
    },
    'deliverables': deliverables,
}

(DATA / 'summary.json').write_text(json.dumps(summary_out, indent=2, ensure_ascii=False, default=str))
print(f'wrote {DATA/"summary.json"}')

# Per-invoice detail files (J&J only for now)
for inv in jj_summary:
    inv_no = inv['invoice_no']
    extract_data = json.loads((EXTRACT / f'{inv_no}.extracted.json').read_text())
    match_data   = json.loads(Path(inv['match']).read_text())
    catch_data   = json.loads(Path(inv['catch']).read_text())
    detail = {
        'invoice_no':    inv_no,
        'header':        extract_data.get('header',{}),
        'summary':       {
            'items_aggregated': match_data['items_aggregated'],
            'raw_line_count':   match_data['raw_line_count'],
            'matched':          match_data['matched'],
            'exceptions':       match_data['exceptions'],
            'match_rate':       match_data['match_rate'],
            'invoice_sum':      match_data['invoice_sum'],
        },
        'catch':         catch_data,
        'items':         match_data['items'],
        'raw_lines':     match_data.get('raw_lines',[])[:500],  # cap to keep payload manageable
    }
    out_path = DATA / f'jj-{inv_no}.json'
    out_path.write_text(json.dumps(detail, indent=2, default=str, ensure_ascii=False))
    print(f'wrote {out_path}')

print('done')
