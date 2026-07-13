Implemented the follow-up fix. No deployment or golden re-baseline occurred.

Fix diff

Only [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py) was changed:

- Lines 1550–1601: inheritance now selects an unambiguous CC/DIV/Cost Name/Solution block from the exact supplier JQ, explicitly never inheriting agency.
- Lines 1911–1969: preserves paired brand/salesperson evidence rows without restoring SO_Detail splitting.
- Lines 1977–2006: eligible brand rows inherit supplier allocation fields; supplier agency remains blank unless supplied line-specifically.
- Existing `supplier_allocation_inherited` keep-allocation path carries CC, DIV/Contribution, Cost Name, and Solution into output.

Root cause: removing SO_Detail allocation/splitting also removed the path that carried supplier allocation fields onto preserved sub-lines. Corrected supplier parsing additionally exposed 03149’s three JQs, temporarily collapsing six evidence rows to three. The fix preserves those six rows while mapping odd brand rows to their supplier JQs.

Golden signature

| Metric | Locked | New |
|---|---:|---:|
| Rows | 188 | 188 |
| GREEN | 7 | 3 |
| YELLOW | 181 | 185 |
| RED | 0 | 0 |
| Blank CC | 6 | 6 |
| Reconciled | 92/92 | 92/92 |

The checker exits with `GOLDEN DRIFT` only for the accepted GREEN/YELLOW change.

Exact blank-CC rows:

- 03045 line 2
- 03110 line 1
- 03149 lines 2, 4, 6
- 03309 line 2

Restored allocation checks:

- 03139 line 2: CC `140040 / Warehouse`, DIV `190 / S&M`.
- 03149 line 1: CC `160011`, DIV `196`, Solution `10018`.
- 03149 line 3: CC `160012`, DIV `194`, Solution `10043`.
- 03149 line 5: CC `160014`, DIV `170 / Contribution`, Solution `10052`.

Central-15 spot-check

- 03940/03941/03942: Kavo `10005`, one supplier agency each.
- 03948: KLS Martin `10052` and Thermo `10113`.
- 03936: Solventum `10202` per its three JQs, BMX `10153`, and Abbott `10072`.

`qc/asateel_golden_expected.json` remains byte-for-byte unchanged. No SO_Detail agency assignment or SO_Detail multi-agency splitting was restored.
