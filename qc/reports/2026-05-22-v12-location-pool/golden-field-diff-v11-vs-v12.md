# Golden Field Diff: v11-labadi vs v12 (J26-640)

## Per-Segment Match Rates

| Segment        | v11-labadi     | v11 %  | v12            | v12 %  | Delta   | Status |
|----------------|----------------|--------|----------------|--------|---------|--------|
| Company        |  117/117  |  100.0% |  117/117  |  100.0% |   +0.0pp | ⚪ |
| Location       |   54/117  |   46.2% |   64/117  |   54.7% |   +8.5pp | 🟢 |
| Account        |  112/117  |   95.7% |  112/117  |   95.7% |   +0.0pp | ⚪ |
| CostCenter     |  106/117  |   90.6% |  106/117  |   90.6% |   +0.0pp | ⚪ |
| DIV            |  106/117  |   90.6% |  106/117  |   90.6% |   +0.0pp | ⚪ |
| Solution       |  117/117  |  100.0% |  117/117  |  100.0% |   +0.0pp | ⚪ |
| Agency         |  106/117  |   90.6% |  106/117  |   90.6% |   +0.0pp | ⚪ |
| FullCombo      |   51/117  |   43.6% |   61/117  |   52.1% |   +8.5pp | 🟢 |

## Analysis

### Location (+8.5pp)
Fix A (10100 -> 20100 default) corrected 10 Location mismatches. The remaining
53 Location mismatches are employees with golden=40100/30100 but Manpower=10100.
These require Manpower data correction — not addressable by rules.

### Account (0.0pp — no regression)
Fix B threshold (>50% majority required) prevents the Account regression observed
in the first v12 attempt where the team pool forced resolution on fragmented pools.

### CC / DIV / Agency (0.0pp — no regression)
Team pool resolves with correct segments when majority is clear. Fragmented cases
fall back to MULTI_ALLOCATION_PENDING_REVIEW.

### Full Combo (+8.5pp)
Improvement entirely from Location fixes. Each Location fix that aligns with the
other already-correct segments produces a full combo match.

## Remaining Gaps (not addressed in v12)

1. **Location for Jeddah/Dammam employees (38+10 lines):** Manpower codes 10100
   for employees who work in Jeddah (40100) or Dammam (30100). Fix requires
   upstream Manpower correction or Oracle form city analysis.

2. **EMPLOYEE_NOT_IN_MASTER lines (34 lines):** Employees not found in Manpower
   cannot have their CC/DIV/Agency resolved. These need master data enrichment.

3. **Line 26 CC/DIV/Agency mismatch:** Pipeline uses (160013, 192, 10200) from
   employee 1000157 pool but golden wants (160012, 194, 10153). This is likely
   a different agency's cost center assignment in the golden.
