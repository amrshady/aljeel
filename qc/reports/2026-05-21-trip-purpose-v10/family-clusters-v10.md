# Family Clusters - v10

## J26-640

### Clusters detected: 0 with CHD markers

No family clusters with (CHD) child markers were detected in J26-640. This is expected: J26-640 is a standard business travel batch for AlJeel medical equipment field engineers and sales reps.

### Same-surname groups detected (no CHD, no flip):

The family cluster detector identifies same-surname groups with overlapping routes. In v10, these are FLAGGED but NOT flipped to PERSONAL unless (CHD) markers are present.

This means if multiple employees named ALANAZI travel the same route on the same date, they get a FAMILY_CLUSTER_DETECTED + FAMILY_CLUSTER_NO_CHD flag but remain BUSINESS_TRIP.

### SALEH case (referenced in task spec):

The SALEH family cluster case mentioned in the task specification was described as a hypothetical where:
- Multiple pax with same surname on same date/route to a tourist destination (e.g., Amman)
- Children (CHD markers) on the booking

This case does NOT appear in J26-640 or J26-788 data. When/if it appears in a future batch, v10 will:
1. Detect the cluster (same surname + overlapping route)
2. Check for CHD markers
3. Only flip to PERSONAL if BOTH conditions are met
4. Flag as FAMILY_CLUSTER_CHD_CONFIRMED

## J26-788

No .msg files available, so no family cluster detection was possible.

## v10 vs v9 Family Cluster Logic

| Scenario | v9 | v10 |
|---|---|---|
| Same surname + same route, no CHD | PERSONAL (auto-flip) | Flag only, no flip |
| Same surname + same route + CHD | PERSONAL (auto-flip) | PERSONAL (CHD confirmed) |
| Same surname, different routes | No cluster | No cluster |

v10 is strictly more conservative: it only flips on verified family travel (CHD evidence), not on coincidental same-surname business travelers.
