# Vendor Handlers — Canonical Reference

Per-vendor file patterns, discovery logic, pipeline outputs, and Oracle ingestion artifacts.

The discovery layer (`scripts/discover.py` on the prior Malik droplet; refactor target on aljeel-ap) auto-detects files by pattern. Operators drop new files under `raw/<vendor>/` and run the pipeline — no path edits required.

---

## J&J / DePuy (3-way match)

**What it does:** Multi-PO commercial invoices reconciled against Aljeel POs and delivery notes / goods-receipt.

**Inputs** (drop under any path inside `raw/`):
| Pattern | Purpose |
|---|---|
| `*ZSD1COMINV*.pdf` | Vendor commercial invoice (bilingual EN+AR, multi-page) |
| `DN #*.xlsx` or `DN#*.xlsx` | Delivery-note workbook (PO sheets + Pre-alert/GR sheet) |
| `Oracle report for invoice *.xlsx` | Oracle truth source: line totals + customer POs |

**Discovery logic:**
- Reads invoice number from PDF filename (10-digit number after `ZSD1COMINV`)
- Looks up expected total + customer POs + line count from matching Oracle Excel
- Auto-maps each PO ID to a sheet in the DN workbook by 4-digit substring match
- Picks 3-page extraction chunks for invoices >100 lines or >SAR 1M, else 5-page

**Extraction:** Gemini 2.5 Flash extracts header + line items in chunks. Completeness gate enforces `sum(line_total) / header.total` within 0.98–1.02; below threshold sets `extraction_audit.incomplete=True`.

**Match strategy:**
1. Aggregate invoice lines by `vendor_item_code` (primary key: `V:<code>`)
2. Fallback aggregation by normalized description (`D:<desc>`)
3. Exact normalize match first
4. Fuzzy prefix-match fallback (handles Gemini concatenating duplicate item names)
5. Sum quantities across duplicate PO description lines (e.g. POST IBF cages with 4 duplicate-description PO lines)

**Output:**
- `matched/<invoice>.match.json` — line-level reconciliation
- `dashboard/public/files/oracle-jj-<invoice>.xlsx` — Oracle PO-match report + 3 appended columns (Agent Match Status / Flags / Action), colour-coded

**Reference benchmark (April 2026 batch):**
- Invoice 3072041365: 99.7% match, 1 real short-ship exception
- Invoice 3072041444: 100% match, 0 exceptions

---

## Asateel Al-Tareeq (transportation reimbursement)

**What it does:** Reconciles a batch of scanned ride invoices against Aljeel finance's manual cost-center allocation Excel.

**Inputs:**
| Pattern | Purpose |
|---|---|
| `<5digit>_<digits>.pdf` (e.g. `02725_0001.pdf`) | One scanned ride invoice per file |
| `.xlsx` whose `Details` sheet has `Intercompany*Invoice Number` and `JQ` columns | Aljeel finance's allocation file (Arabic filename) |

**Discovery logic:**
- Picks the directory with the most matching PDFs
- Picks the co-located allocation xlsx (or the first matching one anywhere)

**Two row types in the allocation Excel:**
- **JQ-bearing rows** (~200): employee-reimbursed rides with a JQ ticket number
- **Cost-center-direct rows** (~12, mostly Warehouse): rides booked directly to a cost center, no JQ

**Pipeline:**
1. Detect allocation rows as any row with `AMOUNT` set (covers both types; v1 only counted JQ rows → 11 false UNALLOCATED catches)
2. Header SAR is gross of VAT; allocation lines are net. Reconcile: `allocation_sum × 1.15 ≈ header_total` within 1 SAR tolerance
3. Gemini PDF sample (5 of 117) cross-validates header totals end-to-end

**Catch categories:**
- `ALLOC_MISMATCH` — header vs allocation sum gap > 1 SAR after VAT gross-up
- `DUP_JQ_STRICT` — same employee + same date + same amount + different invoice numbers (double-pay candidate)
- `EMP_SAME_DAY_MULTI_INVOICE` — soft signal, 3+ rides one day across 3+ invoices > SAR 3K total
- `PARTIAL_ALLOC_MISSING_JQ` — allocation row missing JQ but has amount

**JQ semantics:** JQ is per-claim, not per-employee. 174 of 187 JQs in April batch appear exactly once. Duplicates by JQ alone are rare; the strict pattern is the double-pay candidate.

**Output:**
- `matched/asateel-catch.json`, `matched/asateel-summary.json`, `matched/asateel-allocation.json`
- `dashboard/public/files/asateel-allocation-ready.xlsx` — 3 sheets (Details mirror, Reconciliation Summary, Exceptions for Review)

**Reference benchmark (April 2026):**
- 100% reconciliation (117/117), SAR 185,943
- 8 catches: 2 strict double-pay (SAR 4,850 at risk), 5 soft same-day multi-invoice, 1 data-quality flag

### SO_Detail agency resolution (LOCKED 2026-07-01)

The Oracle BI Publisher export `reference/SO_Detail_Labadi_1_R21_AA.xlsx` is the **authoritative** JQ→agency reference (system-of-record master, NOT an answer-key). Passed via `--so-detail`. It wins over supplier Expenses-Format text AND Manpower for the agency.

- **Shape:** Sheet1, header row 5, data row 6+. ORDER_NUMBER[A, leading space], ACCOUNT_NUMBER[E], ACCOUNT_NAME[F], ORGANIZATION_CODE[I], CAT_AGENCY[J code], CAT_AGENCY_DESC[K], SPERSON[L]. ~9,552 unique JQs.
- **Canonical JQ:** strip leading space, zero-pad to 8 → `JQ-NNNNNNNN`.
- **Dedupe on agency code only** (ignore ORGANIZATION_CODE): same-agency-diff-org JQs collapse to one allocation, keep first row's org as metadata.
- **Multi-agency JQs (827):** split transport cost EVENLY across distinct agencies (cent remainder to last), flag YELLOW, split_method `per_jq_agency_even`.
- **Salesperson-split guard:** allocation-unit key `(CAT_AGENCY, SPERSON_id)`; splits within same agency by salesperson (methods `per_jq_sperson_even`/`per_jq_agency_sperson_even`). Dormant/no-op on current data.

### Option-A CC/DIV inheritance (finance-approved 2026-07-01)

CC/DIV/Contribution live ONLY in Manpower (employee-based) — so SO_Detail split rows to employee-less agencies (3M, Euronda, Ivoclar, Arum, Dental Farm, Wassermann, Rapid Shape, MGF) came out BLANK. **Fix:** every split row INHERITS the JQ's supplier Expenses-Format Cost Center / Cost Name / DIV / Contribution / Solution; ONLY agency code+name+salesperson vary per split. Blank CC 36→1 on batch-15. (Longer-term: a real employee-independent agency→Division/CC master from finance would let each split agency book its own CC.)

### GL Description = Jawal 8-part format (2026-07-01)

Replicated from `scripts/cost_center_resolver.py::build_gl_description` (local helper `_build_gl_description`, no cross-import):
`GL · Cost Name · Contribution · Solution Name · Agency Name · 00000 · 00 · 000000` (blank/#N/A → `—`, ` · ` sep). Distribution Combination (10-segment code) unchanged.

### Severity monotonic + JSON salvage (2026-07-01)

- SO_Detail "JQ not in export → YELLOW" override is guarded by `so_detail_enabled = bool(so_detail_index)` and NEVER downgrades an existing RED (severity monotonic).
- `_salvage_json()` repairs malformed Gemini JSON before the `parse_error` fallback: strip md fences, truncate 'Extra data' to first balanced object, drop stray trailing `]`/trailing commas, balanced-bracket scan. Applied to fresh extraction AND cached `{parse_error,raw}` (heals warm cache w/o re-OCR). Marks `json_salvaged=true`.
- **Learning:** malformed JSON, not real extraction failure, was the true cause of prior parse-error REDs.

**Run (batch):** `python3 pipelines/asateel.py --folder CENTRAL --full --pdf-dir '<batch>/src' --expenses-format '<batch>/src/<master>.xlsx' --so-detail 'reference/SO_Detail_Labadi_1_R21_AA.xlsx'`
**Golden regression (no flags):** `python3 pipelines/asateel.py --folder CENTRAL --full` → must hold 188 rows, GREEN 7 / YELLOW 181 / RED 0, 6 blank CC.

---

## Jawal Travel (per-ticket folder match)

**What it does:** Monthly travel invoice reconciled against per-ticket evidence folders (booking PDF + approval emails).

**Inputs:**
| Pattern | Purpose |
|---|---|
| `.xlsx` with both `INVOICE` and `Details` sheets (Ticket/Passenger/Route columns) | Monthly invoice xlsx |
| Nested folder tree under the same dir | Per-ticket evidence folders |

**Discovery logic:**
- Prefers an xlsx whose filename matches `J\d+-\d+.xlsx` (Jawal's standard pattern)
- Finds the folder root by picking the sibling directory with the most subdirectories (≥3 qualifies)

**Folder-name patterns:**
- 10-digit ticket: `6905264385`
- Range pair (round-trip with shared PDF): `6905341979-80` → two ticket IDs
- Text reference (sponsorship vouchers): `RE ISHLT Toronto Hotel`, `sponsor payment form`, `CRM-2026-27 Approvals`

**4-pass matching:**
1. Exact 10-digit ticket ID against folder name OR PDF body text (via pymupdf)
2. Text Ref. No. from INVOICE sheet col 6 ↔ folder name (fuzzy substring + token overlap)
3. Route keyword (e.g. `TRAIN`) + passenger surname strict match in .msg
4. Passenger name strict match (all unique tokens in same PDF filename) with transliteration variants (MOHAMMED ↔ MOHAMED ↔ MOHAMMAD)

**PDF body-text extraction:** pymupdf opens each booking PDF and finds 10-digit ticket numbers embedded inside. Recovers round-trip second-leg tickets where Jawal names the folder after the first leg only. **Single biggest win** — match rate jumped from 82.9% → 94.8%.

**Catch categories:**
- `NO_FOLDER` — ticket on invoice with no matching evidence folder
- `NO_APPROVAL` — folder exists but no .msg approval email
- `DUP_ROUTE` — same passenger + same route + same date across multiple rows
- `EMD_FEE` — `1936*` ticket numbers = fare-adjustment EMD tickets paired with original 6905* booking; no separate folder expected (LOW severity informational)
- `VAT_MISMATCH` — uses Details col 13 `vat_class` (`KSA VAT STANDARD` → 15%, `KSA VAT ZERO` → 0%) as source-of-truth
- `PERSONAL_CONTRIB_SELF_APPROVAL` — detects `Personal Contribution Approval Requested for X by X` in .msg filenames where requester and approver are the same employee. **Real audit catch.**

**Output:**
- `matched/jawal-catch.json`, `matched/jawal-summary.json`, `matched/jawal-reconciliation.json`
- `dashboard/public/files/jawal-<batch>-resolved.xlsx` — original Details + 3 appended columns, colour-coded by severity (green=post-clean, amber=review, red=hold)

**Reference benchmark (April 24-30, 2026):**
- 115 distinct tickets (deduped from 117 rows; `26-689` is 3 rows for cost-center split)
- 95.7% match (110/115)
- 69 catches: 3 real NO_FOLDER, 6 NO_APPROVAL, 2 EMD info-only, 2 orphan, 56 self-approval audit catches
- SAR 9,070 actual at-risk (vs SAR 192K in v1 — 95% false-positive reduction)

---

## Common pipeline contract

All three pipelines emit Oracle-ready files that mirror the input format Aljeel finance already ingests. **Strategy: mirror input format, annotate at the edge.** Avoids forcing finance to learn a new template.

| Pipeline | Cost / batch | Model use |
|---|---|---|
| J&J | ~$0.10-0.20 per invoice re-extraction | Gemini 2.5 Flash (vision) + Claude Sonnet (catch prose only) |
| Asateel | ~$0.03 (5-PDF sample only) | Gemini 2.5 Flash (vision sample) |
| Jawal | $0 (pure Python, no model calls) | None |

Full batch reprocess: typically <$1.
