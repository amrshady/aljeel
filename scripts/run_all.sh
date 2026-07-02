#!/usr/bin/env bash
# Run all three vendor pipelines + build dashboard data.
# Usage: bash scripts/run_all.sh [--skip-deploy]
#
# Layout on aljeel-ap droplet (post-Section-3 lift-and-shift):
#   ~/.openclaw/workspace/aljeel/
#     pipelines/{jj,asateel,jawal}.py    — vendor pipelines
#     scripts/discover.py + build_*.py   — discovery + dashboard JSON builders
#     raw/<vendor>/<period>/              — drop new batches here
#     extracted/                          — Gemini extraction cache
#     matched/                            — pipeline outputs (canonical)
#     dashboard/public/data/              — dashboard JSON
#     dashboard/public/files/             — Oracle ingestion files

set -e

cd "$(dirname "$0")/.."

# Load env (GEMINI_API_KEY, ANTHROPIC_API_KEY, etc) — use `set -a` so vars propagate to python subprocesses
set -a
source ~/.openclaw/.env 2>/dev/null || true
set +a
export GEMINI_API_KEY="${GEMINI_API_KEY:-$GOOGLE_API_KEY}"

# Ensure pipelines can import `discover` from scripts/
export PYTHONPATH="$(pwd)/scripts:${PYTHONPATH:-}"

echo "[run_all] Discovering files..."
python3 scripts/discover.py

echo ""
echo "[run_all] Running J&J pipeline..."
python3 -u pipelines/jj.py

echo ""
echo "[run_all] Running Asateel pipeline..."
python3 pipelines/asateel.py

echo ""
echo "[run_all] Running Jawal pipeline..."
python3 pipelines/jawal.py

echo ""
echo "[run_all] Building dashboard data..."
python3 scripts/build_jj_data.py
python3 scripts/build_asateel_data.py
python3 scripts/build_jawal_data.py

echo ""
echo "[run_all] Building Oracle Fusion ingestion files..."
python3 scripts/build_oracle_files.py

echo ""
echo "[run_all] Running deterministic QC gate (Layer 1)..."
if ! python3 qc/qc_gate.py; then
    echo "[run_all] QC gate FAILED — stopping. Inspect diff above and decide regression vs intentional."
    exit 1
fi

if [[ "$1" == "--skip-qc-review" || "$2" == "--skip-qc-review" ]]; then
    echo "[run_all] Skipping QC review (Layer 2) per --skip-qc-review"
else
    echo ""
    echo "[run_all] Reminder: run Layer 2 independent review on each batch before deploying."
    echo "  python3 qc/qc_review.py --vendor jj --batch <invoice>"
    echo "  python3 qc/qc_review.py --vendor asateel"
    echo "  python3 qc/qc_review.py --vendor jawal --batch <batch-id>"
fi

if [[ "$1" == "--skip-deploy" || "$2" == "--skip-deploy" ]]; then
    echo "[run_all] Skipping deploy (--skip-deploy)"
    echo ""
    echo "[run_all] DONE (local outputs only)."
    echo "  Outputs:   ~/.openclaw/workspace/aljeel/matched/"
    echo "  Dashboard JSON:  ~/.openclaw/workspace/aljeel/dashboard/public/data/"
    exit 0
fi

echo ""
echo "[run_all] Deploying dashboard to Cloudflare Pages..."
# CF_API_TOKEN expected in env or ~/.openclaw/.env. Account ID is AnteThink (canonical for accordpartners.ai zone).
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:-}}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-5157425bbabb332495954e18b1415950}"
if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
    echo "[run_all] WARN: CLOUDFLARE_API_TOKEN not set \u2014 skipping deploy. Pass --skip-deploy to silence, or set token in ~/.openclaw/.env."
    exit 0
fi
cd dashboard
npx wrangler@latest pages deploy public \
    --project-name aljeel-ap-finance \
    --commit-dirty=true \
    --branch main

echo ""
echo "[run_all] DONE."
echo "  Outputs:   ~/.openclaw/workspace/aljeel/matched/"
echo "  Dashboard:  https://finance.aljeel.accordpartners.ai"
echo "  (Cloudflare Access OTP \u2014 allowlist: amr, malik, qmohammad, ljaradat, yalnatour)"
