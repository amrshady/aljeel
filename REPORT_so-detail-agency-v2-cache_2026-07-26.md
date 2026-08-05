# SO_Detail Agency v2 + cache — implementation report

## Result

The all-batch Asateel path now resolves Agency per canonical JQ with this matrix:

- one usable SO_Detail agency: use SO_Detail;
- two or more usable agencies: use Supplier Expenses Format;
- blank/`00000` only: use Supplier Expenses Format;
- JQ absent from SO_Detail: use Supplier Expenses Format, mark the entire row RED,
  and emit `AGENCY_JQ_NOT_IN_SO_DETAIL`.

The chosen code is written to standalone `Agency` and Distribution Combination
segment 7. A hard invariant fails the batch if those values differ. CC, DIV,
Solution, employee, split, and the existing BMX P&T remap gate were not changed.

The supplied workbook was installed at the configured standing path
`reference/SO_Detail_Labadi_1_R21_AA.xlsx`. Its SHA-256 is
`d7fadda090d9f8b4054edc265166a52780afeb927c26c79755d9850c2b6ecf46`.

## Parse cache

`load_so_detail()` hashes the workbook bytes and reads/writes
`state/so_detail_cache/<sha256>.pkl`. The payload includes a cache schema version,
the source SHA-256, and the parsed JQ index. A missing, invalid, unreadable, or
corrupt cache triggers a full parse and replacement.

Measured on this host:

| Load | Time |
|---|---:|
| Cold parse + cache write | 12.071 s |
| SHA check + cached load | 0.240 s |

This is about 50x faster, although the observed cached time is above the brief's
approximate 50 ms target. A focused test confirmed that corrupt pickle bytes cause
a full rebuild and that the following load is a cache hit.

## CENTRAL golden before/after

| Measure | Before | After |
|---|---:|---:|
| Distribution rows | 185 | 185 |
| Reconciled/mismatched invoices | 92/0 | 92/0 |
| GREEN/YELLOW/RED | 3/182/0 | 0/166/19 |
| Clean SO_Detail agency | — | 144 |
| Supplier fallback: conflict | — | 21 |
| Supplier fallback: blank/`00000` | — | 1 |
| Supplier fallback + RED: JQ missing | — | 19 |
| HOME_AGENCY_DISCREPANCY exceptions | 34 | 41 |
| Agency values changed from supplier | 0 | 10 |
| Combo segment-7 invariant violations | 0 | 0 |

There are 44 rows with the home-agency discrepancy marker; 41 appear as
`HOME_AGENCY_DISCREPANCY` catches because three rows have the higher-priority
missing-JQ exception.

Agency changes:

| Invoice | Line | JQ | Supplier | SO_Detail |
|---|---:|---|---|---|
| 03099 | 2 | JQ-26115124 | 10153 BMX | 10141 ELITechGroup |
| 03134 | 1 | JQ-260000937 | 10072 Abbott | 10071 Terumo |
| 03142 | 2 | JQ-26109251 | 10111 Bio-Rad | 10211 Local Supplier |
| 03176 | 1 | JQ-26112696 | 10153 BMX | 10111 Bio-Rad |
| 03176 | 2 | JQ-26112687 | 10153 BMX | 10111 Bio-Rad |
| 03177 | 1 | JQ-26112696 | 10153 BMX | 10111 Bio-Rad |
| 03178 | 1 | JQ-26112696 | 10153 BMX | 10111 Bio-Rad |
| 03179 | 1 | JQ-26112696 | 10153 BMX | 10111 Bio-Rad |
| 03179 | 2 | JQ-26112687 | 10153 BMX | 10111 Bio-Rad |
| 03236 | 1 | JQ-26108646 | 10202 Solventum | 10009 Ivoclar |

All 19 missing-JQ rows have red fill across the complete Oracle output row. All
185 generated rows satisfy segment 7 == Agency.

## Golden gate

`python3 qc/asateel_golden_check.py` ran to completion and returned
`GOLDEN DRIFT`:

```text
row_status_counts:
  expected: {"GREEN": 3, "RED": 0, "YELLOW": 182}
  actual:   {"GREEN": 0, "RED": 19, "YELLOW": 166}
blank_cost_center_row_keys:
  expected: invoice 03045 line 2 YELLOW; 03110 line 1 YELLOW; 03309 line 2 YELLOW
  actual:   invoice 03045 line 2 RED; 03110 line 1 YELLOW; 03309 line 2 YELLOW
```

No golden check or fixture was edited. The baseline needs human re-blessing by
Ahmed if these required missing-JQ red statuses are accepted. No deployment was
performed.
