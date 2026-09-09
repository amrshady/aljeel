# GL Account Map — Oracle Fusion AP coding reference

Placeholder for Oracle Fusion GL accounts referenced in batches. Populated as accounts appear in matched outputs.

Aljeel runs on Oracle Fusion for AP. This agent does NOT replace Oracle — it pre-resolves exceptions before invoices post and produces an Oracle-ready file that finance ingests as-is.

---

## Coded so far

(Empty — populate from Oracle PO-match reports as batches are processed.)

| Account Code | Description | Used by | Notes |
|---|---|---|---|
| | | | |

---

## How to populate

When a new batch's Oracle PO-match report contains a GL code not yet in this table:
1. Extract the GL code + description from the Oracle Excel
2. Append a row to the table above
3. Note which vendor / pipeline first used it
4. Flag any ambiguous mappings (e.g. "same description, different code across batches") in known-issues.md

---

## Travel account default — cost-center → 60301003 vs 60301004 (confirmed 2026-08-18)

Jawal travel-ticket rows default to a travel expense account driven by the row's cost center:
- **60301003** — Travel Tickets Expense (Business/S&M related)
- **60301004** — Travel Cost Expense G&A (G&A employees, DIV 888)

**AP-clerk confirmed rule (Ahmed Samy, 2026-08-18):** travel expenses under **Sales (S&M) and Maintenance (Technical Services)** cost centers post to **60301003**. Everything else (G&A / back-office, DIV 888 and other non-S&M/non-maintenance CCs) posts to **60301004**.

- **Sales / S&M** → 60301003: e.g. 160011 Capital Equipment (DIV 196), 160012 IVD Solutions (DIV 194), 160013 Dental & Medical Solutions, 160014 Contribution (DIV 170)
- **Maintenance / Technical Services** → 60301003: 200010 Technical Services (DIV 120), 250010 Technical Services HO (DIV 120)
- **Everything else** → 60301004: e.g. 130010 Finance (DIV 888), 130020 Collection (DIV 888), 140020 Operation (DIV 190)

**CORRECTION (2026-08-18):** Finance is NOT in the 003 list. "Sales" was mis-mapped to Finance; the clerk actually said **Maintenance and Sales**. Finance sits in DIV 888 (G&A) and the J26-1140 clerk output confirms Finance travel → **60301004**.

Underlying determinant is really the division/solution, not a CC name allowlist: S&M solution divisions (194/196/170-EP etc.) and Technical Services (DIV 120) → 003; G&A (DIV 888) and Operation → 004. Pipeline rules observed in J26-1140: `L8_sm_travel: DIV=194/196` and `L7.5_reverse_mgr_sm_travel` → 003; `v4_preserved: 60301004` for G&A.

Note: the "003 for Sales/Maintenance CCs / 004 otherwise" logic also governs **"Provide training"** rows — confirmed for both plain travel and Provide-training.

### Training trips (confirmed 2026-08-18, Ahmed Samy)
- **"Provide training"** (employee travels to deliver training): cost center decides.
  - CC in the 003 list above (Sales/S&M or Maintenance/Technical Services) → **60301003**
  - otherwise → **60301004**
- **"Take training"** (employee travels to receive training): stays under **60308009** (Training Expenses) — the CC rule does NOT override this.

Pending: full Oracle CC→account list for the remaining CCs (whether every non-G&A CC → 003, or an explicit per-CC map). Until the full list lands, treat the three CCs above as the confirmed 003 anchors.

---

## Standard catch-coding heuristics (vendor-side)

Even without the full Oracle GL master, certain catch types map to standard AP accounts:

| Catch | Likely Oracle account class | Reviewer should verify |
|---|---|---|
| Asateel ALLOC_MISMATCH | Suspense / pending allocation | Re-run allocation Excel |
| Asateel DUP_JQ_STRICT | AP control / payable | Verify before posting payment |
| Jawal NO_FOLDER | Travel expense | Block posting until evidence provided |
| Jawal PERSONAL_CONTRIB_SELF_APPROVAL | Employee receivable | Route to manager for approval |
| J&J quantity mismatch | Inventory variance | GR adjustment or vendor credit memo |

These are heuristics, NOT canonical coding. Aljeel finance owns the final account-code decision.
