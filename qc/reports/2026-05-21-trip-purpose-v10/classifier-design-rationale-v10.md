# v10 Trip Purpose Classifier - Design Rationale

Built 2026-05-21. Fixes the systemic misread in v9.

## The v9 Misread

"Personal Contribution Approval Requested" in email subject lines was interpreted as "personal/vacation trip." This was WRONG.

**"Personal Contribution" is the Oracle Workday HCM MODULE NAME** for paying out employee per-diem and travel allowances. It is the mechanism, not the purpose.

### Verified by reading actual form bodies:
- **46 emails** in J26-640 have "Personal Contribution" in subject
- **44 of 46** have Award name = "Business Trip" with Trip Goals like "Area Visit", "Customer Meeting", "Technical Support"
- **2 of 46** have Award name = "Expat Annual Travel" (annual benefit ticket)
- **0 of 46** have any personal vacation indicator
- "Accommodation Type: Personal" means self-arranged accommodation (employee stays with family/own apartment), NOT vacation
- "Perdiem Class: ...Personal" is a per-diem rate code, NOT a trip purpose

## v10 Design: Form Body First

### Classification Priority (deterministic, zero LLM):

1. **Form body Award name + Trip Goal** (AUTHORITATIVE)
   - Award = "Business Trip" -> BUSINESS_TRIP (95% of cases)
   - Award = "Expat Annual Travel" / "Annual Leave" -> ANNUAL_LEAVE_TICKET
   - Trip Goal = "Personal Vacation" -> PERSONAL
   - Award = "Vacation" / "Leisure" -> PERSONAL
   
2. **Subject-line signals** (for non-Personal-Contribution emails only)
   - "Business Trip Approval" -> BUSINESS_TRIP
   - "sponsor" / OPEX / CRM-XXXX / IEPC / ISHLT -> SPONSORSHIP
   - "annual ticket/leave" -> ANNUAL_LEAVE_TICKET
   - "Personal Contribution" WITHOUT form -> BUSINESS_TRIP default (0.6 conf)
   
3. **Invoice-line markers** (for remaining UNKNOWN lines)
   - Event codes in description -> SPONSORSHIP
   - (CHD) markers -> flagged for family cluster, NOT auto-PERSONAL
   
4. **No signal -> UNKNOWN** (conservative, keeps resolver default)

### Family Cluster Logic (v10 change):
- Same surname + overlapping route + (CHD) child markers -> PERSONAL
- Same surname + overlapping route WITHOUT (CHD) -> flagged only, NO auto-flip
- This prevents false PERSONAL on same-surname business travelers

## Worked Examples

### Example 1: Belal Mahmoud (BUSINESS_TRIP)
- Subject: "Personal Contribution Approval Requested for Belal Issa Mahmoud"
- Form Award: "Business Trip" / "Internal Business Trip"
- Trip Goal: "Area Visit"
- Route: Riyadh -> Jeddah
- **v9 classification:** PERSONAL (WRONG - based on subject)
- **v10 classification:** BUSINESS_TRIP (CORRECT - Award = Business Trip, Goal = Area Visit)

### Example 2: Yousef AlDighrir (BUSINESS_TRIP)
- Subject: "Personal Contribution Approval Requested for Yousef Saleh AlDighrir"
- Form Award: "Business Trip" / "Internal Business Trip"
- Trip Goal: "Technical Support (Periodic and Preventative Maintenance)"
- Route: Jeddah -> Al-Baha
- **v9 classification:** PERSONAL (WRONG)
- **v10 classification:** BUSINESS_TRIP (CORRECT)

### Example 3: Hosny Ali (ANNUAL_LEAVE_TICKET)
- Subject: "Personal Contribution Approval Requested for Hosny Ali Ali"
- Form Award: "Expat Annual Travel"
- Route: RUH -> HMB
- **v9 classification:** PERSONAL (WRONG - this is annual benefit, not vacation)
- **v10 classification:** ANNUAL_LEAVE_TICKET (CORRECT - Account 21070229)

### Example 4: SALEH family cluster (hypothetical PERSONAL)
- Multiple pax with surname SALEH on same date/route to Amman
- (CHD) markers on children's booking lines
- No Oracle form (third-party lines)
- **v10 classification:** PERSONAL (cluster + CHD confirmed)
- Without CHD: FAMILY_CLUSTER_DETECTED flag only, no account flip

## Account Mapping
| Purpose | Account | When |
|---|---|---|
| BUSINESS_TRIP | 60301003 (default) | No override needed |
| SPONSORSHIP | 60307021 | OPEX, CRM-codes, sponsor keywords |
| RECRUITMENT | 60308007 | Recruitment/candidate travel |
| TRAINING | 60308009 | Training/course/certification |
| ANNUAL_LEAVE_TICKET | 21070229 | Expat Annual Travel, Annual Leave |
| WARRANTY_GE | 21070227 | GE agency + warranty markers |
| PERSONAL | 11034013 | Explicit vacation signal OR cluster+CHD |
| UNKNOWN | (no override) | Conservative default |
