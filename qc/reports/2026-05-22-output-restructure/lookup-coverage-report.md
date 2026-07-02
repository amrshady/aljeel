# Lookup Coverage Report (2026-05-22)

Coverage of Block 2 code-to-name lookups across both batches.

## Lookup Tables Loaded

| Table | Entries | Source Sheet |
|-------|---------|-------------|
| Account to GL | 9 | INDEX tab (rows 2-10) |
| CC to Cost Name | 128 | Cost Center Segment tab |
| DIV to Contribution | 35 | DIV tab |
| Solution to Solution Name | 296 | Solution tab |
| Agency to Agency Name | 676 | Agency tab |

## J26-640 (117 lines)

| Lookup Field | Resolved | N/A | Coverage |
|-------------|----------|------|----------|
| GL | 117 | 0 | 100.0% |
| Cost Name | 47 | 70 | 40.2% |
| Contribution (DIV) | 81 | 36 | 69.2% |
| Solution Name | 117 | 0 | 100.0% |
| Agency Name | 117 | 0 | 100.0% |

## J26-788 (103 lines)

| Lookup Field | Resolved | N/A | Coverage |
|-------------|----------|------|----------|
| GL | 103 | 0 | 100.0% |
| Cost Name | 41 | 62 | 39.8% |
| Contribution (DIV) | 43 | 60 | 41.7% |
| Solution Name | 103 | 0 | 100.0% |
| Agency Name | 103 | 0 | 100.0% |

## Analysis

- GL, Solution Name, Agency Name: 100% coverage on both batches. The lookup tables are comprehensive for these segments.
- Cost Name: ~40% coverage. Many cost center codes used by AlJeel employees are not in the Cost Center Segment master tab. The #N/A entries match the user screenshot convention.
- Contribution (DIV): 41-69% coverage. J26-788 has lower coverage than J26-640, likely due to more division codes outside the DIV master (e.g., DIV 192 is not in the master). The #N/A values are expected.

## Note for Laith

The #N/A values in Cost Name and Contribution are NOT errors — they reflect codes that exist in Oracle Fusion but are not in the reference lookup tables provided. If AlJeel provides an updated/expanded master with these codes, coverage can be improved by updating the lookup tabs.
