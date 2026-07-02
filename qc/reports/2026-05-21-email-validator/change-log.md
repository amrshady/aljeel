# Change Log — Email-as-Validator (2026-05-21)

## New Files Created
| File | Lines | Purpose |
|------|-------|---------|
| `scripts/oracle_form_parser.py` | ~250 | Deep-body Oracle Fusion form extractor (EN + AR) |
| `scripts/opex_pdf_parser.py` | ~180 | OPEX PDF attachment parser via Gemini 2.5 Flash |
| `scripts/sponsorship_detector.py` | ~80 | Heuristic sponsorship/HCP email detector |

## Files Modified
| File | Change |
|------|--------|
| `scripts/process_batch.py` | Added validator step (A4): finds .msg for each line, runs form parser → OPEX parser → sponsorship detector cascade, adds 9 new columns to Excel output |
| `qc/qc_gates.py` | Added 8 new soft gates (S12-S19) for form validation flags |

## Backups
- `scripts/process_batch.py.bak-pre-validator-20260521-b`
- `qc/qc_gates.py.bak-pre-validator-20260521`

## Design Decisions

### Oracle Form Parser (`oracle_form_parser.py`)
- Finds the **standalone** "Personal Contribution" / "الإسهام الشخصي" header (not subject-line mentions) by requiring the pattern: `header → name → Person Number XXXXXXX`
- Multi-language: handles both English form fields and Arabic equivalents (mixed AR/EN emails are common)
- Robust field extraction via `_extract_field()` with stop-labels to prevent capturing the next field's label as a value
- Eastern Arabic numeral (٠١٢٣٤٥٦٧٨٩) → Western conversion for dates and amounts
- Confidence scored on 8 key fields: emp_no, emp_name, value, trip_start_date, division, agency, solution, approver

### Validator Flow (in `process_batch.py`)
1. Find .msg files by ticket number (10-digit parenthetical in Description)
2. Run oracle_form_parser → if form found, extract all fields
3. If no form, try opex_pdf_parser (for CRM/OPEX/event emails with PDF attachments)
4. If neither, try sponsorship_detector (heuristic)
5. Compare form-extracted employee number vs Manpower-derived
6. Compare form approver vs line manager in Manpower
7. Compare form trip value vs invoice amount
8. Log Fusion internal codes (Division/Agency/Solution) for future mapping

### Gate Classifications
- FORM_AGREES_WITH_MANPOWER → S12 (soft, informational)
- FORM_EMP_NO_MISMATCH → S13 (soft, HOLD for review — NOT hard reject, since many are legitimate booking-for-subordinate cases)
- FORM_APPROVER_NOT_LINE_MANAGER → S14 (soft)
- FORM_TRIP_VALUE_DIFFERS → S15 (soft — form value is trip allowance, invoice is ticket price)
- FORM_NOT_FOUND_IN_EMAIL → S16 (soft)
- FORM_FUSION_CODES_LOGGED → S17 (soft, placeholder until Fusion→Manpower mapping obtained)
- OPEX_PDF_PARSED → S18 (soft)
- SPONSORSHIP_DETECTED → S19 (soft)

### Value Difference (FORM_TRIP_VALUE_DIFFERS) — Expected High Count
The Oracle Fusion form's "Value" field is the **trip allowance/perdiem budget** approved in Fusion, NOT the ticket price. The invoice amount in the spreadsheet is the actual ticket price from Jawal Travel. These differ by design:
- Form: 1,750 SAR (approved budget including transportation, perdiem)
- Invoice: 1,700 SAR (actual flight ticket)
This flag is informational, not a blocker.
