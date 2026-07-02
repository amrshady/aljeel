# Fusion-to-Manpower Code Mapping (Empirical v2)

**Generated:** 2026-05-21 | **Data:** J26-640 (74 emails) + J26-788 (84 emails) = 158 email corpus

## Methodology

Each Oracle Fusion form parsed from .msg emails contains form_division, form_agency, and form_solution codes. These are compared against the Manpower-derived DIV, Agency, and Solution segments in the pipeline output. This table shows the empirical mapping.

## Mappings

### DIV Mappings

| Fusion Code | Manpower Code(s) | Observations | Confidence |
|-------------|-------------------|--------------|------------|
| 60007 | 888(x1), 000(x1), 120(x1) | 3 | LOW (ambiguous) |
| 60008 | 192(x4), 000(x2), 194(x1) | 7 | LOW (ambiguous) |
| 60009 | 196(x3), 000(x2), 120(x2) | 7 | LOW (ambiguous) |
| 60010 | 196(x9), 000(x3), 120(x1) | 13 | LOW (ambiguous) |
| 62011 | 190(x6), 000(x2), 196(x1), 194(x1), 170(x1) | 11 | LOW (ambiguous) |
| 62012 | 120(x3), 000(x2), 190(x1) | 6 | LOW (ambiguous) |
| 62013 | 170(x3) | 3 | HIGH |
| 62014 | 194(x22), 120(x10), 000(x2), 196(x1) | 35 | LOW (ambiguous) |

### AG Mappings

| Fusion Code | Manpower Code(s) | Observations | Confidence |
|-------------|-------------------|--------------|------------|
| 140003 | 10155(x2), 10206(x1) | 3 | LOW (ambiguous) |
| 60110 | 00000(x1) | 1 | MEDIUM |
| 60114 | 10153(x1) | 1 | MEDIUM |
| 60129 | 10206(x3), 00000(x2), 10111(x2), 10153(x1) | 8 | LOW (ambiguous) |
| 60133 | 10206(x1) | 1 | MEDIUM |
| 60158 | 10126(x3) | 3 | HIGH |
| 60207 | 10153(x9), 10206(x6) | 15 | LOW (ambiguous) |
| 60338 | 10200(x7), 00000(x5), 10072(x3), 10083(x2), 10202(x1), 10111(x1), 10082(x1), 10113(x1), 10153(x1), 10126(x1), 10100(x1), 10156(x1) | 25 | LOW (ambiguous) |
| 60339 | 00000(x2), 88888(x1), 10153(x1), 10206(x1) | 5 | LOW (ambiguous) |
| 60344 | 00000(x1), 10200(x1), 10005(x1) | 3 | LOW (ambiguous) |
| 60348 | 00000(x1), 10005(x1) | 2 | LOW (ambiguous) |
| 60376 | 10111(x1) | 1 | MEDIUM |
| 60380 | 10156(x2), 10206(x1) | 3 | LOW (ambiguous) |
| 60382 | 00000(x1), 10206(x1) | 2 | LOW (ambiguous) |
| 60394 | 10206(x3), 10055(x1) | 4 | LOW (ambiguous) |
| 60411 | 10072(x1) | 1 | MEDIUM |
| 60420 | 10081(x6) | 6 | HIGH |
| 60421 | 00000(x1) | 1 | MEDIUM |

### SOL Mappings

| Fusion Code | Manpower Code(s) | Observations | Confidence |
|-------------|-------------------|--------------|------------|
| 515084 | 00000(x4) | 4 | HIGH |
| 517089 | 00000(x1) | 1 | MEDIUM |
| 517091 | 00000(x2) | 2 | MEDIUM |
| 60015 | 00000(x16) | 16 | HIGH |
| 60017 | 00000(x2) | 2 | MEDIUM |
| 60024 | 00000(x32) | 32 | HIGH |
| 60026 | 00000(x3) | 3 | HIGH |
| 60032 | 00000(x5) | 5 | HIGH |
| 60034 | 00000(x1) | 1 | MEDIUM |
| 60036 | 00000(x1) | 1 | MEDIUM |
| 60037 | 00000(x3) | 3 | HIGH |
| 60048 | 10017(x3) | 3 | HIGH |
| 60050 | 00000(x1) | 1 | MEDIUM |
| 60059 | 00000(x1) | 1 | MEDIUM |
| 60061 | 00000(x1) | 1 | MEDIUM |
| 60066 | 00000(x2) | 2 | MEDIUM |
| 60083 | 00000(x1) | 1 | MEDIUM |
| 60085 | 00000(x3) | 3 | HIGH |
| 60089 | 00000(x2) | 2 | MEDIUM |
| 60092 | 00000(x1) | 1 | MEDIUM |

## Summary

- Total mappings discovered: 46
- High-confidence (1:1, N>=3): 11
- Data points: 255 observations across 46 Fusion codes
