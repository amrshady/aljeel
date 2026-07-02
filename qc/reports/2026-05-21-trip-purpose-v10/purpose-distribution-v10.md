# Trip Purpose Distribution - v10

## J26-640 (117 lines)

| Purpose | Count | % | Account Override | Notes |
|---------|-------|---|-----------------|-------|
| UNKNOWN | 44 | 37.6% | none | No .msg file found; keeps resolver default |
| BUSINESS_TRIP | 40 | 34.2% | none | Form Award = "Business Trip" |
| SPONSORSHIP | 32 | 27.4% | 60307021 | Subject signals (OPEX, CRM-codes, sponsor, congresses) |
| ANNUAL_LEAVE_TICKET | 1 | 0.9% | 21070229 | Form Award = "Expat Annual Travel" |
| PERSONAL | 0 | 0.0% | - | No explicit personal vacation signals in this batch |

### Form extraction success (of 74 lines with .msg files):
- 40 had full form with Award name extracted
- 34 had .msg but form not parseable (forwarded chains, non-standard formats)

## J26-788 (103 lines)

| Purpose | Count | % | Notes |
|---------|-------|---|-------|
| UNKNOWN | 103 | 100% | No .msg files available for this batch |

J26-788 has no raw email folder. All lines use the resolver default account. Trip classification will apply when .msg files are provided.

## Key Signals by Source

### Form body (highest confidence):
- Award = "Business Trip" -> BUSINESS_TRIP (40 lines, conf 0.95-1.0)
- Award = "Expat Annual Travel" -> ANNUAL_LEAVE_TICKET (1 line, conf 0.95)

### Subject line:
- OPEX / CRM-XXXX / sponsor / ISHLT / Barcelona / Vienna -> SPONSORSHIP (32 lines, conf 0.8-0.95)

### No signal:
- Lines without .msg or parseable form -> UNKNOWN (44 lines, conf 0.0)
