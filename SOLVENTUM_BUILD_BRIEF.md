# Solventum Chargeback — Codex Build Brief

## Objective
Add **Solventum** as a THIRD supplier option in the AP portal (ap-aljeel.accordpartners.ai, clerk-side), next to the existing Jawal and Asateel choices. Minimal, additive change. Do NOT refactor, restyle, or alter Jawal/Asateel behavior.

## What Solventum does (NOT Oracle, NOT the Jawal/Asateel reconciliation pipeline)
Clerk uploads:
1. exactly ONE "JUNE SALES" Excel workbook, and
2. one or more POD (proof-of-delivery) PDFs (named by TRX/invoice number).

Clerk clicks **Run** → system produces a "Chargeback report supported by PODs" Excel (same shape as samples) → clerk downloads it. AP-only; suppliers never see it.

## Derivation logic (VERIFIED against Drive samples — 1:1 row match)
1. Read all sales line rows from JUNE SALES workbook, sheet named **Sheet2** (header row 1). Key column = `TRX #`.
2. Collect TRX numbers from POD PDF **filenames** (do NOT OCR the PDFs). Extract every 10-digit `2600xxxxxx` token from each filename. A single PDF may bundle multiple TRX (e.g. `2600014513, 26125380 checked.pdf` → treat each 2600-prefixed 10-digit number as a covered TRX).
3. Keep only sales lines whose `TRX #` is in the POD-backed set.
4. Output ONE chargeback row per sales line (not one per invoice).
5. Silently drop sales lines without a POD. **NO warning, NO dropped-TRX notice** (per Ahmed 2026-08-13). Output = POD-backed rows only.

## Output columns (exact order)
`TRX # | TRX Date | Order Type | Account Name | Ship Address | Item Description | Manufacturer | Agency | Lot Number | Quantity | UOM`

## Column source mapping (all from JUNE SALES Sheet2)
| Output column | Source column | Transform |
|---|---|---|
| TRX # | TRX # | as-is |
| TRX Date | TRX Date | as-is |
| Order Type | Order Type | as-is |
| Account Name | Account Name | as-is |
| Ship Address | Ship Address | as-is |
| Item Description | Item Description | as-is |
| Manufacturer | Manufacturer | **strip leading `3MOC-` or `3MOR-` prefix** (catalog/part code, not brand) |
| Agency | Agency | as-is (`Solventum`) |
| Lot Number | Lot Number | as-is |
| Quantity | Quantity | as-is |
| UOM | UOM | as-is |

Output xlsx filename styled like the samples: `Chargeback report supported by PODs attached.xlsx` (single sheet `Sheet1`, header row identical to columns above).

## UX / product decisions (LOCKED, do not re-ask)
- Trigger: file uploader + explicit **Run** button. NO auto-generation. Uploader must let clerk add/remove files one by one.
- Run gate: block Run until exactly ONE sales workbook (.xlsx/.xls) AND >=1 POD PDF are present. If TWO+ workbooks added, flag it and block (do not guess).
- Dropped TRX: silent, no warning. POD-backed rows only.
- Visibility: AP/clerk-side only. No supplier-facing Solventum tab. Suppliers must not see the chargeback.
- UI copy: make clear the chargeback includes only POD-backed invoices.

## Codebase anchors (already mapped — verify, don't re-derive)
- Frontend: Cloudflare Pages project `aljeel-ap-finance`, source `dashboard/public/`.
  - `dashboard/public/_worker.js` routes `/` → `portal-v2.html` (v2 SPA in `dashboard/public/v2/`), `/portal` → `portal.html` (v1). Worker proxies `/api/*` and `/evidence/*` to droplet API `https://aljeel-ap.accordpartners.ai` (CF Tunnel → localhost:5000).
  - Determine whether the LIVE clerk portal is v2 SPA (`portal-v2.html` + `v2/`) or v1 (`portal.html`). Add the Solventum choice wherever Jawal/Asateel choices actually render for the clerk. Investigate both; implement in the live one.
- API: `scripts/droplet_api_flask.py` (systemd `aljeel-flask.service`, port 5000).
  - Existing `/upload` accepts xlsx-only and saves to `uploads/portal/<uuid>/`. `/process` runs the Jawal/Asateel pipeline via SSE. `/download/<batch>/<kind>` streams result xlsx.
  - Solventum needs: accept PDF uploads too (new endpoint or param — do NOT loosen the existing xlsx-only `/upload` used by Jawal/Asateel; add a separate Solventum upload path), a Solventum run endpoint that invokes the new generator, and a download for the generated chargeback.
- New pipeline script: create `scripts/solventum_chargeback.py` (pure Python, openpyxl) implementing the derivation logic above. Standalone + importable. Include a CLI: `python3 scripts/solventum_chargeback.py --sales <xlsx> --pods <dir-or-list> --out <xlsx>`.

## Reference/sample files (on droplet)
`/home/clawdbot/.openclaw/workspace/aljeel/batches/solventum/`
- `JUNE_SALES_2026.xlsx` (source; Sheet2 = full detail, 851 rows)
- `chargeback_1st_wave_SAMPLE.xlsx` (target shape; 14 TRX → 52 rows)
- `chargeback_2nd_wave_SAMPLE.xlsx` (target shape; 25 TRX → ~86 rows)
Verify your generator reproduces the sample row counts and column values when given the sample JUNE SALES + the wave's POD filenames.

## Constraints
- Additive only. Jawal + Asateel must keep working unchanged (verify).
- No Oracle output for Solventum.
- NO deploy / no `wrangler pages deploy` / no service restart. Report the diff + files touched; the operator decides on deploy.
- Follow Accord brand guidelines (Inter, navy #1E40AF, action #2563EB, cards radius 8, Lucide icons) for any new Solventum UI — but ONLY the new Solventum surface; do not restyle the rest.

## Deliverable
- `scripts/solventum_chargeback.py` (new generator + CLI).
- Frontend diff adding Solventum as a third choice + uploader (add/remove files) + Run button + chargeback download, clerk-side only.
- Flask diff: Solventum upload (xlsx + pdf), run, download endpoints — additive, not touching existing routes' behavior.
- A short SELF-TEST run against the two sample waves proving row counts + columns match.
- Report the full diff; do NOT deploy.
