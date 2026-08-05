# Codex Brief — Promote sponsorship rows via Invoice Ref No when ticket PDF isn't bundled (HF-2026-27 class)

TWO-PHASE. File: scripts/run_v30.py (primary). MINIMAL, surgical.
Phase 1 = ANALYZE + confirm root cause (read-only, report findings + proposed diff).
Phase 2 = IMPLEMENT the minimal fix, show unified diff, run `python3 -c "import ast; ast.parse(open('/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py').read())"`.
Do NOT run the full pipeline. Do NOT deploy/upload. Do NOT touch unrelated code.

## Context — batch J26-1080
Sponsorship promotion overlay was recently reworked to anchor on the OPEX-form event key + parseable Event Allocation Details table (event-key overlay at run_v30.py ~5362-5452; helpers `_opex_pdf_event_key` ~273, `_row_event_key` ~311 [Ref No now first], `_build_sponsoring_form_folder_index` ~1908, allocation parser `_extract_sponsorship_allocations_from_opex_pdf` ~1847). CE-20-2026 and CRM-2026-39 now work.

## The bug (4 rows still wrong)
Event HF-2026-27 is a sponsorship. The OPEX form `raw/01-07jul/03jul/HF-2026-27/Makkah-Hotel_ticket_and_transportation/OPEX-HF-2026-27-J-2026-137.pdf` (and an identical copy in `07jul/...`) parses **1** allocation: emp 1002483 Rawad Malaeb, 8,000. event_key=HF27.

Output rows keyed on Invoice Ref No `HF-2026-27`:
- rows 74 (ticket 4860528605, ALANAZI/SHAMSAH) and 77 (ticket 4860528609, ALKAF/FAHMI): CORRECT → 60307021, emp 1002483. Their ticket PDFs live in the **07jul** folder named `MS_SHAMSAH_ALANAZI-8Q2HX8.pdf` / `MR_FAHMI_ALKAF-8Q3YGQ.pdf` and were bundled by the ticket-pdf-scan.
- rows 26 (ticket 4860401323), 27 (ticket 4860401324), 80 (ticket 1950089142), 81 (ticket 1950089147): BROKEN → account BLANK, emp BLANK, trace "All 9 layers failed". Same 2 passengers, same event, real amounts (1565.22/1565.22/503.48/592.17). Their supporting PDFs are in the **03jul** HF folder but named by passenger (`Dr_Fahmi_Alkaf.pdf`, `Ms_Shamsah_Alanazi.pdf`) — NOT by ticket number — so ticket-number bundling missed them and they never reached the event-key overlay.

## Phase 1 — confirm root cause
Trace WHY rows 26/27/80/81 are not promoted while 74/77 are, given all six share Invoice Ref No `HF-2026-27` and the event folder is in the sponsoring-form index (event_key HF27). Identify the exact gate/branch (e.g. the overlay only fires for rows already bundled into the folder via ticket-pdf-scan, or requires the passenger surname to appear in a .msg, or requires a per-row folder). Report file:line.

## Phase 2 — minimal fix (implement)
Promote a row to sponsorship using the event-key overlay when its **Invoice Ref No canonicalizes to an event key present in the sponsoring-form folder index**, EVEN IF no ticket-numbered PDF was bundled for that row. Reuse existing machinery:
- `_row_event_key` already returns HF27 for these rows (Ref No is now first in precedence).
- `_build_sponsoring_form_folder_index` already maps HF27 → the HF folder.
- The event-key overlay should match on that event key and stamp account 60307021 + the OPEX allocation employee(s) + proportional split, exactly as it does for rows 74/77.
Constraints:
- Do NOT invent amounts: each row keeps its own source Amount (col 13); only the ACCOUNT and emp/allocation attribution come from the OPEX form. (rows 26/27/80/81 already have correct source amounts; they just need account + emp.)
- When the OPEX form has a single allocation employee (1002483 here), all matched sponsorship tickets for that event attribute to that employee (same as rows 74/77 already do).
- Keep the safety property: if Ref No does NOT map to a parseable sponsoring-form folder, do nothing (leave as-is).
- Do NOT change behavior for rows that already resolve correctly (74/77, CE-20, CRM-2026-39, EP-2026-18).
- Do NOT touch the EP-2026-18 zero-amount rows (28/29/30): their source Amount is genuinely 0 — correct as-is.

## Deliver
1. Phase 1 root-cause writeup (file:line of the blocking gate).
2. Phase 2 unified diff.
3. `ast.parse OK`.
4. One sentence predicting rows 26/27/80/81 will now be 60307021 emp 1002483 with their own amounts retained, and confirming 74/77/CE-20/CRM-39/EP-18 unchanged.
Do NOT run the pipeline or deploy.
