Implemented and verified. No deployment performed and no golden fixtures edited.

### Fix

Changed [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1698) to:

- Retain genuine blank-JQ supplier allocation lines.
- Exclude blank template/signature/total rows lacking a usable allocation block.
- Skip PDF-JQ inheritance, SO_Detail lookup, and JQ validation for blank-JQ supplier units.
- Mark resolution as `supplier_blank_jq`, without a RED exception.
- Preserve normal per-JQ behavior for nonblank JQs.
- Preserve the exact Warehouse DC, including Location `40100`, in [finalize_distribution()](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1257).

Only `asateel-sample/asateel_poc.py` was edited for this fix. Existing uncommitted changes in it and `pipelines/asateel.py` were preserved. Current combined working-tree diff for those files is:

```text
asateel-sample/asateel_poc.py | 264 ++++++++++++++++++++++++++++++++++++------
pipelines/asateel.py          |  76 +++++++-----
2 files changed, 275 insertions(+), 65 deletions(-)
```

That combined figure includes the pre-existing v2 agency work.

### Invoice 04235

Before:

```text
Rows:           1
Allocation:     325.00 net / 373.75 gross
Delta:          -373.75 gross
Reconciled:     false
```

After:

```text
Rows:           2
Allocation sum: 650.00 net
Expected gross: 747.50
Delta:          0.00
Reconciled:     true
```

Rows emitted:

```text
1  325.00  JQ-26128627  Bio-Rad  CC 160012  DIV 194
   DC 03-20100-61500027-160012-194-00000-10111-00000-00-000000

2  325.00  blank JQ     S&M      CC 140040  DIV 190
   DC 03-40100-61500027-140040-190-00000-10200-00000-00-000000
   agency_resolution=supplier_blank_jq
   exception=""
```

Final requested batch summary:

```text
Invoices:       63
Rows:           128
Statuses:       RED 3, YELLOW 125
Reconciled:     63
Mismatched:     0
```

The generated artifacts are under [matched](/home/clawdbot/.openclaw/workspace/aljeel/matched).

### Agency invariant

Checked all 128 final output rows:

```text
Distribution Combination segment 7 != Agency: 0 violations
```

For 04235 Warehouse specifically, both segment 7 and standalone Agency are `10200`.

### Golden gate

`python3 qc/asateel_golden_check.py` completed with `GOLDEN DRIFT`.

```text
                         Expected             Actual
Allocation rows          185                  183
Status distribution      GREEN 3              GREEN 0
                         YELLOW 182            YELLOW 171
                         RED 0                 RED 12
Reconciled invoices      92                   92
Mismatched invoices      0                    0
Blank-CC rows            3                    2
```

Exact blank-CC change:

```text
Expected invoices: 03045, 03110, 03309
Actual invoices:   03110, 03309

Removed baseline key:
03045 / line 2 / YELLOW
```

Invoice 03045 is now represented as one proper blank-JQ Warehouse supplier allocation with the pinned Warehouse DC instead of retaining an extra blank-cost-center evidence row. Other status drift, particularly the 12 RED rows, comes from the already-uncommitted v2 SO_Detail agency-resolution work.

The baseline needs Ahmed’s human review/re-blessing after the bundled changes are reviewed. I did not modify it.
