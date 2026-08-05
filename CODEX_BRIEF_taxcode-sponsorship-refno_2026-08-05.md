# Codex Brief — Jawal pipeline: 3 changes (single deploy)

Workspace: /home/clawdbot/.openclaw/workspace/aljeel
Primary script: scripts/run_v30.py (+ scripts/convert_jawal_invoice.py for Stage-1 column O)

Implement all three. Report the diff. Do NOT deploy. Preserve J26-640 golden (zero-diff expectation).

## Change 1 — Tax Classification Code (column O), route-based

Replace the current binary `vat_pct==15` rule. Vendor VAT % is UNRELIABLE (vendor mis-enters 15 vs 0) and must NOT decide the code.

Precedence (highest first):
1. Line amount (col M / *Amount) == 0  -> "KSA VAT ZERO".
2. Parseable flight/rail route present -> geography test on the route tokens
   (the "PASSENGER - XXX YYY XXX (ticket#)" segment; only real IATA-style
   3-letter tokens in that route segment, NOT stray uppercase words elsewhere
   e.g. hotel names like "RDC"): if ANY token is NOT on the KSA whitelist ->
   whole ticket "KSA VAT ZERO"; if ALL tokens are KSA -> "KSA VAT STANDARD".
   - Unrecognized token (neither confirmed KSA nor obviously intl) -> best-guess
     STANDARD if all-known-KSA otherwise ZERO, AND flag "TAX_CODE_UNKNOWN_TOKEN".
3. No parseable flight route (registration/event/meeting lines, e.g. DDW / ECS
   Munich / Crowne Plaza) -> attempt destination-text geography (city/country in
   description -> intl=ZERO, KSA=STANDARD) AND flag "TAX_CODE_NEEDS_REVIEW".
   Never silently finalize a no-route line.
4. Regardless of path: if vendor vat_pct disagrees with the derived code, emit an
   audit flag "VENDOR_VAT_MISMATCH" (do NOT change the code).

KSA airport IATA whitelist (locked):
RUH, JED, DMM, MED, AHB, ABT, HOF, RAE, BHH, DWD, ELQ, GIZ, URY, AQI, HAS, AJF,
QJB, EAM, NUM, RAH, SHW, SLF, TUU, TIF, TUI, WAE, EJH, YNB, ULH, ZUL, KMX, DHA,
HBT, MJH, AKH, KMC
Plus KSA rail-city tokens for TRAIN rows: RYD, MAK, MED, JED, DMM, HOF (Riyadh,
Makkah, Madinah, Jeddah, Dammam, Hofuf). Anything not listed = international.

Validation: must reproduce the clerk's corrected sheet
Copy_of_Spreadsheet-J26-1116-FILLED-v30 exactly on all flight rows, including:
- Multi-leg with any intl leg -> whole ticket ZERO (rows 40, 46, 51, 60, 69).
- All-KSA -> STANDARD.
- Zero-amount row 34 (JED EAM JED, amount 0) -> ZERO via rule 1.

## Change 2 — Sponsorship Emp_No guard (final workbook)

Reference draft: CODEX_sponsorship-refno-and-guard_2026-08-04.md — implement the
final-account guard BUT with one override: DO NOT blank Employee No.
Sponsorship rows KEEP their Employee No.

Guard: on final workbook, if account == "21070229" AND sponsorship evidence
(_row_has_sponsorship_evidence) -> force Account and Distribution Combination
segment to "60307021", append Agent Flag "SPONSORSHIP_ANNUAL_OVERRIDE_BLOCKED",
and LEAVE Employee No untouched. Keep hybrid_rows[i] consistent.

## Change 3 — Ref. No. in Description (col K)

Implement the stage-5.6 Description source fix from
CODEX_sponsorship-refno-and-guard_2026-08-04.md Task B: prefer Invoice Ref No
(BL) then fall back to OPEX Serial; idempotent anchored prefix; treat Invoice
Ref No column as optional so J26-640 (no BL column) is unchanged.

## Regression
Run/inspect J26-640 golden: expect zero diff. Report any row that changes.
