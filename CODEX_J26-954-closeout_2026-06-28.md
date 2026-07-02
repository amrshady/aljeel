Implemented closeout pass. No deploy; only batch scratch outputs regenerated.

**Task A**
ALEM return leg: Yes. `4860132150` is now `60308009`.

Rule added: sibling ticket legs inherit trip-purpose/account only when a leg with its own approved form shares the same itinerary PDF evidence with sibling tickets, has booking/PNR refs in that PDF, and passenger tokens match. It does not use ticket allowlists or adjacency alone.

Proof:
`4860132150` final combo:
`03-10100-60308009-160012-194-00000-10153-00000-00-000000`
Flags include `INHERITED_TRIP_PURPOSE_FROM_SIBLING:4860132149`.

**Task B**
Fix 4 rerun end-to-end: confirmed for CRM-2026-39 ancillary rows. Rania pickup/dropoff now inherit event allocation and no stale `MISSING_EVIDENCE` remains. Zaitouni hotel/transport inherited CRM-2026-39 allocation where matching event evidence existed; one Rania hotel row `26-893` remains hard missing because it has no approval email, so not acceptable to force.

Fix 5: done. `4860165204` / EP-2026-17 is now `OPEX_EMAIL_ONLY`, human-review, no exact combo stamped:
- Account: `60307021`
- Distribution Combination: blank
- Evidence Folder Status: `OPEX_EMAIL_ONLY`
- QC: `OPEX_EMAIL_ONLY_REVIEW(MEDIUM)`

**Task C**
| Rows | Verdict | Evidence | Action |
|---|---|---|---|
| `6906462516` split | `WE_CORRECT` | OPEX-SIS-15-2026-J-2026-122: Agency `ERBE`, lookup `10043`; Labadi used salesman home agencies `10041/10156/10041`. | Left ours `10043`. |
| `6906529009`, `6906529010` | `LABADI_CORRECT` | OPEX-LAB-16-2026J-2026-126 scan/OCR: Bio-Rad event/allocation; lookup `10111`. | Fixed generally with OCR unique-agency lookup fallback. |
| `4860165225` split | `WE_CORRECT` | Governing ticket evidence found only in DBE - Training for Qassim; OPEX-SIS-14-2026-J-2026-123: Agency `Fujifilm`, lookup `10041`. | Left ours `10041`; no SIS-15 ticket evidence found. |

**Counts**
Final Labadi comparison:
- Strict `ticket+pax+amount`: `120/128`
- Broad `ticket+amount`: `134/142`

Baseline given: broad `127/136`; current broad is +7 matched instances, with a larger comparable split-key set. Final residual broad diff CSV:
`batches/jawal-J26-954/output/diff-vs-labadi-closeout.csv`.

**Changed Files**
Code/tests:
- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py)
- [tests/test_structural_allocation_rules.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_structural_allocation_rules.py)

Regenerated scratch outputs:
- `batches/jawal-J26-954/output/Spreadsheet-J26-954-FILLED-v30.xlsx`
- `batches/jawal-J26-954/output/Spreadsheet-J26-954-FILLED-v30-SPLIT.xlsx`
- `summary-v30.json`, `score-v30.md`, `step-trace-v30.jsonl`
- `fraud-watch-v24.json`, `catches-booking-groups-v30.json`
- `diff-vs-labadi-closeout.csv`

Verification:
- `python3 -m py_compile ...` passed.
- Focused direct regression harness passed.
- `pytest` is not installed, so I could not run pytest directly.

No hardcoding added: no ticket numbers, employee IDs, names, allowlists, per-row overrides, or magic row constants. Rules are driven by form/PDF/email evidence, booking refs, passenger matching, OCR text, and lookup/master data.
