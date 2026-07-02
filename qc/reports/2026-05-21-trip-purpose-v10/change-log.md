# v10 Trip Purpose Classifier - Change Log

## Changes from v9

### 1. Subject-line "Personal Contribution" no longer triggers PERSONAL classification
- **v9:** Subject "Personal Contribution Approval Requested" -> PERSONAL (confidence 1.0)
- **v10:** Subject "Personal Contribution" is IGNORED for classification. It is the Oracle Workday HCM module name for travel allowance requests, not a trip purpose indicator.
- When no form data is available, "Personal Contribution" subject defaults to BUSINESS_TRIP (confidence 0.6)

### 2. Form body is now the AUTHORITATIVE classification source
- **New Rule 1 (highest priority):** Read Award name, Award subtype, and Trip Goal from the Oracle Fusion form body (extracted by oracle_form_parser.py)
- Priority: Award name -> Trip Goal -> Subject line -> Invoice line markers

### 3. oracle_form_parser.py enhanced with 3 new fields
- award_name: Extracted from the "New Awards" section (e.g., "Business Trip", "Expat Annual Travel")
- award_subtype: Line after award name (e.g., "Internal Business Trip")
- accommodation_type: Extracted from "Accommodation Type" field

### 4. Classification matrix corrected

| Award Name | Trip Goal | v10 Purpose | Account |
|---|---|---|---|
| Business Trip | Any business goal | BUSINESS_TRIP | 60301003 (default) |
| Expat Annual Travel | * | ANNUAL_LEAVE_TICKET | 21070229 |
| Annual Leave | * | ANNUAL_LEAVE_TICKET | 21070229 |
| * | Personal Vacation | PERSONAL | 11034013 |
| Vacation / Leisure | * | PERSONAL | 11034013 |

### 5. Family cluster logic tightened
- **v9:** Any family cluster (same surname + overlapping route) -> auto-flip to PERSONAL
- **v10:** Requires BOTH family cluster AND (CHD) child markers before flipping to PERSONAL
- Clusters without CHD markers are flagged but NOT auto-flipped

### 6. Conservative defaults
- UNKNOWN -> keeps resolver default account (effectively BUSINESS_TRIP)
- No aggressive auto-classification without explicit form or subject signals
- This reverses v9's bias toward PERSONAL

## Files modified
- scripts/trip_purpose_classifier.py - full rewrite of rules (scaffolding preserved)
- scripts/oracle_form_parser.py - added award_name, award_subtype, accommodation_type extraction
- scripts/process_batch.py - family cluster logic updated (require CHD for flip)
