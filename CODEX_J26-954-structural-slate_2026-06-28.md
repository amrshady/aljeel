Implemented structural fixes in:

- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py)
- [scripts/split_multi_emp.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py)
- [tests/test_structural_allocation_rules.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_structural_allocation_rules.py)

No deploy. Only batch scratch outputs under `batches/jawal-J26-954/output/` were regenerated.

**Validation**
- Ran `python3 -m py_compile ...`
- Ran the new regression tests directly because `pytest` is not installed in this environment.
- Ran `python3 scripts/run_v30.py J26-954 --input-suffix v15.11.2`
- Ran `python3 scripts/split_multi_emp.py ...v30.xlsx ...v30-SPLIT.xlsx qc/master-data/Aljeel_Lookups-v2.xlsx`

Final comparator I could reproduce:
- Strict `ticket+pax+amount`: `94/100`
- Broader `ticket+amount`: `127/136`
- Baseline before structural fixes on same comparator was `99/136`, so net `+28` matches on the broad comparable set.

I could not reproduce the stated `98/116` comparator exactly from the available files; the reviewed sheet has extra rows and description mutations, so I used deterministic row keys and reported both strict and broad keys.

**Fix Status**
1. CHD/family phantom-cluster guard: implemented. BAASSIRI no longer flips through CHD emp grouping; Khadouj/Sdek family-folder rows lock to the folder owner.
2. Sponsorship split preservation: implemented, but narrowed to preserve event agency only. Preserving all parsed form segments regressed rows because upstream parsed SIS form DIV/Solution as `130/10002` while Labadi/pre-existing correct output uses `196/00000`.
3. Annual-ticket home-segment stamping: implemented. `21070229` now stamps owner home CC/DIV/Agency and keeps Solution general.
4. Ancillary event inheritance: implemented and matcher fired for 3 rows in final v30 log, including Rania airport rows. I found one stale `MISSING_EVIDENCE` flag clearing issue after that full rerun and fixed it; that final micro-fix was unit-tested but not full-pipeline rerun due repeated slow fresh LLM calls.
5. OPEX email-only confidence state: not fully implemented. Bandar remains a residual issue; exact stamping is not silently forced, but the explicit `OPEX_EMAIL_ONLY` state/flag is still incomplete.

**Remaining Labadi Diffs**
Broad `ticket+amount` mismatches after final split:
- `6906462516` split rows: our event agency `10043`; Labadi rows show `10041/10156/10041`. Ambiguous because the requested rule explicitly says SIS-15 should preserve event agency `10043`.
- `6906529009`, `6906529010`: LAB-16 agency remains off versus Labadi `10111`.
- `4860132150`: ALEM return leg still `60301003` vs Labadi combo `60308009`; this appears related to the already-applied own-form/trip inheritance area, which I did not touch per instruction.
- `4860165225` split rows: our agency `10041`; Labadi says `10043`.

**No-Hardcoding Statement**
No ticket-number, employee-ID, name allowlist, per-row override, or row-specific hardcode was added. Rules are driven by folder evidence, family relationship evidence, account/OPEX/form columns, attendee matching, and Manpower records.
