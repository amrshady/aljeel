# IMPLEMENTATION.md — AlJeel AP Pipeline (Jawal Travel-Expense Processing)

**Last updated:** 2026-05-22 (v15.10 lock)
**Owner droplet:** aljeel-ap (206.189.57.22)
**Workspace:** `~/.openclaw/workspace/aljeel/`
**Status:** Production-grade. 99.1% full-row exact match, 100% on every non-location segment.

This is the engineering reference for how the pipeline works. RULES.md is the principles layer — this file is the architecture + files + lessons + ops layer.

---

## Architecture

```
Input batch xlsx (J26-XXX.xlsx)
   │
   ├── Details sheet (raw invoice rows)
   ├── raw/ folder (.msg files, Oracle Fusion forms, PDFs)
   │
   ↓ process_batch.py orchestrates
   │
   ├── 1. Voucher→emp_no map built from input Details (col 2 Ref. No.)
   ├── 2. For each invoice row:
   │   ├── Parse description, extract ticket/voucher, pax name, route
   │   ├── Resolve EMPLOYEE via cascade (employee_resolver_v2.py):
   │   │   • L0/L1 direct emp_no
   │   │   • L0.5 PaxOverrides table
   │   │   • L1 form_emp_no (from voucher map OR .msg form)
   │   │   • L4 GDS fuzzy (with AL/EL-surname boost)
   │   │   • L7.5 reverse manager lookup
   │   │   • L7.7 LLM-on-email (Gemini 3.x via location_resolver pattern)
   │   │   • L8 manager-CC unanimity (or LineManagerOverrides on fragmented)
   │   │   • L9 sponsorship auto-routing
   │   ├── Resolve LOCATION via location_resolver.py (deterministic, no LLM):
   │   │   • R0 Train ticket → 40100
   │   │   • R1 Intl destination → 20100
   │   │   • R2 Triangular West-via-RUH-West → 20100
   │   │   • R3 Ambiguous KSA (HAS/HMB/ELQ) → 20100
   │   │   • R4 Any Western city → 40100
   │   │   • R5 Any Eastern city → 30100
   │   │   • R6 Default → 20100
   │   ├── Resolve ACCOUNT via trip-purpose classifier + DIV fallback
   │   ├── Validate every returned code against Aljeel_Lookups master
   │   └── Apply QC gates, set Row Status (GREEN/YELLOW/RED)
   │
   ├── 3. Within-batch QC (duplicates, round amounts, no-approval flags)
   ├── 4. Cross-batch fraud detection (passenger pattern, suspicious routing)
   ├── 5. Write output xlsx with full audit trace
   ├── 6. Run golden fixture regression check
   └── 7. Optional QC review (qc/qc_review.py — Claude Sonnet reviewer)
```

---

## File map

### Core scripts (`scripts/`)
- `process_batch.py` — orchestrator, ~58K
- `employee_resolver_v2.py` — 10-layer cascade with surname-boost + overrides, ~55K
- `location_resolver.py` — deterministic 6-rule location logic, ~36K
- `cost_center_resolver.py` — Manpower loader + segment combo builder, ~22K
- `code_name_lookup.py` — code-to-name lookups from Aljeel_Lookups master
- `allocation_resolver.py` — Gemini-on-email LLM extractor (L7.7)
- `email_allocation_extractor.py` — alternate LLM-on-email path
- `oracle_form_parser.py` — parses Oracle Fusion approval forms in .msg
- `opex_pdf_parser.py` — parses OPEX PDF attachments via Gemini
- `msg_parser.py` — base .msg reader with msgconvert fallback
- `excel_styling.py` — row colorization + QC catch summarization
- `cross_batch_fraud.py` — duplicate/pattern detection across batches
- `code_name_lookup.py` — name lookups from master + golden snapshot
- `trip_purpose_classifier.py` — business/personal/annual/new-employee
- `build_jawal_data.py`, `build_dashboard_data.py` — output xlsx assembly

### QC infrastructure (`qc/`)
- `score_against_canonical.py` — **CRITICAL UTILITY**: ticket-based scoring (NOT row position)
- `qc_gates.py` — flag definitions, hard/soft gates
- `qc_review.py` — Claude Sonnet reviewer with structured payload summarizer
- `fixtures/aljeel-canonical/J26-640-Aljeel_version.xlsx` — Laith's hand-prepared reference
- `fixtures/golden-j640/jawal-J26-640-resolved.xlsx` — earlier golden snapshot
- `master-data/Aljeel_Lookups.xlsx` — Manpower + Account + Agency + Solution + DIV lookups
- `master-data/LineManagerOverrides.xlsx` — Laith-maintainable executive override tables
- `reports/` — per-batch run logs + golden diffs

### Process (`PROCESS/`)
- `run_jawal_batch.sh` — single entry point: `bash PROCESS/run_jawal_batch.sh <BATCH_ID>`
- Contains `PIPELINE_VERSION="v15.10"` (current)

### Baselines
- `*.BASELINE-v15.4` through `*.BASELINE-v15.10` — immutable rollback snapshots

---

## How to run a new batch

```bash
cd ~/.openclaw/workspace/aljeel
bash PROCESS/run_jawal_batch.sh J26-XXX
```

Where `batches/jawal-J26-XXX/J26-XXX.xlsx` exists and `batches/jawal-J26-XXX/raw/` contains the .msg + PDF files.

Output lands at:
- `batches/jawal-J26-XXX/output/Spreadsheet-J26-XXX-FILLED-v15.10.xlsx`
- `batches/jawal-J26-XXX/output/summary-v15.10.json`
- Run log at `qc/reports/run-J26-XXX-<timestamp>.log`

Validation step at end calls `python3 scripts/validate_golden.py` — this uses the v7 fixture and is INTERNALLY-FACING regression detection (NOT canonical comparison). For canonical comparison use `qc/score_against_canonical.py` separately.

---

## Per-deliverable detail

### Location resolution (`location_resolver.py`)

Pure Python, no LLM, no Manpower lookup. Deterministic 6-rule cascade plus train-ticket override at the top (R0). Match rate: 99.1% (114/115) on J26-640 canonical.

The 1 residual mismatch (NAGMALDIN HAS RUH → canonical 30100, pipeline 20100) lacks any clean rule explanation. Investigated and rejected: not employee-home-based (NAGMALDIN's Manpower location is 10100), and HAS is geographically Northern not Eastern. Likely a Laith judgment call we can't generalize from.

### Employee resolution (`employee_resolver_v2.py`)

10-layer cascade. The cascade ordering matters — L0.5 overrides MUST run before L1 form_emp_no, because executive overrides need to beat the email-cache misrouting we saw on Hesham Ali. Match rate on CC/DIV/Agency: 100% on J26-640 canonical.

Key gotchas:
- GDS fuzzy match originally weighted firstname too high; surname-boost (+50 for AL/EL compounds) fixed the wrong-Husam / wrong-Ahmed bugs in v15.9
- L7.5 reverse manager must propagate emp_no to the primary Employee No column, not just to trace columns. Fix E in process_batch.py.
- L8 unanimity requires 100% not majority — earlier prototypes accepted 33% "best match" and silently mis-allocated

### Voucher → emp_no detection (v15.10)

The input xlsx Ref. No. column (col 2) has different semantics depending on the Ticket No. format:
- Ticket No. is 10-digit airline → Ref. No. is PNR/Pax reference (ignore)
- Ticket No. matches `26-\d{3,}` (voucher: train, hotel, registration, airport transfer) → Ref. No. is the employee number directly (often with trailing `.` Excel formatting)

`_load_voucher_empno_map()` in process_batch.py builds the mapping once per batch from the input Details sheet. When a voucher row has no form_emp_no from .msg but has a map entry → use the map. This single fix resolves train tickets AND ~25 other voucher rows per batch.

### Overrides tables (`qc/master-data/LineManagerOverrides.xlsx`)

Two sheets:
- **LineManagerOverrides** — `manager_no` keyed. Fires when L7.5 resolves a manager but L8 finds fragmented subordinate CCs. Currently 1 row (Hesham Ahmed Ali / mgr#1002575).
- **PaxOverrides** — sorted-tokens-joined-with-`|` keyed (e.g. `ali|hesham`). Fires when the traveler is not in Manpower at all (typically C-suite + senior execs). Currently 6 rows (Hesham, Sharawy, Alhajj, Khudhayr, Babakr, Mahrouq).

Laith-maintainable: add 1 row per executive as they surface in batches. No code changes needed.

When override fires: `resolver_layer = "v3_L_overrides"`, `flag_code = "RESOLVED_VIA_OVERRIDES_TABLE"`, row is GREEN if all segments resolve cleanly.

### LLM layers (L7.7 + email_allocation_extractor)

Used when no Manpower hit AND no form emp_no in .msg AND no override entry. Reads FULL .msg body + all attachments (no character truncation since v14.1). Sends to Gemini 3.x (via `gemini-pro-latest` alias).

LLM prompt has explicit negative examples for Oracle HCM internal IDs (Trip Cost For 13-15 digit, Division 5-digit Fusion codes, etc.) — these are NOT AlJeel GL codes and the LLM is instructed to return null when only HCM IDs are present.

LLM-returned codes are validated against `Aljeel_Lookups.xlsx` master tables. Unknown codes → flagged `LLM_RETURNED_UNKNOWN_CODE`, never silently written.

Costs $0.01-0.05 per batch depending on how many rows hit L7.7. Cached by .msg SHA256.

---

## Decisions explicitly rejected

- **LLM-based location resolution (v15.3-v15.5)** — Tried Gemini for location classification. Caused inconsistency across rows with similar inputs. Replaced with deterministic rules in v15.6+.
- **99999 sentinel for unresolvable location** — Retired in v15.6. Sentinels in the GL combo would silently post to Oracle as invalid; better to default to Central (20100) with a YELLOW flag.
- **Sponsorship-origin location (v15.4)** — Brief experiment posting sponsorship trips to their origin city. Canonical data shows AlJeel posts ALL international sponsorship to Central (20100). Reverted.
- **Majority-pool CC allocation for fragmented managers (pre-v15.2)** — Earlier prototype accepted "best 33% match" when manager's subordinates were fragmented. Produced wrong allocations. Replaced with strict 100% unanimity + overrides table.
- **Sl#/row-position canonical comparison (pre-v15.7 lessons)** — Tested as initial scoring method, produced false-positive mismatches because canonical and pipeline sort differently. Replaced with ticket-keyed comparison in `score_against_canonical.py`.
- **Manpower's Location column as GL Location source** — Manpower col 4 is HR-side employee office location. Confused with GL Location code in early versions, causing the v15.3 "kill 20100" regression. Now strictly: Manpower Location ≠ GL Location code.

---

## Known limits / future work

1. **NAGMALDIN HAS RUH residual** — 1 row in J26-640 where canonical 30100 doesn't match any deterministic rule. Would need a "HAS handling" decision from Laith.
2. **`Aljeel_Lookups.xlsx` is the master** — if Laith updates it (new employees, new agencies, new cost centers), the pipeline picks up changes on next run. No code changes needed.
3. **LineManagerOverrides growth** — as new batches surface new executives, Laith adds rows. The table grows organically.
4. **Cross-batch passenger learning** — L8 cache currently learns within-batch and persists across runs, but only for direct emp_no resolutions. Could be extended to learn pax-name → emp_no fuzzy matches.

---

## QC arc (per-batch confidence)

| QC Layer | What it catches | Status |
|---|---|---|
| Hard gates (H1-H14) | Structural errors (missing required fields, malformed combo) | Blocks Oracle submission |
| Soft gates (S1-S34) | Data-quality concerns (no approval, round amount, fragmented manager, etc.) | YELLOW for review |
| Within-batch QC | Duplicate ticket numbers, route+amount duplicates, mismatched EMD fees | Reports inline |
| Cross-batch fraud | Same passenger flagged across batches, suspicious patterns | Reports across batches |
| Golden regression (v7 internal) | Code changes don't regress against earlier validated output | Runs on every batch |
| Canonical comparison (Laith) | Pipeline matches Laith's hand-prepared reference | Manual `score_against_canonical.py` |
| Optional QC review (qc_review.py) | Sonnet-powered batch-level review | $0.05/batch, optional |

---

## External IDs / infrastructure

- **Droplet:** aljeel-ap, 206.189.57.22, DigitalOcean
- **Workspace:** `~/.openclaw/workspace/aljeel/` (clawdbot user)
- **LiteLLM proxy:** http://143.198.136.126:4000 — key alias `aljeel-ap`, used for Gemini/Claude routing
- **Gemini direct:** GEMINI_API_KEY in `/home/clawdbot/.openclaw/.env`, primary path for Gemini 3.x
- **Dashboard:** finance.aljeel.accordpartners.ai (Cloudflare Pages — separate component)

---

## Version history summary

See RULES.md Section 8 for the full version arc. Current head + locked baselines:

- v15.10 (HEAD, 2026-05-22) — train ticket handling, 99.1% full-row exact, 100% excl. location
- v15.9 — fuzzy match fixes + executive overrides, 97.4%
- v15.8 — LineManagerOverrides + PaxOverrides tables, 93.0%
- v15.7 — corrected city sets + triangular rule reversal, 88.7%
- v15.4 — sponsorship origin attempt (later reversed)

Roll back to any baseline via `cp scripts/<file>.BASELINE-v15.X scripts/<file>.py` + bump PIPELINE_VERSION accordingly.

## Files Upload Portal — Reusable System (added 2026-06-30)

The KB upload portal (https://files-aljeel.accordpartners.ai — **Al Jawal** + **Asateel** tabs) is a reusable multi-tenant system. FULL runbook + source committed to the GitHub repo:

- **Repo:** https://github.com/amrshady/aljeel → `workers/files-portal/`
- **Runbook:** `workers/files-portal/FILES_PORTAL.md` (architecture, multi-tenant model, "add a new portal" recipe, deploy commands, CF resource ids, Spaces CORS, droplet sync, API ref, gotchas)
- **Local mirror on this droplet:** `~/.openclaw/workspace/aljeel/files-portal/`

**To spin up a NEW upload portal:** follow FILES_PORTAL.md §5. Pattern: create a Spaces bucket → add one line each to `TENANT_BUCKETS`/`TENANT_ACCESS` (worker) + `TENANTS`/`SITE_TENANTS` (frontend) → deploy to Pages project `regent-files` (main CF account `5157425bbabb332495954e18b1415950`, cfut_ token) → attach domain + CF Access OTP → optionally wire kb-sync rclone pull for the new prefix.

**Share-a-bucket / add-a-tab (minimal-disruption) pattern:** Asateel sits in the SAME bucket as Jawal via isolated prefix `asateel/current/` vs `current/`. Every `current/` literal in the worker is now `cfg.prefix`. kb-sync.sh pulls both prefixes (asateel mingled into `current/asateel/`).

