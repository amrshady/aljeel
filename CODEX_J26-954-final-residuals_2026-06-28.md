Implemented the acceptable general fixes and regenerated scratch outputs only. No deploy.

**Verdicts**

| Row | Verdict | Evidence / segment |
|---|---|---|
| `6906462516` | WE_CORRECT | OPEX-SIS-15 PDF extracted salesmen `1001422/1002169/1001530`; SIS-15 is ERBE, agency `10043`. Labadi’s `10041/10156` not supported for this event. |
| `4860165225` | WE_CORRECT | Qassim folder OPEX-SIS-14 PDF extracted same salesmen; SIS-14 is Fujifilm, agency `10041`. Labadi’s `10043` not supported for this ticket folder. |
| `4860165204` | WE_CORRECT for blank routing | EP-2026-17 has approval email and ticket PDF, but no OPEX PDF. Exact combo is not source-verifiable, so `OPEX_EMAIL_ONLY` blank/human-review is correct. |
| `6906462486` | LABADI_CORRECT, fixed | Own approved business-trip form for sibling ticket `6906462485` plus bundled ticket PDF supports business travel account/home segments. Final combo now matches Labadi: `03-10100-60301003-160012-194-00000-10126-00000-00-000000`. |
| `6906529011` | AMBIGUOUS | LAB-16 OPEX supports an allocation table, but not a deterministic passenger-to-allocation mapping/split from current parser evidence. |
| `6906529013` | AMBIGUOUS | LAB-16 table includes allocation employee/location supporting Labadi-like prefix, but mapping that passenger to that allocation row is not source-safe. |
| `6906529014` | AMBIGUOUS | Same LAB-16 allocation issue; Labadi’s `40100` is plausible from allocation area/employee, not safely derivable generally. |
| `6906529018` | AMBIGUOUS | LAB-16 table includes `1001256`, but Labadi’s `20100`/DIV `160` is not consistently derivable from central area/master data. |
| `26-904` ALBUNAYAN hotel split | AMBIGUOUS | LAB-16 OPEX amount/allocation table supports five-way allocation concept, but no general parser currently creates a deterministic hotel split. Left for human review. |

**Prefix Rule**

Found in code: company/location prefix is built from company `03` plus the resolved `Location`, normally rewritten from manpower. For structured OPEX splits it should follow the assigned allocation employee/location.

Not found for LAB-16: a safe deterministic rule from OPEX PDF to Labadi’s `10100/20100/30100/40100` assignments. Labadi appears to use allocation rows/areas, but current extraction returns `[]` for LAB-16 and the central/western cases are not uniformly derivable from manpower alone.

**Fixes Applied**

Changed [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:376):
- Own approved business-trip forms now get default travel account from employee cost center when classifier purpose is `BUSINESS_TRIP` but has no explicit account override.
- Travel-ticket accounts stamp neutral solution `00000`.
- Sibling itinerary inheritance now carries account plus `emp_no`, cost center, DIV, solution, and agency from the owning form leg.

Changed tests:
- [tests/test_own_form_trip_precedence.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_own_form_trip_precedence.py:97)
- [tests/test_structural_allocation_rules.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_structural_allocation_rules.py:191)

**Validation**

Commands passed:
- `python3 -m py_compile scripts/run_v30.py tests/test_structural_allocation_rules.py tests/test_own_form_trip_precedence.py`
- `python3 -m pytest tests/test_own_form_trip_precedence.py tests/test_structural_allocation_rules.py` → `9 passed`
- `python3 scripts/run_v30.py J26-954 --input-suffix v15.11.2`
- `python3 scripts/split_multi_emp.py ...v30.xlsx ...v30-SPLIT.xlsx qc/master-data/Aljeel_Lookups-v2.xlsx` → `139 rows in, 17 split, 173 rows out`

Final comparison generated at:
`batches/jawal-J26-954/output/diff-vs-labadi-final-residual.csv`

Counts from the independent comparator I ran:
- Strict normalized-description + amount + combo: `103/176` before, `109/176` after.
- Broad reference + amount + combo: `111/176` before, `145/176` after.
- Final output rows: `173`; Labadi rows: `176`.

Remaining human-review rows: `4860165204`, LAB-16 ticket cluster `6906529011/9013/9014/9018`, and LAB-16 hotel `26-904`.

No hardcoding added: no ticket numbers, employee IDs, names, allowlists, or per-row overrides. The changes are general rules based on own approved forms, travel accounts, manpower home segments, and sibling itinerary evidence.
