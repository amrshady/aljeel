Read-only audit complete. Distribution Combination was treated as upload-authoritative; the inconsistent Account helper cells were not used as truth.

## Verdicts

| # | Row | Verdict | Why |
|---|---|---|---|
| 1 | `4860576027` — HF-2026-28 flight | **A — SAFE DETERMINISTIC FIX** | The exact invoice ref links the row to an approved HF sponsoring form with attendee Mossaed Al Hussein and allocation employee `1002483`. This is explicit sponsorship evidence, not an inferred account policy. |
| 2 | `4860576079` — CRM-2026-42 flight | **A — SAFE DETERMINISTIC FIX** | CRM-2026-42’s Sponsoring Payment Form explicitly lists Rawa as an attendee and allocates the event to `1001959`. The employee-looking passenger classification incorrectly overrides that stronger form evidence. |
| 3 | `26-1025` — HF-2026-28 car | **A — SAFE DETERMINISTIC FIX** | Account is already correct. The row was rebound to CE-20-2026, producing the CE allocation pair and CE segments. Exact HF event binding mechanically determines the correct folder and allocation. |
| 4 | `4860528692` — Singapore | **B — NEEDS FINANCE POLICY DECISION** | The approval explicitly says technical training, but the repository’s policy still does not establish that every approved employee training trip must use `60308009` rather than travel. |
| 5 | `4860528696` — Lyon | **B — NEEDS FINANCE POLICY DECISION** | The Oracle approval explicitly says `Trip Goal: Attend Training (Technical/Non-Technical)`, but mapping that purpose to `60308009` still requires Finance’s definition and exception rules. |

## Sponsorship findings

### Rows 1 and 2 require an additional fix

The J26-1140 ordering and binding fixes are not sufficient by themselves because both late passes require the row to have settled on account `60307021`.

The principal mechanical defect is in [`_build_sponsoring_form_folder_index()`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2059):

- It only examines filenames matching `OPEX-*.pdf`.
- HF-2026-28’s form is named `APPROVED-OPEX-HF-2026-28-J-2026-141.pdf`, so the anchored filename test excludes it.
- CRM-2026-42’s form is named `0094.pdf`; its content clearly says “Sponsoring Payment Form” and contains Event Allocation Details, but its filename also excludes it.
- Elsewhere, [`_find_opex_pdfs()`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:899) already has the correct content-aware recognition: an OPEX filename or PDF text containing Sponsoring Payment Form plus Event Allocation Details.

Consequently, `_sponsoring_form_folder` is not attached at initialization. For row 2, Call 2 actually returns sponsorship, but `apply_overlays_v16()` changes it back to travel because Call 1 classified the IATA-formatted passenger as an employee. Row 1 likewise never receives deterministic event-form promotion.

Minimal safe fix:

1. Build the sponsoring-form index from `_find_opex_pdfs(folder)` rather than the narrower `re.match("OPEX-...")`.
2. When an exact normalized Invoice Ref No/event key resolves to a parsed sponsoring form with a valid allocation table, promote the row to `60307021` before the late allocation pass. This evidence must outrank the generic “IATA name looks like employee” classification.
3. Preserve the exact event folder on the row, then let the existing allocation and event-segment passes populate employee and segments.
4. Normalize sponsorship location through the established sponsorship/requester location path. Do not retain the row’s ordinary-travel location (`10100` or `40100`) after authoritative event promotion; these forms/requester records lead to the expected `20100`.

Expected deterministic results:

- Row 1 → HF-2026-28, `60307021`, `160014-170-10050-10072`, employee `1002483`.
- Row 2 → CRM-2026-42, `60307021`, `160014-170-10017-10072`, employee `1001959`.

The helper Account conflict on row 1 does not make this a policy case: the authoritative combo and actual sponsoring form agree.

### Row 3 should already be corrected by the J26-1140 fixes

For row 3, the current artifact has `_evidence_folder` effectively settled on the wrong CE event, hence:

- OPEX serial `CE-202-26`
- allocation employees `1002075,1001986`
- segments `160011-196-00000-10100`

The revised [`_sponsorship_event_folder_for_row()`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1439) checks the exact non-SIS invoice serial, rejects the mismatched event identity, and resolves the indexed HF-2026-28 form. The corrected pass order then runs [`apply_sponsorship_allocations()`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2199) before [`apply_sponsorship_event_segments()`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1634).

On a fresh regeneration, that should yield:

- HF allocation employee `1002483`
- HF home/event block `160014-170-10050-10072`
- location `20100`
- account remains `60307021`

No additional row-3-specific rule should be necessary. Add a regression test, but first verify it through the normal fresh regeneration after fixing rows 1–2’s form indexing.

## Training rows: evidence versus policy

Both rows contain machine-readable training evidence:

- `4860528692`: “my next technical training to Singapore,” `Trip Goal: Attend Training`, and “attend Revvity technical training.”
- `4860528696`: Oracle approval contains `Trip Goal: Attend Training (Technical/Non-Technical)`.

Therefore, detecting `TRAINING` is deterministic. What is not currently authorized is the accounting implication:

> Does every approved employee trip whose Oracle Trip Goal is training use `60308009`, or only particular training types, budgets, organizers, registrations, or cost ownership arrangements?

The current notes explicitly retain this as an open AlJeel-definition gap. Thus:

- This is not purely an inscrutable clerk judgment—the source contains a strong structured signal.
- It remains a Finance policy decision because the purpose-to-GL mapping and its exceptions are undefined.
- Once Finance confirms a rule such as “approved Oracle Trip Goal = Attend Training always maps airfare and related travel to `60308009`,” it can be implemented deterministically using the parsed approval field, preferably requiring an approved form and a high-confidence exact ticket-folder link.
- Do not implement a bare keyword rule such as destination/email text containing “training”; that would invent scope and risk misclassifying sponsorship or ordinary travel associated with training events.

## Finance escalation

Escalate these rows:

- `4860528692`
- `4860528696`

Ask Finance to define:

1. Whether an approved `Trip Goal: Attend Training (Technical/Non-Technical)` mandates `60308009`.
2. Whether the rule covers airfare, hotel, ground transport, registration, or only some components.
3. Whether internal product/service training, vendor training, and conferences are treated differently.
4. Whether an OPEX/event sponsorship form overrides the employee-training rule.

## Recommended order

1. Fix content-aware sponsoring-form indexing and exact-event promotion for rows 1–2.
2. Retain the J26-1140 allocation-before-segment ordering and folder-binding guard; add J26-1108 regression cases for rows 1–3.
3. Freshly regenerate and confirm row 3 is corrected without a special-case rule.
4. Obtain Finance’s `60308009` definition.
5. Only then implement a structured approval-driven training-account rule for rows 4–5 and similar cases.

No files were edited, and the pipeline was not run.

[status: done rc=0]
