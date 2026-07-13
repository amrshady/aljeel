# Asateel Runbook — CANONICAL Operating Procedure

> ⚠️ **SCOPE — READ THIS FIRST**
> This runbook applies **ONLY to the Asateel Al-Tareeq transportation-reimbursement pipeline.**
> It does **NOT** apply to Jawal Travel, J&J / DePuy, or any other vendor.
> - **Asateel** = `pipelines/asateel.py` → engine `asateel-sample/asateel_poc.py`. Transportation rides, JQ→agency allocation, SO_Detail resolution, even multi-agency split.
> - **Jawal** = `scripts/run_v30.py` / `process_batch.py` / `full_evidence_agent*.py`. Travel tickets, employee/sponsorship evidence, OPEX. **Different engine, different logic — never mix.**
> If a task is about travel tickets, employees, sponsorship, or OPEX → that is **Jawal**, not this file.
> If a task is about ride/transport invoices reconciled to a manual allocation Excel with JQ numbers → **Asateel**, use this file.

---

## 0. What Asateel does (one paragraph)

Reconciles a batch of scanned Asateel ride invoices (PDFs) against AlJeel finance's manual cost-center allocation Excel (the "Expenses Format" master), resolves each JQ ticket to its owning agency via the Oracle **SO_Detail** export (authoritative), splits transport cost across multiple agencies where a JQ spans several, and writes an Oracle-ready upload sheet + JSON contracts. Output columns follow the shared Oracle Fusion template; GL Description uses the 8-part Jawal-style format (replicated locally, NOT imported from Jawal).

## 1. Canonical inputs

| Input | Path | Notes |
|---|---|---|
| Batch PDFs + master | `batches/asateel-<batch-id>/src/` | Staged from the dated kb archive (see §2). NEVER from the live bucket. |
| Expenses-Format master | `batches/asateel-<batch-id>/src/<Central NN-2026>.xlsx` | The xlsx whose sheets include a tab named **`Expenses Format`**. (The `كشف ...` xlsx is NOT the master.) |
| SO_Detail (authoritative JQ→agency) | `reference/SO_Detail_Labadi_1_R21_AA.xlsx` | Oracle BI Publisher export. System-of-record master, NOT an answer-key. |
| Shared lookups | `qc/master-data/Aljeel_Lookups-v2.xlsx` | Agency/DIV/Solution/Manpower. Read automatically by the engine. |

## 2. Standard procedure (stage → run → verify → deliver)

**NEVER run off the live `current/` bucket** — it churns mid-run (files vanish). Always stage from the dated archive.

### Step 1 — Stage from archive
```
python3 scripts/asateel_stage_batch.py --archive-date <YYYY-MM-DD> --folder-name '<Arabic folder>' --batch-id <central-NN>
```
Example: `--archive-date 2026-07-01 --folder-name 'وسطي 13' --batch-id central-13`
- Copies PDFs + xlsx from `/mnt/aljeel_ap_kb/archive/<date>/asateel/<folder>/` into `batches/asateel-<batch-id>/src/`.
- Handles Arabic NFC/NFD path matching. Refuses the live bucket. Prints PDF count + the resolved Expenses-Format master.

### Step 2 — Run the batch
```
python3 pipelines/asateel.py --folder CENTRAL --full \
  --pdf-dir 'batches/asateel-<batch-id>/src' \
  --expenses-format 'batches/asateel-<batch-id>/src/<Central NN-2026>.xlsx' \
  --so-detail 'reference/SO_Detail_Labadi_1_R21_AA.xlsx'
```
- Cold extraction ≈ 90 s/PDF (3-model Gemini cascade × ~5 pages). A 60-PDF batch ≈ 90 min. Use a background watcher + cron report; do not block.
- Per-batch cache is isolated (`CENTRAL__asateel-<batch-id>__NNNNN.json`) — golden and other batches are untouched. **Never delete `_cache/`.** Re-runs read cache (deterministic), they do NOT re-call the LLM.

### Step 3 — Verify (MANDATORY before trusting any code change)
```
python3 qc/asateel_golden_check.py      # must print "GOLDEN OK", exit 0
```
- Runs the golden CENTRAL command (`--folder CENTRAL --full`, no pdf-dir/so-detail) against `qc/asateel_golden_expected.json`.
- Golden signature: **188 rows · GREEN 3 · YELLOW 185 · RED 0 · 6 blank CC · 92/92 reconciled.** (re-baselined 2026-07-13 for the supplier-sheet-authoritative agency rule; was GREEN 7 / YELLOW 181 under the old SO_Detail-authoritative behavior.)
- If it fails: a change altered pipeline behavior. Do NOT deliver. Diagnose (Codex) before proceeding.

> **Jawal has its own golden gate** (separate pipeline — travel tickets / `run_v30.py`, NOT this Asateel runbook). Before trusting ANY Jawal pipeline change, run `python3 qc/jawal_golden_check.py` — must print `GOLDEN OK`, exit 0. Locked batch J26-788; snapshots deterministic Stage-1 cascade aggregates from `summary-v15.11.2.json` vs `qc/jawal_golden_expected.json` (NOT Gemini/LLM output). Signature: **100 rows · GREEN 23 · YELLOW 31 · RED 46 · resolved 23 / exception 77 · blank-key 0.** Regenerate baseline only after an intentional reviewed change: `python3 scripts/process_batch.py --batch batches/jawal-J26-788 --raw-dir batches/jawal-J26-788/raw --suffix v15.11.2`, then refresh the expected JSON.

### Step 4 — Deliver
- Outputs land in `matched/`: `asateel-oracle-upload.xlsx`, `asateel-allocation.json`, `asateel-catch.json`, `asateel-summary.json`, `asateel-trace.json`.
- Copy the Oracle sheet to the batch folder for the record:
  `matched/asateel-oracle-upload.xlsx` → `batches/asateel-<batch-id>/Central-NN-2026_Oracle-upload.xlsx`
- Send it to the group via the `message` tool with `filePath` (or MEDIA line). Report: invoices, rows, GREEN/YELLOW/RED, reconciled, total value, blank-CC count, exception categories.
- **⚠️ Note:** each golden run overwrites `matched/` with golden output. If you ran the golden gate after a batch, re-run the batch (Step 2, warm cache — fast) to restore its `matched/` output before delivering.

## 3. Locked logic (do not change without golden gate + Codex)

- **Supplier sheet authoritative for agency (changed 2026-07-13).** Agency (and its allocation segments) come from the batch's Expenses Format supplier sheet, matched by invoice number per line. Agency names map via the workbook `Agency ` reference sheet (value/description), then shared lookups. **SO_Detail is JQ-existence VALIDATION ONLY** — it no longer assigns agency and no longer drives any split. Canonical JQ = strip leading space, zero-pad 8 → `JQ-NNNNNNNN`. Reason: finance confirmed the old SO_Detail multi-agency split was wrong (a single JQ appearing under many agencies in SO_Detail must not be split; the supplier sheet states the one correct agency per invoice).
- **No multi-agency splitting from SO_Detail.** A JQ that maps to multiple agencies in SO_Detail is NOT split; the supplier sheet's stated agency wins. Legitimate multi-line invoices in the supplier sheet (different agency per sub-line, e.g. 03948 = KLS Martin + Thermo) are honored as the supplier sheet's own allocation, NOT an SO_Detail split. The old `per_jq_agency_even` / salesperson-split paths are removed.
- **Missing JQ in loaded SO_Detail => YELLOW** (review), agency still taken from supplier sheet. Never RED for that reason alone; monotonic severity still holds (YELLOW never downgrades RED).
- **Option-A CC/DIV inheritance:** split rows inherit the JQ's supplier Cost Center / Cost Name / DIV / Contribution / Solution; ONLY agency code+name+salesperson vary per split. Prevents blank CC on employee-less agencies.
- **GL Description = 8-part Jawal format:** `GL · Cost Name · Contribution · Solution Name · Agency Name · 00000 · 00 · 000000` (blank/#N/A → `—`). Local helper `_build_gl_description`; does NOT import Jawal.
- **Severity is monotonic:** a YELLOW override never downgrades an existing RED. SO_Detail "JQ not in export" review runs only when SO_Detail is actually loaded.
- **JSON salvage:** malformed Gemini JSON is repaired before the parse_error fallback (marks `json_salvaged=true`). Applied to fresh extraction AND cached `{parse_error,raw}` — heals warm cache without re-OCR.
- **Determinism:** extraction runs at temperature 0; the per-batch cache is the authoritative extraction record.

## 4. Consistency & provenance (added 2026-07-02)

Every run writes to `matched/asateel-summary.json`:
- `input_fingerprints` — sha256+size of Expenses-Format xlsx, SO_Detail xlsx, `Aljeel_Lookups-v2.xlsx`, and a hashed PDF manifest.
- `provenance` — `pipeline_version` (`ASATEEL_PIPELINE_VERSION` const in `asateel_poc.py`), `git_sha` (workspace repo), run timestamp, python version, resolved CLI args.

To reproduce/audit a past run: match the git_sha + input fingerprints, stage the same archive copy, run Step 2.

## 5. Known residual cases (not bugs)

- **Blank/placeholder agency (00000 / 99999 Others):** the SO_Detail export itself lacks a real CAT_AGENCY on some order lines for a JQ (e.g. JQ-26125743 had one `99999 Others` line + one empty line). CC/DIV still fill via Option-A; only the agency segment is placeholder. Escalate the JQ list to Amr for source correction — do NOT hand-edit outputs.
- **Malformed 9-digit JQs / JQs not in export:** flagged YELLOW; report in the JQ-mismatch sheet.

## 6. Escalation

Per `escalation-paths.md`: **Amr is the only contact.** No vendor pings, no direct AlJeel-team pings. Deliver batch results + exception/JQ-mismatch lists to the group; Amr routes to finance.
