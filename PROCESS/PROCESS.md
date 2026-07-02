# AlJeel AP — Jawal Batch Processing — Canonical Process v10

**Lock date:** 2026-05-21
**Version:** v10 (trip-purpose-corrected)
**Status:** Manual trigger, fully deterministic pipeline. Same input → same output, bit-for-bit.
**Trigger:** SSH into droplet, run `bash PROCESS/run_jawal_batch.sh <BATCH_ID>`

---

## What this pipeline does

Takes a Jawal Travel monthly invoice (Excel) + the corresponding raw approval-email folder (.msg files) and produces an Oracle Fusion-ready upload spreadsheet with full 10-segment GL distribution combinations, line-level audit trail, and a deterministic QC report.

Every line in the output has:
1. A valid 10-segment GL combo (`03-LOC-ACCT-CC-DIV-SOL-AGY-00000-00-000000`)
2. A traced employee resolution (which of 10 layers matched, with confidence)
3. A trip-purpose classification (BUSINESS_TRIP / PERSONAL / SPONSORSHIP / ANNUAL_LEAVE_TICKET / RECRUITMENT / TRAINING / UNKNOWN)
4. Email-validator cross-check (Oracle form values vs Manpower lookup)
5. Soft/hard QC gate flags

---

## Inputs required per batch

Drop these into `batches/jawal-<BATCH_ID>/`:

| File | Required | Where it comes from |
|---|---|---|
| `<BATCH_ID>.xlsx` (e.g. `J26-788.xlsx`) | ✅ | Jawal monthly invoice — Details + INVOICE tabs |
| `raw/` directory of `.msg` approval emails | ✅ | Pulled from the Outlook/SharePoint folder Laith shares per batch |
| `INV-XX MAY 26 AL JEEL.xlsx` (Oracle Fusion template) | optional | Auto-derived from invoice if absent |

Master data + reference tables are global, NOT per-batch:
- `qc/master-data/master-data-003.xlsx` — Manpower (employees + DIV/Agency/CC/Solution) + Account chart
- `qc/fixtures/golden-j640/jawal-J26-640-resolved.xlsx` — reference for Account/INDEX/DIV/Agency/Solution/CC lookup tables

---

## The pipeline — exact script execution order

The orchestrator is `scripts/process_batch.py`. When invoked, it runs these stages in this order:

### Stage 0 — Load global state (one-time per run)
- **Master data:** `qc/master-data/master-data-003.xlsx` → loads 662 Manpower employees + chart of accounts
- **Reference tables:** `qc/fixtures/golden-j640/jawal-J26-640-resolved.xlsx` → DIV / Agency / Solution / Cost Center Segment / INDEX / Account
- **Persistent caches:**
  - `cache/passenger_to_empno.json` — cross-batch passenger-name → emp_no learning
  - `cache/email_to_empno.json` — cross-batch email → emp_no learning
  - `cache/manpower_email_derived.json` — proposed Email column for Manpower

### Stage 1 — Read invoice (`process_batch.process_batch()`)
- Open `batches/jawal-<BATCH>/<BATCH>.xlsx` Details tab
- Detect header row (variable: row 1, 2, or 3 depending on Laith's export format)
- Extract 103-200 ticket lines with passenger name, ticket no, route, date, amount, VAT

### Stage 2 — Per-line resolution loop
For each ticket line, run the cascade IN THIS ORDER:

**2a. Employee resolution** (`scripts/employee_resolver_v2.py` → `resolve_employee()`)

10-layer cascade, first hit wins:

| Layer | Function | What it tries |
|---|---|---|
| L0 | direct_emp_no | If invoice has `Emp No New` column populated, look it up |
| L1 | form_emp_no | Parse .msg via `oracle_form_parser.parse_form()` → use `Person Number` field |
| L1.5 | email_match | Parse .msg via `email_resolver.extract_employee_email()` → match against `cache/email_to_empno.json` or Manpower Email column (if present) |
| L2 | msg_filename_regex | `\((\d{7,8})\)` regex on .msg filename in the ticket folder |
| L3 | ticket_folder_scan | Walk `raw/<date>/<ticket_no>/` directly, enumerate .msg files, extract emp_no from any filename |
| L4 | gds_fuzzy | Normalize GDS `SURNAME/GIVEN MR` → `GIVEN SURNAME`, rapidfuzz token_set+token_sort vs Manpower.Name; transliteration variants (ALANAZI↔ALENAZY etc.) |
| L5 | phonetic | Double Metaphone on remaining candidates |
| L6 | arabic_name | Fuzzy against Manpower.Arabic Name column |
| L7 | approver_subordinate | Use form's Approver field → narrow pool to that manager's subordinates → re-fuzzy at relaxed threshold |
| L8 | cross_batch_cache | `cache/passenger_to_empno.json` — same passenger resolved in prior batch |
| L9 | sponsorship_auto_route | If no employee match AND description has HCP / airport-pickup / event-ref patterns → auto-flag as sponsorship, route Account to 60307021 |

Returns `(emp_no, confidence, layer, trace)`.

**2b. Trip purpose classification** (`scripts/trip_purpose_classifier.py` → `classify_trip()`)

After employee resolved (or sponsorship routed), classify the trip from the form body (NOT the subject line):

Priority order:
1. Form Award name = `Annual Leave` / `Expat Annual Travel` → `ANNUAL_LEAVE_TICKET` → Account `21070229`
2. Form Award name = `Recruitment` → `RECRUITMENT` → Account `60308007`
3. Form Award name = `Training` → `TRAINING` → Account `60308009`
4. Form Award name = `Business Trip` (any subtype) → `BUSINESS_TRIP` → Account stays at resolver default (`60301003`, or `60301004` if DIV=888)
5. Family cluster detected (same surname + same date + same route + CHD/dependent marker) → `PERSONAL_VACATION` → Account `11034013` (employee recharge)
6. Sponsorship signal from L9 above OR OPEX PDF attachment → `SPONSORSHIP` → Account `60307021`
7. Default → `UNKNOWN`, leave Account at resolver default + flag for review

**2c. Email validator** (`scripts/process_batch._validate_with_email_form()`)

Cross-check form-extracted values against Manpower-derived segments. Three checks:
- **Emp No match:** Form Person Number vs employee resolved by resolver → flag `FORM_EMP_NO_MISMATCH` if differ
- **Approver vs line manager:** Form Approver name vs Manpower Line Manager → flag if differ
- **Trip value vs invoice amount:** Form Value (SAR) vs Jawal invoice line amount → flag `FORM_TRIP_VALUE_DIFFERS` if differ >5% (this is usually allowance budget vs actual; expected info-only)

**2d. Build 10-segment combo**

`{Company:03}-{Location:5}-{Account:8}-{CostCenter:6}-{DIV:3}-{Solution:5}-{Agency:5}-{Project:00000}-{Intercompany:00}-{Future1:000000}`

Account override applied at this point if trip-purpose classified non-UNKNOWN.

**2e. QC gates** (`scripts/qc_gates.py` → `validate_line()`)

Run all 13 hard gates (H1-H13) + ~20 soft gates (S1-S26):
- Hard gates: segment width, valid combo structure, all-numeric where required, Company=03, Location ∈ {10100,20100,30100,40100}, Account ∈ INDEX, CC ∈ Cost Center Segment, DIV ∈ DIV master, Agency ∈ Agency master, Solution ∈ Solution master or `00000`, Project=00000 (exactly 5 zeros), Intercompany=00 (exactly 2), Future1=000000 (exactly 6)
- Soft gates: trip purpose mismatch / approver not line-mgr / unfamiliar DIV codes / allocation target missing / etc.

Hard gate fails → halt line, write to `qc/halt-queue/`. Soft gate flags accumulate in output column.

### Stage 3 — Cross-line analysis (`trip_purpose_classifier.detect_family_clusters()`)
- Scan all batch lines for same-surname + ±2 day window + same route corridor
- Tag cluster members with `FAMILY_CLUSTER_DETECTED`
- If any cluster member has (CHD) marker → upgrade all cluster members to `PERSONAL_VACATION`

### Stage 4 — Cache enrichment
- For every line that resolved with high confidence, write back to `cache/passenger_to_empno.json` and `cache/email_to_empno.json` so subsequent batches benefit

### Stage 5 — Output generation
- Write `batches/jawal-<BATCH>/output/Spreadsheet-<BATCH>-FILLED-v10.xlsx` with all 41 columns:
  - Cols 1-16: Oracle Fusion required fields (Invoice Header, Business Unit, ..., Distribution Combination, Tax Class, Employee No)
  - Cols 17-22: Resolver audit (Agent Flags, Agent Action, Agent Emp Match, Agent Match Method, Agent Account Rule, Agent Segments Breakdown)
  - Cols 23-31: Email validator (Agent Emp Match Source, Form Emp No, Form Approver, Form Division, Form Agency, Form Solution, Form Cost-Center-Ref, Validator Status, Discrepancy Detail)
  - Cols 32-36: Resolution cascade audit (Resolution Layer, Resolution Confidence, Resolution Trace, Resolution Flag, Email Match)
  - Cols 37-41: Trip purpose (Trip Purpose, Trip Purpose Confidence, Trip Purpose Signals, Trip Purpose Trace, Trip Account Override)
- Write `batches/jawal-<BATCH>/output/summary-v10.json` with aggregate stats
- Write halt queue if any hard fails

### Stage 6 — Golden regression check (`scripts/validate_golden.py`)
- Compare new output combo column vs golden v2 fixtures in `qc/fixtures/v2/`
- Must produce 110/117 match on J26-640 (or better)
- J26-788 should match its own v2 fixture

### Stage 7 — Generate QC reports
- `qc/reports/<DATE>-<BATCH>/` with: change-log.md, purpose-distribution.md, family-clusters.md, golden-comparison.md

---

## Outputs per batch

```
batches/jawal-<BATCH>/
├── <BATCH>.xlsx                                          (input)
├── raw/                                                  (input, .msg corpus)
├── output/
│   ├── Spreadsheet-<BATCH>-FILLED-v10.xlsx              ← Oracle Fusion upload
│   ├── summary-v10.json                                  ← machine-readable summary
│   ├── halt-queue.json                                   ← any hard-gate failures
│   └── ...
qc/reports/2026-MM-DD-<BATCH>/                            ← markdown audit reports
cache/                                                    ← updated cross-batch caches
```

---

## QC gates reference (current set)

### Hard gates (REJECT — block posting)
| ID | Check | Failure Code |
|---|---|---|
| H1 | Combo segment count = 10 | INVALID_COMBO_STRUCTURE |
| H2 | All numeric segments are numeric | NON_NUMERIC_SEGMENT |
| H3 | Company = 03 | INVALID_COMPANY |
| H4 | Location ∈ {10100, 20100, 30100, 40100} | UNKNOWN_LOCATION |
| H5 | Account ∈ INDEX | UNKNOWN_ACCOUNT |
| H6 | Cost Center ∈ Cost Center Segment master | UNKNOWN_COST_CENTER |
| H7 | DIV ∈ DIV master | UNKNOWN_DIV |
| H8 | Agency ∈ Agency master | UNKNOWN_AGENCY |
| H9 | Solution ∈ Solution master or = 00000 | UNKNOWN_SOLUTION |
| H10-H12 | Project/IC/Future1 zero-counts exact (5/2/6) | BAD_*_PADDING |
| H13 | Segment widths correct | BAD_SEGMENT_WIDTH |

### Key soft gates (HOLD — surface for review, line still posts)
- `FORM_EMP_NO_MISMATCH` — resolver picked different emp than form
- `FORM_TRIP_VALUE_DIFFERS` — informational, allowance vs actual
- `MANPOWER_DIV_NOT_IN_MASTER` — DIV codes 192/194/196 case (open Q for Laith)
- `ALLOCATION_TARGET_MISSING` — Need-to-allocate without subordinate info
- `FAMILY_CLUSTER_DETECTED` — informational
- `EMPLOYEE_AS_SPONSORED` — pax in Manpower but Account=Sponsoring (likely mis-classified)
- `TRIP_PURPOSE_UNKNOWN` — no form, no marker — left at resolver default
- `MULTI_ALLOCATION_PENDING_REVIEW` — multiple candidate subordinates for Need-to-allocate

---

## How to run a new batch

### One-line invocation
```bash
ssh -i ~/.ssh/id_ed25519 root@206.189.57.22
sudo -u clawdbot bash /home/clawdbot/.openclaw/workspace/aljeel/PROCESS/run_jawal_batch.sh <BATCH_ID>
```

The wrapper script handles env loading, directory checks, the orchestrator call, the regression check, and emits a Telegram summary.

### Manual invocation (debugging)
```bash
cd /home/clawdbot/.openclaw/workspace/aljeel
set -a; source ~/.openclaw/.env; set +a
export PYTHONPATH=scripts
python3 scripts/process_batch.py \
  --batch batches/jawal-<BATCH_ID> \
  --raw-dir batches/jawal-<BATCH_ID>/raw \
  --suffix v10
```

---

## Pre-flight checks (the wrapper script enforces these)

Before running, verify:

1. Batch directory exists: `batches/jawal-<BATCH_ID>/`
2. Invoice xlsx present: `batches/jawal-<BATCH_ID>/<BATCH_ID>.xlsx`
3. Raw .msg corpus present: `batches/jawal-<BATCH_ID>/raw/` with ≥10 .msg files
4. Master data unchanged: `qc/master-data/master-data-003.xlsx` SHA matches expected
5. Reference golden present: `qc/fixtures/golden-j640/jawal-J26-640-resolved.xlsx`
6. Persistent caches writable: `cache/*.json` owned by clawdbot
7. `.env` loaded with `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`

---

## After-run checks

1. Output xlsx exists + ≥100 lines
2. summary-v10.json: hard_failures = 0
3. Run golden regression: must hit 110/117 on J26-640 reference
4. Spot-check 3 random PERSONAL classifications — confirm they have (CHD) + family-cluster signals
5. Spot-check 3 random UNKNOWN classifications — confirm no .msg was available
6. Hand to Yasser via dashboard or Telegram

---

## Rollback

If output looks wrong:
1. Don't ship to Laith/Yasser yet
2. Inspect `qc/reports/<DATE>-<BATCH>/` for the design-rationale + golden-comparison
3. Previous batch outputs preserved in `output/archive/`
4. v9 archived at `output/archive/v9-incorrect/` with README — DO NOT promote v9 again
5. v8 baseline preserved if v10 needs to be rolled back

---

## Performance + cost per batch

- Runtime: ~30s for 100-line batch on the droplet
- LLM cost: $0 deterministic path; ~$0.05 per batch if OPEX PDF parsing fires (Gemini 2.5 Flash via Files API)
- No external network calls except: OPEX PDF (Gemini), and only when a .msg has a PDF attachment matching event patterns

---

## Process invariants (locked rules)

1. **Same input → same output, bit-for-bit.** No LLM in the deterministic path. OPEX PDF parsing is cached by SHA256.
2. **Conservative defaults.** UNKNOWN never auto-flips. PERSONAL requires (CHD) + family cluster OR explicit form Award.
3. **Form body > subject line.** Subject "Personal Contribution Approval Requested" is noise. Form Award name + Trip Goal are authoritative.
4. **Account override only after employee resolved.** Resolver picks default; classifier overrides; gates validate.
5. **Hard gate fail blocks posting.** No line with INVALID_COMBO_STRUCTURE etc reaches the output xlsx.
6. **Cache is append-only.** Cross-batch passenger/email pairs accumulate; never reset.
7. **Reference tables read fresh per run.** Manpower changes don't require code change.

---

## Version history

| Version | Date | What |
|---|---|---|
| v8 | 2026-05-21 PM | 10-segment combo + 10-layer resolver + email validator + family clusters. Baseline. |
| ~~v9~~ | 2026-05-21 PM | ARCHIVED. Subject-line "Personal Contribution" misread → 144 lines wrongly flipped. |
| **v10** | 2026-05-21 night | Current. Form-body authoritative purpose. 110/117 golden match. Surgical catches only. |
| v10.x | (future) | Manpower Email column + L1.5 fully deterministic (when Laith adds the column) |

---

## Open items (for Laith / Labib, not blocking the pipeline)

1. EP solution code (1 line flagged)
2. DIV codes 192/194/196 confirmation
3. 3 new hires to add to Manpower (Merheb 1002576, Alwakeel, Babakr)
4. 5 HESHAM ALI disambiguation (3 candidates in Manpower)
5. 37-row email CSV to merge into Manpower → makes L1.5 deterministic 1.0-confidence

---

## v15.12 - HYBRID PIPELINE (added May 25, 2026)

The deterministic v15.11.2 cascade above is unchanged and remains canonical.

v15.12 adds an LLM-routing layer ON TOP for blind-data batches where sponsorship/training context determines the right account. The cascade alone gets ~62% all-5-exact on truly blind data (0% on sponsorships); the hybrid gets ~73% (~46% on sponsorships).

### Trigger
```bash
bash PROCESS/run_jawal_batch_hybrid.sh <BATCH_ID> [<INVOICE_ID>]
```

### Pipeline
1. **Stage A:** Runs the v15.11.2 cascade (Stages 0-7 above) if `Spreadsheet-<INVOICE>-FILLED-v15.11*.xlsx` doesnt already exist.

---

## v15.12 - HYBRID PIPELINE (added May 25, 2026)

The deterministic v15.11.2 cascade above is unchanged and remains canonical.

v15.12 adds an LLM-routing layer ON TOP for blind-data batches where sponsorship/training context determines the right account. The cascade alone gets ~62% all-5-exact on truly blind data (0% on sponsorships); the hybrid gets ~73% (~46% on sponsorships).

### Trigger
```bash
bash PROCESS/run_jawal_batch_hybrid.sh <BATCH_ID> [<INVOICE_ID>]
```

### Pipeline
1. **Stage A:** Runs the v15.11.2 cascade (Stages 0-7 above) if `Spreadsheet-<INVOICE>-FILLED-v15.11*.xlsx` doesn't already exist.
2. **Stage B:** Runs `scripts/run_hybrid_v15_12.py`. For each cascade row:
   - Stays cascade by default.
   - Routes to LLM (Gemini 3 Pro -> 2.5 Pro -> 2.5 Flash cascade) when:
     - OPEX PDF present in folder AND cascade did not resolve as sponsorship cleanly
     - Cascade said travel but description/notes have sponsorship signals (HF/OPEX/CRM/EP/J-form regex)
     - Cascade CC = 000000/999999/blank
     - Cascade Trip Purpose=UNKNOWN AND text signal present
     - EMPLOYEE_NOT_IN_MASTER flag
   - Applies overlay rules (cascade wins where deterministic logic is stronger):
     - DIV=888 G&A travel: keep cascade's 60301004
     - Sponsorship agency/solution: keep cascade's OPEX-prefix-derived codes
     - Per-field fallback: if LLM blanks CC/DIV/agency, keep cascade
   - Family-cluster emp_no unification: harmonize emp_no across same-surname/route/month clusters of 2+

### Outputs (alongside v15.11.2 outputs)
- `Spreadsheet-<INVOICE>-FILLED-v15.12.xlsx` - Hybrid output. Send to Laith. Adds `Agent Method` column.
- `summary-v15.12.json` - Stats, routing reasons, method counts, LLM cost
- `qc/reports/run-<BATCH>-<TS>-hybrid.log` - Full hybrid run log

### Cost ceiling
$3 USD per batch on Gemini 3 Pro pricing. Hard cap.

### When v15.11.2 (cascade alone) is enough
- Batches that match the J26-640-style master data closely
- Internal QC where deterministic reproducibility matters more than raw accuracy
- One-off re-runs

### When v15.12 (hybrid) is needed
- New monthly Jawal invoices that include sponsorship/training rows
- Blind-test batches
- Any batch where cascade's `Trip Purpose=UNKNOWN` rate is >20%

### Full skill doc
See `PROCESS/HYBRID-SKILL.md` for the operator manual, troubleshooting, and locked baselines.
