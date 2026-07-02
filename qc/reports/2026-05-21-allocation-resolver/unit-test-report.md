# Unit Test Report - Allocation Resolver

## Test Suite: `qc/tests/test_allocation_resolver.py`

### Run Command
```bash
cd /home/clawdbot/.openclaw/workspace/aljeel
PYTHONPATH=scripts:qc:. python3 qc/tests/test_allocation_resolver.py
```

### Results: 18/18 PASS

| # | Test | Class | Result |
|---|------|-------|--------|
| 1 | test_english_charge_to | TestTier1Deterministic | PASS |
| 2 | test_arabic_allocation | TestTier1Deterministic | PASS |
| 3 | test_mixed_ar_en | TestTier1Deterministic | PASS |
| 4 | test_empno_in_body | TestTier1Deterministic | PASS |
| 5 | test_no_allocation_language | TestTier1Deterministic | PASS |
| 6 | test_multi_name_case | TestTier1Deterministic | PASS |
| 7 | test_empty_body | TestTier1Deterministic | PASS |
| 8 | test_no_subordinates | TestTier1Deterministic | PASS |
| 9 | test_single_same_agency_subordinate | TestTier3Hierarchy | PASS |
| 10 | test_multiple_same_agency | TestTier3Hierarchy | PASS |
| 11 | test_no_usable_subordinates | TestTier3Hierarchy | PASS |
| 12 | test_no_subordinates_at_all | TestTier3Hierarchy | PASS |
| 13 | test_indirect_subordinate | TestTier3Hierarchy | PASS |
| 14 | test_non_nta_employee | TestResolveAllocation | PASS |
| 15 | test_missing_employee | TestResolveAllocation | PASS |
| 16 | test_loop_prevention | TestResolveAllocation | PASS |
| 17 | test_tier1_then_tier3 | TestResolveAllocation | PASS |
| 18 | test_generic_approval_body_falls_to_hierarchy | TestResolveAllocation | PASS |

### Test Coverage

| Scenario | Covered |
|----------|---------|
| Clean English allocation ("charge to John Smith") | Yes |
| Clean Arabic allocation (يتسجل على محمد علي) | Yes |
| Mixed AR/EN body | Yes |
| Employee number in .msg body | Yes |
| Generic approval body (no allocation language) | Yes |
| Multiple candidate names | Yes |
| Empty body | Yes |
| No subordinates to match | Yes |
| Single same-agency subordinate (hierarchy) | Yes |
| Multiple same-agency subordinates (hierarchy) | Yes |
| All subordinates also NTA (loop prevention) | Yes |
| No subordinates at all | Yes |
| Indirect subordinate (2 levels deep) | Yes |
| Non-NTA employee (should reject) | Yes |
| Missing employee (not in Manpower) | Yes |
| Tier 1 to Tier 3 fallthrough | Yes |
