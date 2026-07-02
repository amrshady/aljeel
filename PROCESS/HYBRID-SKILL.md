# Jawal Hybrid Pipeline (v15.12) - Batch Run Skill

## When to use this skill
- Laith hands over a new Jawal monthly invoice (`J26-NNN.xlsx`) + the matching `raw/` folder of `.msg` approval emails.
- You need to produce an Oracle Fusion-ready GL-distribution spreadsheet AND get the highest possible match rate.
- The deterministic cascade alone (v15.11.2) gets ~62% all-5-exact on blind data because it can't reason about sponsorship/training context the way an LLM can.
- The hybrid pipeline (v15.12) gets ~73% all-5-exact on blind data by running the cascade first, then routing only uncertain rows to a Gemini agent that reads the full email evidence.

## What "all-5-exact" means
A row counts as all-5-exact if **all** of (account, cost_center, div, solution, agency) match the truth file character-for-character (after leading-zero normalization). Emp_no is scored separately because the truth file leaves it blank for routine business travel.

## How to run

### Normal batch (directory id = invoice id)
```bash
ssh root@<aljeel-ap-droplet-ip>
cd /home/clawdbot/.openclaw/workspace/aljeel
bash PROCESS/run_jawal_batch_hybrid.sh J26-640
```

### Blind-test batch (directory id != invoice id)
```bash
bash PROCESS/run_jawal_batch_hybrid.sh J26-593-BLIND J26-593
```
First arg = directory under `batches/jawal-<X>/`. Second arg = invoice id used in the filenames inside.

## What it does
1. **Stage A - Cascade:** If `Spreadsheet-<INVOICE>-FILLED-v15.11*.xlsx` doesn't exist, runs `PROCESS/run_jawal_batch.sh` to build it. Otherwise reuses it.
2. **Stage B - Hybrid LLM agent:** Runs `scripts/run_hybrid_v15_12.py`. For each row in the cascade output:
   - **Stays cascade** by default
   - **Routes to LLM (Gemini 3 Pro -> 2.5 Pro -> 2.5 Flash cascade)** when:
     - The ticket folder contains an `OPEX-*.pdf` AND cascade didn't already produce a clean sponsorship row (account=60307021 + real CC + real agency)
     - Cascade said `account=60301003` (travel) but description/notes contain sponsorship signals (HF-NN, OPEX-XX, CRM-NN, EP-NN, J-2026-NN, ISHLT, AATS, IEPC, "sponsoring", etc.)
     - Cascade resolved to `cost_center=000000/999999/blank` (unresolved)
     - Cascade has `Trip Purpose=UNKNOWN` AND there's a sponsorship text signal in desc/notes
     - Cascade's `Agent Flags` contains `EMPLOYEE_NOT_IN_MASTER`
   - **Applies overlay rules** (cascade wins where deterministic logic is stronger):
     - Overlay 1 (DIV=888 G&A travel): cascade's account (60301004) beats LLM's 60301003 guess
     - Overlay 2/3 (Solution from route on travel rows): cascade's deterministic solution code wins
     - Overlay 4/5 (Sponsorship agency/solution): cascade's deterministic OPEX-prefix-derived codes win
     - Overlay 6 (per-field cascade fallback): if LLM blanked CC/DIV/agency/solution but cascade had real values, keep cascade per-field
   - **Family-cluster emp_no unification:** for clusters with 2+ same-surname/route/month members, harmonize emp_no on the cascade's majority value

## Outputs (under `batches/jawal-<BATCH>/output/`)
| File | Purpose |
|------|---------|
| `Spreadsheet-<INVOICE>-FILLED-v15.12.xlsx` | The hybrid output. Same column structure as v15.11.2 + an `Agent Method` column. Send this to Laith. |
| `summary-v15.12.json` | Run stats: rows, routing reasons, method counts, LLM tokens/cost, runtime |
| `qc/reports/run-<BATCH>-<TS>-hybrid.log` | Full execution log |

The `Agent Method` column will be one of:
- `cascade` - cascade kept this row, LLM not consulted
- `llm_agent` - LLM picked the answer
- `hybrid_overlay` - LLM ran, but one or more overlay rules applied cascade values
- `cluster_unified` - emp_no was harmonized from a family cluster
- `cascade_fallback` - LLM erred; cascade values used

## Performance characteristics (verified May 25, 2026)

| Batch | Baseline (cascade alone) | Hybrid v15.12 |
|-------|--------------------------|---------------|
| **J26-640** (golden fixture) | 100.0% all-5 | 100.0% all-5 (no regression) |
| **J26-593** (blind test) | 62.5% all-5 (0/37 sponsorships) | 73.1% all-5 (17/37 sponsorships) |
| **Pure-LLM (Gemini 2.5 Pro) on J26-593** | - | 67.5% (22/37 sponsorships) |

Cost & runtime per batch:
- **J26-640:** ~$0.04 LLM cost, ~90 sec hybrid stage (3 LLM calls)
- **J26-593:** ~$0.40 LLM cost, ~150 sec hybrid stage (29 LLM calls cold; ~3 sec when cached)

## Cost ceiling
The script kills the run if the LLM cost exceeds **$3 USD per batch** (Gemini 3 Pro pricing tier). This is a hard cap.

## LLM cascade order (canonical AP pipeline cascade)
`["gemini-pro-latest", "gemini-2.5-pro", "gemini-2.5-flash"]`

`gemini-pro-latest` resolves to Gemini 3 Pro when live (or to the next-best available; 2.5 Pro is the documented fallback). Flash is the third-tier fallback. Set in `scripts/full_evidence_agent.py:GEMINI_MODEL_CASCADE`.

This mirrors the cascade in `email_allocation_extractor.py`, `location_resolver.py`, and `allocation_resolver.py` — same as the rest of the AP pipeline.

## Cache
LLM responses cached at `extracted/full-evidence-agent-cache/`. Cache key includes `(batch_id, row_idx, ticket_no)`, so:
- Re-running the same batch is essentially free (just reads cache).
- Different batches get fresh LLM calls (no cross-batch collisions).
- To force re-LLM on a batch, delete the matching `hybrid-<BATCH>-*.json` files in the cache dir.

## Troubleshooting
- **"cascade output missing":** Cascade hasn't been run yet. The wrapper will trigger it automatically. If it still fails, run `bash PROCESS/run_jawal_batch.sh <INVOICE_ID>` manually first.
- **"GEMINI_API_KEY not in env":** Add `GEMINI_API_KEY=...` to `/home/clawdbot/.openclaw/.env`.
- **Hybrid LLM errors (HTTP 429 / 5xx):** The Gemini cascade auto-retries with exponential backoff. If still failing, the cascade fallback (2.5 Pro -> 2.5 Flash) kicks in. Rows with persistent LLM errors fall back to `cascade_fallback` method.
- **Cost ceiling exceeded:** $3 hard cap. Check `summary-v15.12.json` for token counts and routing reason breakdown. If your batch genuinely needs more (unusual), pass `--cost-ceiling 5` to the Python script directly.

## When NOT to use this
- One-off rows or partial batches - use the cascade alone (`run_jawal_batch.sh`)
- Re-processing a batch where Laith has already corrected the output by hand - that's the truth file now, don't re-LLM
- Any batch where `Spreadsheet-<INVOICE>-FILLED-v15.11*.xlsx` is suspected wrong - fix the cascade first (in `process_batch.py`), don't paper over with LLM

## Locked baseline
- `scripts/full_evidence_agent.py` - v15.12 cascade order (3 Pro -> 2.5 Pro -> Flash)
- `scripts/run_hybrid_v15_12.py` - hybrid wrapper
- `PROCESS/run_jawal_batch_hybrid.sh` - orchestrator

Backups of all touched files saved with `.bak-pre-cascade-update-*` and `.bak-pre-v15.12-*` suffixes.

## Anchor lessons (May 25, 2026)
1. **TRIP_PURPOSE_UNKNOWN alone is NOT enough to route** — cascade is often right on routine UNKNOWN travel rows. Add a sponsorship text signal requirement (OPEX/HF/CRM/EP/J-form regex) before routing UNKNOWN rows.
2. **OPEX_PDF alone is NOT enough** — if cascade already produced `60307021 + real CC + real agency`, trust it. Only route when cascade didn't resolve cleanly.
3. **Overlay 6 is load-bearing** — LLM frequently blanks CC/DIV/agency when evidence is sparse. Per-field cascade fallback prevents these from torpedoing rows the cascade had right.
