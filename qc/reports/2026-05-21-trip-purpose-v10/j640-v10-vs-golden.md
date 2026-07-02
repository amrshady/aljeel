# J26-640 v10 vs Laith's Golden (Manual Resolution)

## Summary

| Version | Golden Match | Rate |
|---------|-------------|------|
| **v8 (baseline)** | 108/117 | 92.3% |
| **v9 (incorrect)** | 45/117 | 38.5% |
| **v10 (corrected)** | **110/117** | **94.0%** |

**v10 exceeds the target (>=108) and improves on v8 by 2 lines.**

## v10 Improvements over v8

v10 correctly classifies 2 lines that v8 missed:

| SL | Description | Golden | v8 | v10 | Why |
|----|-------------|--------|-----|-----|-----|
| 53 | MOHAMMED ALRESHIDAN - AIRPORT PICK UP | 60307021 | 60301004 | 60307021 | Sponsorship signal detected |
| 54 | MOHAMMED ALRESHIDAN - HOTEL - AIRPORT DROP OFF | 60307021 | 60301004 | 60307021 | Sponsorship signal detected |

## Remaining 7 lines where v10 differs from golden

These are the SAME 7 gaps that existed in v8 - not v10 regressions:

| SL | Description | Golden | v10 | Gap Reason |
|----|-------------|--------|-----|------------|
| 2 | ALWAKEEL/AMR - SPONSORSHIP | 60307021 | 60301003 | No .msg file with sponsor signal |
| 9 | ALI/HESHAM - JED | 60301004 | 60301003 | G&A division allocation (not trip purpose) |
| 10 | ALI/HESHAM - JED return | 60301004 | 60301003 | Same |
| 30 | ALI/HESHAM - JED | 60301004 | 60301003 | Same |
| 38 | SHARAWY/SALMA - new employee | 60308007 | 60301003 | Recruitment signal not in description |
| 112 | ALI/HESHAM - CMN | 60301004 | 60301003 | G&A division allocation |
| 113 | ALI/HESHAM - CMN return | 60301004 | 60301003 | Same |

Note: 5 of 7 are HESHAM ALI lines where golden posts to 60301004 (G&A travel). This is a DIV-888 allocation rule, not a trip purpose issue. The trip purpose classifier correctly identifies these as BUSINESS_TRIP; the account difference is in the DIV-based G&A routing.

## v10 vs v9 Delta

v9 wrongly flipped 62 lines from resolver default to 11034013 (Personal). v10 flips ZERO lines to Personal. All 62 lines that v9 misclassified are now correctly left as BUSINESS_TRIP.

## Trip Purpose Distribution (v10 J26-640)

| Purpose | Count | Account Override |
|---------|-------|-----------------|
| UNKNOWN | 44 | none (resolver default) |
| BUSINESS_TRIP | 40 | none (already default) |
| SPONSORSHIP | 32 | 60307021 |
| ANNUAL_LEAVE_TICKET | 1 | 21070229 |
| PERSONAL | 0 | - |

## Conclusion

v10 achieves the design goal: preserve v8's accuracy (108/117) while correctly identifying trip purposes from the Oracle Workday form body. The 2-line improvement (110 vs 108) comes from SPONSORSHIP catches that neither v8 nor v9 detected.

Zero PERSONAL classifications is correct for this batch - all "Personal Contribution" emails are business travel.
