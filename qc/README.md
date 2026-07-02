# QC — quality gate + independent review

Two layers of quality control. Run both on every batch before showing output to AlJeel.

## Layer 1 — Deterministic Gate (`qc_gate.py`)

Validates schema + invariants + golden-fixture diff. Fast (sub-second), Python-only, no API calls.

```bash
python3 qc/qc_gate.py                    # check all vendors
python3 qc/qc_gate.py --vendor jj        # check one vendor
python3 qc/qc_gate.py --no-golden        # skip diff (during dev when fixtures stale)
python3 qc/qc_gate.py --json             # machine-readable
```

**Exit codes:**
- `0` — all checks pass
- `1` — a check failed (regression or output corruption)
- `2` — config error

**What it catches:**
- Missing required keys in output JSON (schema drift)
- Non-numeric values where numbers expected
- Severity values outside `{LOW, MEDIUM, MED, HIGH, CRITICAL, INFO}`
- Negative SAR / count values
- Invariant violations (e.g. `matched > total`, `completeness_sar_ratio` out of `[0.98, 1.02]`)
- Material drift vs golden fixtures (>0.5% on floats, ≠ on ints)

**WARN vs ERROR:**
- ERROR = fails the gate (exit 1)
- WARN = logs but passes (e.g. "no outputs yet", new catch categories that aren't pre-registered)

## Layer 2 — Independent Review (`qc_review.py`)

Fresh-context Sonnet 4.6 (or Opus when key access provisioned) re-derives the catch rationale with an anti-bias prompt. Catches what self-review can't.

```bash
# J&J: per-invoice
python3 qc/qc_review.py --vendor jj --batch 3072041365

# Asateel: one current batch at a time
python3 qc/qc_review.py --vendor asateel

# Jawal: per-batch
python3 qc/qc_review.py --vendor jawal --batch jawal-j788

# Dry run (preview payload without API call)
python3 qc/qc_review.py --vendor asateel --dry-run

# Override model
QC_MODEL='anthropic/claude-opus-4-7' python3 qc/qc_review.py --vendor asateel
```

**Output:** `qc/reports/<vendor>-<batch>-qc-round<N>.md`

Round numbers auto-increment. Run multiple rounds per batch — round 1 establishes the baseline, round 2+ verify fixes for issues round 1 surfaced.

**Cost:** ~$0.06 per batch on Sonnet 4.6 (20-25K tokens typical). Opus is ~5x.

**What it produces:**
- Verdict: `CONFIRMED` / `CONCERNS` / `REJECTED`
- Confidence: 0.0-1.0
- False-positive candidates with specific reasoning
- Missed-catch candidates the pipeline didn't flag
- Summary consistency issues
- Severity assignment concerns
- Extraction completeness assessment
- Next-round recommendations

## Golden Fixtures (`fixtures/golden/`)

Canonical v3 outputs from the demo-ready batches (April 2026 — J26-788, Asateel April, J&J 3072041365/1444). Used by the deterministic gate to detect drift.

**When to update:** ONLY when an intentional schema or value change has been made AND the change is verified correct by independent review. Update via:

```bash
cp matched/<file>.json qc/fixtures/golden/<file>.json
# then commit + document why in a comment in the golden fixture or in known-issues.md
```

**When NOT to update:** if the gate fails after a pipeline change, the default assumption is REGRESSION, not "golden is stale." Update goldens only after Layer 2 (independent review) confirms the new behavior is correct.

## Workflow

Standard batch run:

```bash
bash scripts/run_all.sh --skip-deploy   # run all 3 pipelines + build dashboard JSON
python3 qc/qc_gate.py                    # Layer 1 — deterministic
python3 qc/qc_review.py --vendor asateel # Layer 2 — Asateel review
python3 qc/qc_review.py --vendor jj --batch <invoice>
python3 qc/qc_review.py --vendor jawal --batch <batch-id>
# only deploy dashboard if both layers pass
```

If Layer 1 fails: stop. Read the diff. Decide if it's a regression or an intentional change.
If Layer 2 reports CONCERNS or REJECTED: stop. Read the report. Fix the issues. Re-run both layers.
Only deploy when both pass.

## Files

- `qc_gate.py` — Layer 1 deterministic validation
- `qc_review.py` — Layer 2 independent review
- `fixtures/golden/` — canonical v3 outputs (10 JSON files)
- `reports/` — accumulated review reports per batch (markdown)
