# v9 vs v10 Deltas - Lines that Changed

## Summary

v9 flipped 62 lines to PERSONAL (Account 11034013). v10 flips ZERO of those to PERSONAL.

All 62 lines that v9 misclassified as PERSONAL are now correctly handled:
- 40 classified as BUSINESS_TRIP (form Award = "Business Trip")
- 1 classified as ANNUAL_LEAVE_TICKET (form Award = "Expat Annual Travel")
- 21 classified as UNKNOWN (no .msg or form not parseable) - keeps resolver default

## Why this is correct

v9 fired on the subject line "Personal Contribution Approval Requested" with confidence 1.0.
v10 ignores this signal because "Personal Contribution" is the Workday module name.

### The 40 BUSINESS_TRIP lines (had form data):
All 40 have:
- Award name: "Business Trip"
- Award subtype: "Internal Business Trip"
- Trip Goals: Area Visit (12), Technical Support (13), Customer Meeting (5), Provide Training (5), Partner Meeting (2), Delivery (2), Attend Training (1)

These are clearly business travel. v9 called them personal based solely on the subject line.

### The 1 ANNUAL_LEAVE_TICKET line:
- SL 39: HOSNY ALI - RUH HMB RUH
- Award: "Expat Annual Travel"
- v9 called it PERSONAL, v10 correctly identifies it as annual leave benefit (Account 21070229)
- Golden also has this at 21070229, so v10 matches golden here

### The 21 UNKNOWN lines (no form data):
No .msg file found or form not parseable. v10 conservatively leaves them at resolver default.
v9 would have flipped these to PERSONAL based on subject alone.

## Net effect on Account distribution (J26-640)

| Account | v9 Count | v10 Count | Delta |
|---------|----------|-----------|-------|
| 60301003 (Travel) | 19 | 45 | +26 (restored from PERSONAL) |
| 60301004 (Travel G&A) | 25 | 26 | +1 |
| 60307021 (Sponsorship) | 6 | 32 | +26 (restored from PERSONAL) |
| 11034013 (Personal) | 62 | 0 | -62 (eliminated) |
| 21070229 (Annual Leave) | 0 | 1 | +1 (correctly identified) |
| 60308007 (Recruitment) | 0 | 0 | 0 |
| 60308009 (Training) | 2 | 1 | -1 |
