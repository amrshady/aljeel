# Codex brief — Sponsorship: (A) never classify as 21070229; (B) always prepend Ref. No. into Description (col K)

Batch J26-1140 (Jawal). Current output:
`batches/jawal-J26-1140/output/Spreadsheet-J26-1140-FILLED-v30.xlsx` (header row 3, data from row 4).
Frozen baseline (read-only, do not touch): `batches/jawal-J26-1140/output/_BASELINE-20260804T090631Z/`.
Active pipeline: `scripts/run_v30.py`, `scripts/process_batch.py`, `scripts/full_evidence_agent_v30.py`,
`scripts/cost_center_resolver.py`, resolver layers in `scripts/run_v17.py`.

REPORT THE DIFF ONLY. DO NOT edit-and-deploy, DO NOT `git push`. This is bundled with other fixes for a
single later deployment.

---

## Task A — HARD RULE: Sponsorship must NEVER be classified as Accrued Employee Annual Tickets (account 21070229)

A Sponsorship record (GL account `60307021`, "Sponsoring Expenses") must under NO circumstances end up
with final account `21070229` (Accrued Employee Annual Tickets). These are mutually exclusive.

- Find every place a row's final account can become `21070229` (family-cluster override, personal-contribution
  path, bundled-ticket shared-PDF propagation, trip-account override, booking-group PC propagation in
  run_v17.py, LLM overlay in run_v30.py ~5317, etc.).
- Add a guard so that if a row is (or resolves to) Sponsorship — signalled by account `60307021`, and/or
  OPEX/sponsorship evidence (OPEX serial, SPONSORSHIP_* flags, event-style Ref No like `EP-2026-21` /
  `CRM-2026-43` matched to sponsorship), the `21070229` override can never fire / is rejected.
- Prefer a single choke-point guard (e.g. right before the final account is written / in the override
  application) so it's robust regardless of which upstream path tried to set 21070229. If a sponsorship
  row somehow already got 21070229, it must be corrected back to the sponsorship account, and a flag like
  `SPONSORSHIP_ANNUAL_OVERRIDE_BLOCKED` recorded.
- Note the existing house rule in MEMORY: "sponsorship rows always emp_no blank". Keep consistent; do not
  regress that.

## Task B — Sponsorship Ref. No. must ALWAYS be prepended to Description (column K)

For Sponsorship records the Ref. No. must always appear before the description text in column K, e.g.
`EP-2026-21-ALOWAYYID/AHAD MS - ...` or `CRM-2026-43-AHMED ALMUHAYFIR - ...`.

Observed in current output:
- Row 44 CORRECT: K = `EP-2026-21-ALOWAYYID/AHAD MS - RUH JED MUC JED RUH (4860966793)`; BL Invoice Ref No
  = `EP-2026-21`; BM OPEX Serial = `EP-2026-21`. Ref came already embedded in the vendor's raw line.
- Row 45 CORRECT: K = `EP-2026-21-ALMALKI/AMAL MS - ...`; same as above.
- Row 20 WRONG: K = `AHMED ALMUHAYFIR - Sofitel Munich Bayerpost - 5 NTS. (26-1049)` — NO ref prefix.
  BUT the row DID resolve BL Invoice Ref No = `CRM-2026-43` (Agent Flag `INVOICE_REF_FOLDER_MATCH`),
  account = `60307021` (Sponsoring Expenses). BM OPEX Serial = `N/A`.

Root-cause hypothesis to confirm: column K is written from the vendor's raw invoice line. When the Ref. No.
is already embedded in that raw line (EP-2026-21-...) it shows; when the Ref. No. is only recovered
downstream (e.g. `CRM-2026-43` via invoice-ref folder match / OPEX resolution), it is never written back
into K. So row 20 has the ref in column BL but not prepended to K.

Investigate:
1. Exactly where column K ("Description") is populated and whether anything ever rewrites it.
2. The resolved Ref. No. source(s): `Invoice Ref No` (BL), OPEX Serial (BM), `_row_invoice_ref_no()` in
   run_v30.py (~2815), invoice-ref folder match (`resolve_invoice_ref_folder`, INVOICE_REF_FOLDER_MATCH).
3. Propose a fix: for Sponsorship rows (account 60307021), if a resolved Ref. No. exists and column K does
   NOT already start with that ref, prepend it as `<REF>-<existing description>` — matching the exact
   format already seen in rows 44/45 (ref, hyphen, then the description). Must be idempotent (never double-
   prepend if the ref is already there, including the `(26-1049)` style suffix which is a DIFFERENT token —
   do not confuse the trailing `(26-1049)` with the leading ref). Only apply to Sponsorship; leave non-
   sponsorship K untouched.

## Deliverable
- Root-cause writeup for B, confirmation of the choke-point for A.
- Minimal additive diffs (file+line) for both.
- Regression risk callouts; golden J26-640 must stay zero-diff. Confirm no change to non-sponsorship rows.
