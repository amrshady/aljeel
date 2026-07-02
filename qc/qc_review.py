#!/usr/bin/env python3
"""
QC Review — independent fresh-context Opus pass on pipeline outputs.

Type B QC. Re-derives the catch rationale with a neutral prompt:
  - Loads catch.json + match.json + relevant evidence
  - Sends to Opus 4.7 with anti-bias prompt (tells WHERE to look, not WHAT to think)
  - Captures verdict + structural concerns + missed-catch suggestions
  - Writes ./qc/reports/<vendor>-<batch>-qc-<round>.md

Usage:
    python3 qc/qc_review.py --vendor jj --batch 3072041365
    python3 qc/qc_review.py --vendor asateel
    python3 qc/qc_review.py --vendor jawal --batch jawal-j788

Round number auto-increments based on existing reports.

Cost: ~$2-3 per review pass on a typical batch.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/home/clawdbot/.openclaw/workspace/aljeel')
MATCHED = ROOT / 'matched'
REPORTS = ROOT / 'qc' / 'reports'
KB = ROOT / 'aljeel' / 'knowledge' if (ROOT / 'aljeel' / 'knowledge').exists() else ROOT / 'knowledge' if (ROOT / 'knowledge').exists() else Path('/home/clawdbot/.openclaw/workspace/aljeel/knowledge')

REPORTS.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# Anti-bias prompt — tells reviewer where to look, not what to conclude
# ─────────────────────────────────────────────────────────────────────────────

REVIEW_PROMPT = """You are an independent QC reviewer of an AP reconciliation pipeline.

You have been given:
- The pipeline's CATCH output (catches the operator should review)
- The pipeline's MATCH or RECONCILIATION output (what the pipeline accepted)
- The pipeline's SUMMARY (top-line numbers)
- Optionally: the pipeline's KB describing how it's supposed to work

Your task: derive your own verdict by reading the OUTPUTS. Do NOT defer to the
pipeline's self-assessment. Do NOT assume the pipeline got it right.

Specifically:
1. Are the catches the pipeline raised STRUCTURALLY DEFENSIBLE? For each catch,
   does the category match the evidence? Could this be a false positive?
2. Is anything CONSPICUOUSLY MISSING from the catch list — patterns the pipeline
   should have caught but didn't? (Look at the match output for things that
   look anomalous but weren't flagged.)
3. Are the SUMMARY numbers internally consistent? (e.g. match_rate vs
   matched/total; total_value_sar vs sum of line totals if present)
4. Are SEVERITY assignments sensible? Anything flagged HIGH that's actually low
   risk, or vice versa?
5. Does the EXTRACTION look complete? (For J&J: completeness_sar_ratio in audit.
   For Jawal: are there suspicious gaps in ticket sequence or value distribution?
   For Asateel: does allocation_sum × 1.15 reconcile to header?)

Output as JSON with this exact shape:
{
  "verdict": "CONFIRMED" | "CONCERNS" | "REJECTED",
  "confidence": 0.0 to 1.0,
  "structural_defense": "1-2 paragraph summary of whether the pipeline's catches are defensible",
  "false_positive_candidates": [
    {"catch_id_or_ref": "...", "reason": "..."}
  ],
  "missed_catch_candidates": [
    {"pattern": "...", "evidence_from_output": "...", "suggested_category": "..."}
  ],
  "summary_consistency_issues": [
    {"issue": "...", "values_referenced": {...}}
  ],
  "severity_concerns": [
    {"catch_id_or_ref": "...", "current_severity": "...", "suggested_severity": "...", "reason": "..."}
  ],
  "extraction_completeness_assessment": "1-2 sentences",
  "next_round_recommendations": [
    "..."
  ]
}

Be specific. Cite actual values from the outputs. Confidence should reflect how
much you'd stake on your verdict — 0.9+ if you'd defend it under scrutiny, 0.6-
if you have material doubts.
"""

# ─────────────────────────────────────────────────────────────────────────────
# Loaders
# ─────────────────────────────────────────────────────────────────────────────

def load_jj(invoice: str) -> dict:
    match = json.loads((MATCHED / f'{invoice}.match.json').read_text())
    catch = json.loads((MATCHED / f'{invoice}.catch.json').read_text())
    return {'vendor': 'jj', 'batch': invoice, 'match': match, 'catch': catch}

def load_asateel() -> dict:
    summary = json.loads((MATCHED / 'asateel-summary.json').read_text())
    catch = json.loads((MATCHED / 'asateel-catch.json').read_text())
    allocation = json.loads((MATCHED / 'asateel-allocation.json').read_text())
    # Truncate allocation if huge (Opus context budget)
    if len(allocation) > 50:
        allocation_sample = allocation[:25] + [{'__truncated': f'{len(allocation)-50} more rows omitted'}] + allocation[-25:]
    else:
        allocation_sample = allocation
    return {'vendor': 'asateel', 'batch': 'current', 'summary': summary, 'catch': catch, 'allocation_sample': allocation_sample, 'allocation_total_rows': len(allocation)}

def load_jawal(batch: str) -> dict:
    base = MATCHED
    summary = json.loads((base / f'{batch}-summary.json').read_text())
    catch = json.loads((base / f'{batch}-catch.json').read_text())
    recon = json.loads((base / f'{batch}-reconciliation.json').read_text())
    # Truncate recon if huge
    if len(recon) > 50:
        recon_sample = recon[:25] + [{'__truncated': f'{len(recon)-50} more rows omitted'}] + recon[-25:]
    else:
        recon_sample = recon
    return {'vendor': 'jawal', 'batch': batch, 'summary': summary, 'catch': catch, 'reconciliation_sample': recon_sample, 'reconciliation_total_rows': len(recon)}

def load_kb_snippet(vendor: str) -> str:
    """Load relevant KB context for this vendor (catch-rules + vendor-handlers excerpts)."""
    kb_dir = Path('/home/clawdbot/.openclaw/workspace/aljeel/knowledge')
    if not kb_dir.exists():
        return ''
    out = []
    for fname in ['vendor-handlers.md', 'catch-rules.md']:
        fpath = kb_dir / fname
        if fpath.exists():
            content = fpath.read_text()
            out.append(f'### {fname}\n\n{content}\n')
    return '\n'.join(out)

# ─────────────────────────────────────────────────────────────────────────────
# Reviewer
# ─────────────────────────────────────────────────────────────────────────────


def _summarize_payload_for_review(payload: dict, max_chars: int = 80000) -> str:
    """Fix G v15.1: Read from correct nested paths in jawal payload.

    jawal payload structure (from load_jawal):
        {vendor, batch, summary: {invoice_no, exceptions_by_category, employee_match,
         routing_confidence, ...}, catch: [list of catch items with 'category'],
         reconciliation_sample: [50 rows], reconciliation_total_rows: N}

    v15 used wrong top-level key names (flag_breakdown, layer_breakdown, hard_failures etc.)
    that don't exist at the top level — they're inside payload['summary'].
    Also: per-flag sampling used reconciliation_sample (pre-truncated to 50) and looked
    for r.get("flags",[]) but recon rows don't have flags — catch items have 'category'.
    Fix G also loads the FULL reconciliation JSON for per-flag sampling (Bug 6b).
    """
    import json as _json
    from pathlib import Path as _Path

    # Nested summary sub-dict (jawal / asateel)
    inner_summary = payload.get("summary") or {}

    # Build structured view with correct nested paths
    summary = {
        "batch": payload.get("batch_id") or payload.get("batch") or inner_summary.get("invoice_no"),
        "pipeline_version": inner_summary.get("pipeline_version"),
        "totals": {
            "total_rows": (payload.get("total_rows") or payload.get("reconciliation_total_rows")
                          or inner_summary.get("row_count")),
            "matched_rows": inner_summary.get("matched_count"),
            "exception_count": inner_summary.get("exception_count"),
            "reconciliation_rate": inner_summary.get("reconciliation_rate"),
            "total_value_sar": inner_summary.get("total_value_sar"),
            "net_payable_sar": inner_summary.get("net_payable_sar"),
        },
        # Fix G: read flag breakdown from nested summary.exceptions_by_category
        "flag_breakdown": (payload.get("flag_breakdown")  # direct pass-through (non-jawal)
                          or inner_summary.get("exceptions_by_category")
                          or inner_summary.get("flag_breakdown")),
        # Fix G: read layer/method breakdown from nested summary.employee_match
        "layer_breakdown": (payload.get("layer_breakdown")
                           or inner_summary.get("employee_match")
                           or inner_summary.get("routing_confidence")
                           or inner_summary.get("layer_breakdown")),
        "top_gl_accounts": inner_summary.get("top_gl_accounts"),
        "top_divisions": inner_summary.get("top_divisions"),
        # Catch items with full category/severity/detail
        "catch_count": len(payload.get("catch", [])),
        "catch_summary": payload.get("catch", []),
        "row_samples_per_category": {},
    }

    # Fix G Bug 6b: For per-category sampling, load the FULL reconciliation
    # (not the pre-sampled 50 rows from load_jawal which truncates to 50).
    # Approach: try to load full recon JSON from MATCHED dir if batch is known.
    full_rows = []
    batch_id = payload.get("batch")
    if batch_id:
        recon_path = MATCHED / f"{batch_id}-reconciliation.json"
        if recon_path.exists():
            try:
                full_rows = _json.loads(recon_path.read_text())
                print(f"[qc_review] Fix G Bug 6b: loaded full recon ({len(full_rows)} rows) for sampling")
            except Exception as _e:
                print(f"[qc_review] Fix G Bug 6b: could not load full recon: {_e}")
    if not full_rows:
        # Fall back to whatever was passed in
        full_rows = (payload.get("rows") or
                     payload.get("reconciliation_sample") or
                     payload.get("allocation_sample") or [])

    # Sample up to 3 rows per catch category from FULL row set
    # Catch items have 'category'; reconciliation rows have 'ticket_no' for joining
    catch_by_cat: dict = {}
    for c in payload.get("catch", []):
        if not isinstance(c, dict):
            continue
        cat = str(c.get("category", "UNKNOWN"))
        catch_by_cat.setdefault(cat, []).append(c)
    for cat, citems in catch_by_cat.items():
        summary["row_samples_per_category"][cat] = citems[:3]

    # Also add reconciliation row samples for flags (rows that have explicit flags fields)
    by_flag: dict = {}
    for r in full_rows:
        if not isinstance(r, dict):
            continue
        for f in r.get("flags", []):
            by_flag.setdefault(str(f), []).append(r)
    if by_flag:
        summary["row_samples_per_flag"] = {flag: frows[:3] for flag, frows in by_flag.items()}

    # Include reconciliation_total_rows count
    if "reconciliation_total_rows" in payload:
        summary["reconciliation_total_rows"] = payload["reconciliation_total_rows"]

    s = _json.dumps(summary, indent=2, default=str)
    if len(s) > max_chars:
        print(f"[qc_review] WARNING: summary {len(s)} chars > {max_chars}; truncating")
        s = s[:max_chars] + '\n  ... [SUMMARIZER_TRUNCATED] ...'
    return s


def _summarize_kb(kb_snippet: str, max_chars: int = 30000) -> str:
    """Fix 6 v15: Summarize KB by section rather than raw slice."""
    if not kb_snippet or len(kb_snippet) <= max_chars:
        return kb_snippet or "(no KB available)"
    # Split by ### headers and include each section up to budget
    sections = kb_snippet.split("\n### ")
    out = []
    used = 0
    for sec in sections:
        chunk = "\n### " + sec if out else sec
        if used + len(chunk) > max_chars:
            # Truncate this section
            remaining = max_chars - used
            if remaining > 200:
                out.append(chunk[:remaining] + "\n... [section truncated]")
            break
        out.append(chunk)
        used += len(chunk)
    return "".join(out)

def call_reviewer(payload: dict, kb_snippet: str) -> dict:
    """Call Opus 4.7 via the LiteLLM proxy with the review prompt."""
    try:
        from anthropic import Anthropic
    except ImportError:
        print('error: anthropic SDK not installed', file=sys.stderr)
        sys.exit(2)

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print('error: ANTHROPIC_API_KEY not set (run: set -a; source ~/.openclaw/.env; set +a)', file=sys.stderr)
        sys.exit(2)

    base_url = os.environ.get('ANTHROPIC_BASE_URL', 'https://api.anthropic.com')
    client = Anthropic(api_key=api_key, base_url=base_url)

    _payload_summary = _summarize_payload_for_review(payload)
    _kb_summary = _summarize_kb(kb_snippet)
    user_msg = f"""# Pipeline Outputs to Review

```json
{_payload_summary}
```

# Pipeline KB (the rules the pipeline was supposed to follow)

{_kb_summary}

Now produce your verdict as JSON per the schema in the system prompt."""

    # Route: via LiteLLM proxy → Sonnet 4.6 (Opus not accessible on aljeel-ap key by design)
    # Override via QC_MODEL env var if a different model is provisioned
    model = os.environ.get('QC_MODEL', 'anthropic/claude-sonnet-4-6')
    response = client.messages.create(
        model=model,
        max_tokens=8000,
        system=REVIEW_PROMPT,
        messages=[{'role': 'user', 'content': user_msg}],
    )

    # Extract JSON from response
    text = ''
    for block in response.content:
        if hasattr(block, 'text'):
            text += block.text

    # Try to parse JSON — find first { and last }
    start = text.find('{')
    end = text.rfind('}')
    if start == -1 or end == -1:
        return {'__parse_error': 'no JSON braces found', 'raw': text[:5000]}
    try:
        verdict = json.loads(text[start:end+1])
        verdict['__model'] = response.model
        verdict['__usage'] = {
            'input_tokens': response.usage.input_tokens,
            'output_tokens': response.usage.output_tokens,
        }
        return verdict
    except json.JSONDecodeError as e:
        return {'__parse_error': str(e), 'raw': text[:5000]}

# ─────────────────────────────────────────────────────────────────────────────
# Report writer
# ─────────────────────────────────────────────────────────────────────────────

def next_round(vendor: str, batch: str) -> int:
    existing = list(REPORTS.glob(f'{vendor}-{batch}-qc-round*.md'))
    if not existing:
        return 1
    nums = []
    for p in existing:
        try:
            n = int(p.stem.split('round')[-1])
            nums.append(n)
        except ValueError:
            pass
    return max(nums) + 1 if nums else 1

def write_report(vendor: str, batch: str, round_no: int, verdict: dict) -> Path:
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    path = REPORTS / f'{vendor}-{batch}-qc-round{round_no}.md'

    md = f"""# QC Review — {vendor} / {batch} — Round {round_no}

**Generated:** {ts}
**Model:** {verdict.get('__model', 'unknown')}
**Tokens:** input={verdict.get('__usage', {}).get('input_tokens', '?')} output={verdict.get('__usage', {}).get('output_tokens', '?')}

---

## Verdict: {verdict.get('verdict', 'UNKNOWN')}
**Confidence:** {verdict.get('confidence', 'n/a')}

## Structural Defense

{verdict.get('structural_defense', '(not provided)')}

## False-Positive Candidates ({len(verdict.get('false_positive_candidates', []))})

"""
    for fp in verdict.get('false_positive_candidates', []):
        md += f"- **{fp.get('catch_id_or_ref', '?')}** — {fp.get('reason', '')}\n"

    md += f"\n## Missed-Catch Candidates ({len(verdict.get('missed_catch_candidates', []))})\n\n"
    for mc in verdict.get('missed_catch_candidates', []):
        md += f"- **{mc.get('pattern', '?')}** — {mc.get('evidence_from_output', '')} → suggested category: `{mc.get('suggested_category', '?')}`\n"

    md += f"\n## Summary Consistency Issues ({len(verdict.get('summary_consistency_issues', []))})\n\n"
    for si in verdict.get('summary_consistency_issues', []):
        md += f"- **{si.get('issue', '?')}** — {si.get('values_referenced', {})}\n"

    md += f"\n## Severity Concerns ({len(verdict.get('severity_concerns', []))})\n\n"
    for sc in verdict.get('severity_concerns', []):
        md += f"- **{sc.get('catch_id_or_ref', '?')}** — {sc.get('current_severity', '?')} → {sc.get('suggested_severity', '?')}: {sc.get('reason', '')}\n"

    md += f"\n## Extraction Completeness\n\n{verdict.get('extraction_completeness_assessment', '(not provided)')}\n"

    md += f"\n## Next-Round Recommendations\n\n"
    for rec in verdict.get('next_round_recommendations', []):
        md += f"- {rec}\n"

    if '__parse_error' in verdict:
        md += f"\n## ⚠ Parse Error\n\n{verdict['__parse_error']}\n\nRaw output:\n```\n{verdict.get('raw', '')[:3000]}\n```\n"

    path.write_text(md)
    return path

# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description='Independent fresh-context QC review of pipeline outputs.')
    ap.add_argument('--vendor', required=True, choices=['jj', 'asateel', 'jawal'])
    ap.add_argument('--batch', help='batch id (J&J: invoice number; Jawal: batch like jawal-j788; Asateel: ignored)')
    ap.add_argument('--dry-run', action='store_true', help='show payload without calling reviewer')
    args = ap.parse_args()

    # Load payload
    if args.vendor == 'jj':
        if not args.batch:
            ap.error('--batch required for jj (invoice number, e.g. 3072041365)')
        payload = load_jj(args.batch)
        batch_id = args.batch
    elif args.vendor == 'asateel':
        payload = load_asateel()
        batch_id = 'current'
    elif args.vendor == 'jawal':
        if not args.batch:
            # try to find one
            summaries = sorted(MATCHED.glob('jawal-*-summary.json'))
            summaries = [p for p in summaries if 'v1' not in p.name and 'v2' not in p.name and 'v3' not in p.name]
            if not summaries:
                ap.error('--batch required for jawal (no auto-detected batch found)')
            args.batch = summaries[0].stem.replace('-summary', '')
            print(f'auto-detected batch: {args.batch}', file=sys.stderr)
        payload = load_jawal(args.batch)
        batch_id = args.batch

    if args.dry_run:
        print(json.dumps(payload, indent=2, default=str)[:5000])
        print('--- end dry-run sample ---')
        sys.exit(0)

    kb = load_kb_snippet(args.vendor)
    print(f'[qc-review] vendor={args.vendor} batch={batch_id} kb_snippet={len(kb)} bytes')
    print(f'[qc-review] calling reviewer (Opus 4.7 via LiteLLM proxy) ...')

    verdict = call_reviewer(payload, kb)
    round_no = next_round(args.vendor, batch_id)
    path = write_report(args.vendor, batch_id, round_no, verdict)
    print(f'[qc-review] wrote {path}')
    print(f'[qc-review] verdict: {verdict.get("verdict", "?")} confidence={verdict.get("confidence", "?")}')

if __name__ == '__main__':
    main()
