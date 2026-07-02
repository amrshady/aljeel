# Trip Purpose Classifier — Design Rationale

## Problem Statement
AlJeel's Jawal travel invoice processing was posting ~95% of Personal Contribution
travel to `60301003` (Travel Tickets Expense) instead of `11034013` (Personal
Employee Recharge). The misposting affected both the automated agent AND Laith's
manual golden reference — indicating a systemic process gap, not an agent bug.

## Root Cause
The Oracle Fusion workflow system sends approval request emails with clear
trip-purpose signals:
- Subject line: "Personal Contribution Approval Requested for [Name]"
- Form body: "Personal Contribution" header, `Perdiem Class: *.Personal`
- Arabic variants: "اعتماد المساهمة الشخصية"

These signals were **not being read by the GL account classifier**, which relied
solely on invoice-line keywords (description field). The description field contains
only the passenger name and route — no trip purpose signal.

## Solution Architecture

### Zero-LLM, Pure Regex Classifier
The classifier is 100% deterministic — no LLM calls, no API cost, no latency.

### Classification Rules (priority order)

| Priority | Rule | Signal | Purpose | Confidence |
|----------|------|--------|---------|-----------|
| 1a | Subject regex | "Personal Contribution Approval Requested" (EN) | PERSONAL | 1.0 |
| 1b | Subject regex | "اعتماد المساهمة الشخصية" (AR) | PERSONAL | 1.0 |
| 1c | Subject regex | "الإسهام الشخصي" (AR alt) | PERSONAL | 1.0 |
| 1d | Subject regex | "Business Trip Approval Requested" (EN) | BUSINESS_TRIP | 1.0 |
| 1e | Subject keyword | "business trip" (informal) | BUSINESS_TRIP | 0.9 |
| 1f | Subject keyword | "مهمة عمل" / "رحلة عمل" (AR) | BUSINESS_TRIP | 0.9 |
| 1g | Subject keyword | "annual ticket/leave" | ANNUAL_LEAVE_TICKET | 1.0 |
| 1h | Subject keyword | "recruitment/candidate travel" | RECRUITMENT | 1.0 |
| 1i | Subject keyword | "training/course/certification" | TRAINING | 0.9 |
| 1j | Subject compound | OPEX + event code (CRM/EP/HF/IEPC) | SPONSORSHIP | 0.95 |
| 1k | Subject keyword | "opex" (standalone) | SPONSORSHIP | 0.85 |
| 1l | Subject keyword | "sponsor" | SPONSORSHIP | 0.95 |
| 1m | Subject regex | Event codes (CRM-XXXX, EP-XXXX, etc.) | SPONSORSHIP | 0.9 |
| 1n-1r | Subject keyword | Sakura Forum, ISHLT, Vienna, Barcelona, congress | SPONSORSHIP | 0.8-0.9 |
| 2a-2e | Form body | Perdiem ".Personal", Accommodation "Personal" | PERSONAL fallback | 0.7-0.8 |
| 3a | Invoice line | "(CHD)" child marker | PERSONAL | 0.9 |
| 4 | No signal | — | UNKNOWN | 0.0 |

### Account Mapping

| Trip Purpose | Account Code | Account Name |
|-------------|-------------|-------------|
| PERSONAL | 11034013 | Personal Employee Recharge |
| BUSINESS_TRIP | 60301003 | Travel Tickets Expense (no override) |
| SPONSORSHIP | 60307021 | Sponsoring Expenses |
| RECRUITMENT | 60308007 | Recruitment Fees |
| TRAINING | 60308009 | Training Expenses |
| ANNUAL_LEAVE_TICKET | 21070229 | Accrued Employee Annual Ticket |
| WARRANTY_GE | 21070227 | Accrued Project and Warranty |
| UNKNOWN | — | Leave resolver default |

### Family Cluster Detection
Identifies multi-line bookings where:
- Same SURNAME (GDS token 0)
- Overlapping route corridor (≥2 shared cities)
- OR one member has (CHD) marker

Clusters are auto-tagged PERSONAL unless one member is explicitly BUSINESS_TRIP
(then tagged MIXED_FAMILY_CLUSTER for human review).

### QC Gate Codes Added (S20-S26)

| Gate | Code | Type | Description |
|------|------|------|-------------|
| S20 | TRIP_PURPOSE_MISMATCH | Soft/HOLD | Subject says X, form says Y |
| S21 | PERSONAL_LOW_CONFIDENCE | Soft/HOLD | Only 1 signal, conf < 0.8 |
| S22 | FAMILY_CLUSTER_DETECTED | Soft/Info | Auto-routed to Personal |
| S23 | MIXED_FAMILY_CLUSTER | Soft/HOLD | Conflicting purposes in cluster |
| S24 | TRIP_PURPOSE_UNKNOWN | Soft/HOLD | No classification signal |
| S25 | ACCOUNT_OVERRIDE_APPLIED | Soft/Info | Classifier overrode resolver default |
| S26 | EMPLOYEE_AS_SPONSORED_HARD | Soft/HOLD | Employee in Manpower but posted as sponsored |

### Pipeline Integration Point
Runs AFTER employee resolver but BEFORE GL combo build:
1. Resolver picks employee → default Account from description keywords
2. **Classifier examines .msg subject + form + pax markers → account override**
3. If override applies → replace Account segment in combo
4. QC gates validate the final combo

## Arabic Keyword Variants

| English | Arabic | Notes |
|---------|--------|-------|
| Personal Contribution | المساهمة الشخصية | Primary variant in Oracle Fusion |
| Personal Contribution | الإسهام الشخصي | Secondary variant |
| Business Trip | رحلة عمل | Rare in practice |
| Business Trip | مهمة عمل | "work mission" — used in one J26-640 email |

## Conservative Defaults
- UNKNOWN → leave resolver's default account + flag for review
- Never auto-flip to Personal without at least one signal
- Business Trip = no override needed (60301003 is already the default)
