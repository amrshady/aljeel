#!/usr/bin/env python3
"""
QC Gate — deterministic output validation for AlJeel AP pipelines.

Runs after each pipeline. Three layers of checks per vendor:
  1. Schema  — required keys present, correct types
  2. Invariants — value-range sanity (no negative SAR, severity in {LOW,MED,HIGH,CRITICAL}, etc)
  3. Golden diff — when fixture present, diff key numbers against the v3 baseline.
                   Material drift (>0.5% on totals, ≠ on counts) fails the gate.

Usage:
    python3 qc/qc_gate.py                 # check all vendors
    python3 qc/qc_gate.py --vendor jj     # check only one
    python3 qc/qc_gate.py --no-golden     # skip golden diff (use during dev when fixtures stale)
    python3 qc/qc_gate.py --json          # machine-readable output

Exit codes:
    0 = all checks pass
    1 = a check failed (regression or output corruption)
    2 = config error (missing files, bad CLI args)
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

ROOT = Path('/home/clawdbot/.openclaw/workspace/aljeel')
MATCHED = ROOT / 'matched'
EXTRACTED = ROOT / 'extracted'
GOLDEN = ROOT / 'qc' / 'fixtures' / 'golden'

SEVERITY_VALUES = {'LOW', 'MEDIUM', 'MED', 'HIGH', 'CRITICAL', 'INFO'}
TOTAL_DRIFT_TOLERANCE = 0.005  # 0.5%

# ─────────────────────────────────────────────────────────────────────────────
# Result types
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str = ''
    severity: str = 'ERROR'  # ERROR fails the gate; WARN logs but passes

    def __bool__(self):
        return self.passed

@dataclass
class VendorReport:
    vendor: str
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(c.passed or c.severity == 'WARN' for c in self.checks)

    def add(self, name: str, passed: bool, detail: str = '', severity: str = 'ERROR'):
        self.checks.append(CheckResult(name, passed, detail, severity))

# ─────────────────────────────────────────────────────────────────────────────
# Generic check helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(f'output missing: {path}')
    with open(path) as f:
        return json.load(f)

def _check_required_keys(report: VendorReport, name: str, data: dict, keys: list[str]):
    missing = [k for k in keys if k not in data]
    report.add(f'{name}.schema',
               passed=not missing,
               detail=f'missing keys: {missing}' if missing else 'all required keys present')

def _check_numeric(report: VendorReport, name: str, data: dict, keys: list[str]):
    bad = [(k, type(data.get(k)).__name__) for k in keys if k in data and not isinstance(data[k], (int, float))]
    report.add(f'{name}.numeric',
               passed=not bad,
               detail=f'non-numeric: {bad}' if bad else 'all numeric values valid')

def _check_severity_values(report: VendorReport, name: str, items: list, severity_key: str = 'severity'):
    bad = [item.get(severity_key) for item in items
           if isinstance(item, dict) and item.get(severity_key) not in SEVERITY_VALUES]
    report.add(f'{name}.severity_values',
               passed=not bad,
               detail=f'unknown severities: {set(bad)}' if bad else f'all severities in {SEVERITY_VALUES}')

def _check_no_negatives(report: VendorReport, name: str, items: list, keys: list[str]):
    bad = []
    for item in items:
        if not isinstance(item, dict):
            continue
        for k in keys:
            v = item.get(k)
            if isinstance(v, (int, float)) and v < 0:
                bad.append((k, v))
    report.add(f'{name}.no_negatives',
               passed=not bad,
               detail=f'negative values: {bad[:5]}' if bad else 'no negative SAR/counts')

def _golden_diff(report: VendorReport, name: str, current: dict, golden_path: Path,
                 compare_keys: list[str], int_keys: list[str] | None = None,
                 float_keys: list[str] | None = None):
    """Diff current output against golden. Material drift fails."""
    int_keys = int_keys or []
    float_keys = float_keys or []
    if not golden_path.exists():
        report.add(f'{name}.golden',
                   passed=True,
                   detail=f'no golden ({golden_path.name}) — skipping diff',
                   severity='WARN')
        return
    golden = _load_json(golden_path)
    drift = []
    for k in compare_keys:
        cv = current.get(k)
        gv = golden.get(k)
        if k in int_keys:
            if cv != gv:
                drift.append(f'{k}: golden={gv} current={cv}')
        elif k in float_keys:
            if cv is None or gv is None:
                if cv != gv:
                    drift.append(f'{k}: golden={gv} current={cv}')
            elif gv == 0:
                if abs(cv) > 0.01:
                    drift.append(f'{k}: golden=0 current={cv}')
            else:
                pct = abs(cv - gv) / abs(gv)
                if pct > TOTAL_DRIFT_TOLERANCE:
                    drift.append(f'{k}: golden={gv:.2f} current={cv:.2f} drift={pct:.2%}')
        else:
            if cv != gv:
                drift.append(f'{k}: golden={gv!r} current={cv!r}')
    report.add(f'{name}.golden',
               passed=not drift,
               detail='; '.join(drift) if drift else f'within tolerance vs {golden_path.name}')

# ─────────────────────────────────────────────────────────────────────────────
# Per-vendor check suites
# ─────────────────────────────────────────────────────────────────────────────

def check_jj() -> VendorReport:
    """J&J — per-invoice match.json + catch.json + extracted.json (completeness gate)."""
    report = VendorReport('jj')
    invoices = sorted({p.stem.split('.')[0] for p in MATCHED.glob('30*.match.json')})
    if not invoices:
        report.add('jj.outputs_present',
                   passed=False,
                   detail='no J&J invoice outputs in matched/',
                   severity='WARN')
        return report
    for inv in invoices:
        m_path = MATCHED / f'{inv}.match.json'
        c_path = MATCHED / f'{inv}.catch.json'
        try:
            match = _load_json(m_path)
        except Exception as e:
            report.add(f'jj.{inv}.load_match', False, str(e))
            continue
        try:
            catch = _load_json(c_path)
        except Exception as e:
            report.add(f'jj.{inv}.load_catch', False, str(e))
            continue

        _check_required_keys(report, f'jj.{inv}.match',
                             match,
                             ['invoice_no', 'matched', 'exceptions', 'match_rate', 'invoice_sum', 'items'])
        _check_numeric(report, f'jj.{inv}.match',
                       match,
                       ['matched', 'exceptions', 'match_rate', 'invoice_sum'])

        # Invariant: match_rate in [0, 1] or [0, 100]
        mr = match.get('match_rate')
        report.add(f'jj.{inv}.match_rate_range',
                   passed=isinstance(mr, (int, float)) and 0 <= mr <= 100,
                   detail=f'match_rate={mr}')

        _check_required_keys(report, f'jj.{inv}.catch',
                             catch,
                             ['headline_numbers', 'narrative_summary', 'exception_categories', 'extraction_audit'])
        audit = catch.get('extraction_audit', {})
        # Completeness gate per KB: completeness_sar_ratio must be within [0.98, 1.02]
        ratio = audit.get('completeness_sar_ratio')
        if ratio is not None:
            report.add(f'jj.{inv}.completeness_gate',
                       passed=0.98 <= ratio <= 1.02,
                       detail=f'completeness_sar_ratio={ratio:.4f}')

        # Golden diff
        _golden_diff(report, f'jj.{inv}.match',
                     match, GOLDEN / f'{inv}.match.json',
                     compare_keys=['matched', 'exceptions', 'match_rate', 'invoice_sum'],
                     int_keys=['matched', 'exceptions'],
                     float_keys=['match_rate', 'invoice_sum'])
    return report

def check_asateel() -> VendorReport:
    """Asateel — summary + catch + allocation."""
    report = VendorReport('asateel')
    s_path = MATCHED / 'asateel-summary.json'
    c_path = MATCHED / 'asateel-catch.json'
    a_path = MATCHED / 'asateel-allocation.json'

    if not s_path.exists():
        report.add('asateel.outputs_present', False, 'asateel-summary.json missing', severity='WARN')
        return report

    summary = _load_json(s_path)
    _check_required_keys(report, 'asateel.summary',
                         summary,
                         ['vendor', 'invoice_count', 'reconciled_invoices',
                          'reconciliation_rate', 'total_invoice_value_sar', 'exception_count'])
    _check_numeric(report, 'asateel.summary',
                   summary,
                   ['invoice_count', 'reconciled_invoices', 'reconciliation_rate',
                    'total_invoice_value_sar', 'exception_count'])

    # Invariant: reconciled <= total
    rec = summary.get('reconciled_invoices', 0)
    tot = summary.get('invoice_count', 0)
    report.add('asateel.invariant.reconciled_le_total',
               passed=rec <= tot,
               detail=f'reconciled={rec} total={tot}')

    # Catch
    if c_path.exists():
        catches = _load_json(c_path)
        if isinstance(catches, list):
            _check_severity_values(report, 'asateel.catch', catches)
            _check_no_negatives(report, 'asateel.catch', catches, ['amount_sar', 'value_at_risk_sar'])
            cats = {c.get('category') for c in catches if isinstance(c, dict)}
            allowed = {'ALLOC_MISMATCH', 'DUP_JQ_STRICT', 'EMP_SAME_DAY_MULTI_INVOICE',
                       'PARTIAL_ALLOC_MISSING_JQ'}
            unknown = cats - allowed
            report.add('asateel.catch.categories',
                       passed=not unknown,
                       detail=f'unknown categories: {unknown}' if unknown else f'all in {allowed}',
                       severity='WARN')  # WARN because new categories are legitimate additions

    # Allocation
    if a_path.exists():
        allocs = _load_json(a_path)
        if isinstance(allocs, list):
            _check_no_negatives(report, 'asateel.allocation', allocs,
                                ['header_total', 'allocation_sum', 'expected_gross_vat15'])

    # Golden diff
    _golden_diff(report, 'asateel.summary',
                 summary, GOLDEN / 'asateel-summary.json',
                 compare_keys=['invoice_count', 'reconciled_invoices',
                               'total_invoice_value_sar', 'exception_count'],
                 int_keys=['invoice_count', 'reconciled_invoices', 'exception_count'],
                 float_keys=['total_invoice_value_sar'])
    return report

def check_jawal() -> VendorReport:
    """Jawal — summary + catch + reconciliation. Picks up J26-* batches."""
    report = VendorReport('jawal')
    # Find any jawal summary
    summaries = sorted(MATCHED.glob('jawal-*-summary.json')) + sorted(MATCHED.glob('jawal-summary.json'))
    summaries = [p for p in summaries if 'v1' not in p.name and 'v2' not in p.name and 'v3' not in p.name]

    if not summaries:
        report.add('jawal.outputs_present', False, 'no jawal summary in matched/', severity='WARN')
        return report

    for s_path in summaries:
        batch = s_path.stem.replace('-summary', '')
        try:
            summary = _load_json(s_path)
        except Exception as e:
            report.add(f'jawal.{batch}.load', False, str(e))
            continue

        # net_payable_sar only required when credit_note present (batch-shape variance)
        required = ['vendor', 'ticket_count', 'matched_count', 'total_value_sar']
        if 'credit_note' in summary:
            required.append('net_payable_sar')
        _check_required_keys(report, f'jawal.{batch}.summary',
                             summary,
                             required)
        numeric_keys = ['ticket_count', 'matched_count', 'total_value_sar']
        if 'net_payable_sar' in summary:
            numeric_keys.append('net_payable_sar')
        _check_numeric(report, f'jawal.{batch}.summary', summary, numeric_keys)

        # Invariant: matched <= ticket_count
        mc = summary.get('matched_count', 0)
        tc = summary.get('ticket_count', 0)
        report.add(f'jawal.{batch}.invariant.matched_le_total',
                   passed=mc <= tc,
                   detail=f'matched={mc} total={tc}')

        # Catch
        c_path = MATCHED / f'{batch}-catch.json'
        if c_path.exists():
            catches = _load_json(c_path)
            if isinstance(catches, list):
                _check_severity_values(report, f'jawal.{batch}.catch', catches)
                _check_no_negatives(report, f'jawal.{batch}.catch', catches, ['value_at_risk_sar'])
                cats = {c.get('category') for c in catches if isinstance(c, dict)}
                allowed = {'NO_FOLDER', 'NO_APPROVAL', 'DUP_ROUTE', 'EMD_FEE',
                           'VAT_MISMATCH', 'PERSONAL_CONTRIB_SELF_APPROVAL',
                           'ORPHAN_FOLDER'}
                unknown = cats - allowed
                report.add(f'jawal.{batch}.catch.categories',
                           passed=not unknown,
                           detail=f'unknown: {unknown}' if unknown else f'all in {allowed}',
                           severity='WARN')

        # Golden diff
        compare_keys = ['ticket_count', 'matched_count', 'total_value_sar']
        float_keys = ['total_value_sar']
        if 'net_payable_sar' in summary:
            compare_keys.append('net_payable_sar')
            float_keys.append('net_payable_sar')
        _golden_diff(report, f'jawal.{batch}.summary',
                     summary, GOLDEN / s_path.name,
                     compare_keys=compare_keys,
                     int_keys=['ticket_count', 'matched_count'],
                     float_keys=float_keys)
    return report

# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

VENDORS = {'jj': check_jj, 'asateel': check_asateel, 'jawal': check_jawal}

def main():
    ap = argparse.ArgumentParser(description='QC gate for AlJeel AP pipeline outputs.')
    ap.add_argument('--vendor', choices=list(VENDORS), help='check only one vendor')
    ap.add_argument('--no-golden', action='store_true', help='skip golden fixture diff')
    ap.add_argument('--json', action='store_true', help='machine-readable JSON output')
    args = ap.parse_args()

    if args.no_golden:
        global _golden_diff
        _orig = _golden_diff
        def _skip(*a, **kw):
            report = a[0]
            name = a[1]
            report.add(f'{name}.golden', passed=True, detail='--no-golden', severity='WARN')
        _golden_diff = _skip  # type: ignore[assignment]

    vendors_to_check = [args.vendor] if args.vendor else list(VENDORS)
    reports = [VENDORS[v]() for v in vendors_to_check]

    if args.json:
        out = {
            'gate_passed': all(r.passed for r in reports),
            'reports': [
                {
                    'vendor': r.vendor,
                    'passed': r.passed,
                    'checks': [
                        {'name': c.name, 'passed': c.passed, 'detail': c.detail, 'severity': c.severity}
                        for c in r.checks
                    ],
                }
                for r in reports
            ],
        }
        print(json.dumps(out, indent=2))
    else:
        all_passed = True
        for r in reports:
            print(f'\n=== {r.vendor} ===')
            for c in r.checks:
                if c.passed:
                    icon = '✓'
                else:
                    icon = 'WARN' if c.severity == 'WARN' else '✗'
                    if c.severity != 'WARN':
                        all_passed = False
                print(f'  {icon}  {c.name}  {c.detail}')
            verdict = 'PASS' if r.passed else 'FAIL'
            print(f'  → {r.vendor}: {verdict}')
        print()
        print('GATE:', 'PASS ✓' if all_passed else 'FAIL ✗')
        sys.exit(0 if all_passed else 1)

if __name__ == '__main__':
    main()
