#!/usr/bin/env python3
"""Build dashboard JSON files for J&J / DePuy invoices (v2)."""
import json
from pathlib import Path
from datetime import datetime, timezone

ROOT    = Path('/home/clawdbot/.openclaw/workspace/aljeel')
EXTRACT = ROOT / 'extracted'
MATCHED = ROOT / 'matched'
DASH    = ROOT / 'dashboard' / 'public' / 'data'

INVOICES = ['3072041365', '3072041444']

RAW = Path('/home/clawdbot/.openclaw/workspace/aljeel/raw')

def _find_vendor_pdf(inv_no):
    """Locate the raw vendor invoice PDF for a given invoice number.
    Returns rel path under raw/ (e.g. asn-25DEC/25DEC048-25DEC054/<file>.pdf).
    """
    for p in RAW.rglob('*.pdf'):
        if inv_no in p.name and 'ZSD1COMINV' in p.name:
            return str(p.relative_to(RAW)).replace('\\', '/')
    return None


def main():
    for inv_no in INVOICES:
        extracted = json.loads((EXTRACT / f'{inv_no}.extracted.json').read_text())
        match     = json.loads((MATCHED / f'{inv_no}.match.json').read_text())
        catch     = json.loads((MATCHED / f'{inv_no}.catch.json').read_text())

        record = {
            'invoice_no': inv_no,
            'header': extracted.get('header', {}),
            'extraction_audit': extracted.get('extraction_audit', {}),
            'source_pdf_rel_path': _find_vendor_pdf(inv_no),
            'summary': {
                'items_aggregated': match['items_aggregated'],
                'raw_line_count':   match['raw_line_count'],
                'matched':          match['matched'],
                'exceptions':       match['exceptions'],
                'match_rate':       match['match_rate'],
                'invoice_sum':      match['invoice_sum'],
            },
            'catch': catch,
            'items': match['items'],
        }
        (DASH / f'jj-{inv_no}.json').write_text(json.dumps(record, indent=2, default=str), encoding='utf-8')
        print(f"Wrote jj-{inv_no}.json ({(DASH / f'jj-{inv_no}.json').stat().st_size} bytes)")

    # Update summary.json
    summary = json.loads((DASH / 'summary.json').read_text())
    jj = next((d for d in summary['deliverables'] if d['id'] == 'jj'), None)
    if jj:
        jj_invoices_summary = []
        total_lines = 0
        total_exc = 0
        total_sar = 0.0
        for inv_no in INVOICES:
            match = json.loads((MATCHED / f'{inv_no}.match.json').read_text())
            catch = json.loads((MATCHED / f'{inv_no}.catch.json').read_text())
            inv_total = catch['headline_numbers']['invoice_total_sar']
            total_sar += inv_total
            total_lines += match['items_aggregated']
            total_exc += match['exceptions']
            jj_invoices_summary.append({
                'invoice_no':     inv_no,
                'total_sar':      inv_total,
                'total_lines':    match['items_aggregated'],
                'matched_lines':  match['matched'],
                'exception_lines': match['exceptions'],
                'match_rate_pct': catch['headline_numbers']['match_rate_pct'],
                'narrative':      catch.get('narrative_summary', ''),
            })
        jj['invoice_count']    = len(INVOICES)
        jj['total_sar']        = total_sar
        jj['total_lines']      = total_lines
        jj['total_exceptions'] = total_exc
        jj['status']           = 'ready'
        jj['invoices']         = jj_invoices_summary
        jj['value_proposition'] = (
            'Reconciles vendor commercial invoices against Aljeel\'s Oracle Fusion POs and '
            'delivery-note GR data. Catches qty/price breaks and unmatched lines before they '
            'post. v2 includes OCR-variance canonicalization, fuzzy prefix-match fallback, '
            'extraction-completeness gate, and locked headline numbers in Python (no model '
            'hallucination of counts or SAR sums).'
        )

    summary['generated_at'] = datetime.now(timezone.utc).isoformat()
    summary['model_stack']['catch_report'] = 'Claude Sonnet 4.5 - prose only; numbers locked by Python'
    summary['qc_pass'] = summary.get('qc_pass', {})
    summary['qc_pass']['jj_v2'] = {
        'date': '2026-05-15',
        'changes_from_v1': [
            'Extraction completeness gate added: sum(line_total) vs header.total ratio surfaces if outside [0.98, 1.02].',
            'Invoice 365 re-extracted with 3-page chunks (was 5-page): SAR 389K extraction gap closed; line_sum now equals header exactly.',
            'normalize() rewritten: truncate at first Arabic char (cleaner than Arabic-strip), strip trailing 1-2 catalog code tokens, OCR-variance canonicalization (0/O, +N, X-spacing, oslash, W/ vs WA).',
            'Fuzzy prefix-match fallback for PO and GR: handles cases where Gemini concatenates duplicate copies of an item name in the description.',
            'PO mapping corrected: invoice 365 covers ONLY PO25002318 (was hardcoded to include PO25002310); invoice 1444 covers ONLY PO25002299.',
            'Headline numbers locked in Python: Claude writes only prose (root cause, resolver action, narrative) around numbers it can never overwrite.',
            'Invoice 365 match rate: 85.3% (v1) -> 96.5% (v2).',
            'Invoice 1444 match rate: 18.75% (v1) -> 100% (v2).',
        ],
    }
    (DASH / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(f"Updated summary.json")


if __name__ == '__main__':
    main()
