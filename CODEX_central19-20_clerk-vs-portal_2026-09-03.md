# Central 19–20 clerk vs portal Oracle upload diff

**Comparison date:** 2026-09-03  
**Clerk workbook:** `/home/clawdbot/.openclaw/media/inbound/Main-2026-2026_Oracle-upload_3_1---3cefd2ca-6296-4ea4-bd3a-02f7ba701bf4.xlsx`  
**Match key:** Invoice Number + explicit `Line No` (verified unique within each workbook/batch).  
**Amount handling:** exact decimal comparison and SAR totals; blank is distinct from zero for field comparisons.

## Executive summary

| Batch | Clerk invoices | Portal invoices | Clerk lines | Portal lines | Clerk line total (SAR) | Portal line total (SAR) | Missing in portal | Missing in clerk | Field mismatches | Distribution segment mismatches |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Central 19 | 102 | 102 | 199 | 199 | 166,630.00 | 166,630.00 | 0 | 0 | 8 | 12 |
| Central 20 | 40 | 40 | 119 | 119 | 55,250.00 | 55,250.00 | 0 | 0 | 2 | 2 |

## Discrepancy categories

Counts below are occurrences, not necessarily distinct lines.

| Category | Count |
|---|---:|
| Distribution Combination | 10 |
| Distribution segment: Agency | 4 |
| Distribution segment: Cost Center | 3 |
| Distribution segment: DIV | 3 |
| Distribution segment: Solution | 4 |

## Central 19

**Portal workbook:** `/home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-وسطي 19-2026/Central-19-2026_Oracle-upload.xlsx`

### Structural discrepancies

None. Invoice line counts agree.

### Lines present in clerk but missing in portal

None.

### Lines present in portal but missing in clerk

None.

### Per-field mismatches

| Invoice | Line | Field | Clerk value | Portal value |
|---|---:|---|---|---|
| 04524 | 1 | Distribution Combination | 03-20100-61500027-160011-196-00000-10052-00000-00-000000 | 03-20100-61500027-160011-196-00000-10156-00000-00-000000 |
| 04524 | 2 | Distribution Combination | 03-20100-61500027-160014-170-10064-10072-00000-00-000000 | 03-20100-61500027-160011-196-00000-10072-00000-00-000000 |
| 04524 | 4 | Distribution Combination | 03-20100-61500027-160014-170-10064-10072-00000-00-000000 | 03-20100-61500027-160014-170-00000-10072-00000-00-000000 |
| 04535 | 1 | Distribution Combination | 03-20100-61500027-160013-192-00000-10102-00000-00-000000 | 03-20100-61500027-160013-192-00000-10062-00000-00-000000 |
| 04768 | 1 | Distribution Combination | 03-20100-61500027-160012-194-00000-10111-00000-00-000000 | 03-20100-61500027---00000-10111-00000-00-000000 |
| 04777 | 1 | Distribution Combination | 03-20100-61500027-160012-194-00000-10111-00000-00-000000 | 03-20100-61500027---00000-10111-00000-00-000000 |
| 04778 | 1 | Distribution Combination | 03-20100-61500027-160013-192-00000-10102-00000-00-000000 | 03-20100-61500027-160013-192-00000-10060-00000-00-000000 |
| 04801 | 1 | Distribution Combination | 03-20100-61500027-160011-196-00000-10081-00000-00-000000 | 03-20100-61500027-160011-196-00000-10083-00000-00-000000 |

### Distribution Combination segment differences

| Invoice | Line | Segment index | Segment | Clerk value | Portal value |
|---|---:|---:|---|---|---|
| 04524 | 1 | 6 | Agency | 10052 | 10156 |
| 04524 | 2 | 3 | Cost Center | 160014 | 160011 |
| 04524 | 2 | 4 | DIV | 170 | 196 |
| 04524 | 2 | 5 | Solution | 10064 | 00000 |
| 04524 | 4 | 5 | Solution | 10064 | 00000 |
| 04535 | 1 | 6 | Agency | 10102 | 10062 |
| 04768 | 1 | 3 | Cost Center | 160012 | *(blank)* |
| 04768 | 1 | 4 | DIV | 194 | *(blank)* |
| 04777 | 1 | 3 | Cost Center | 160012 | *(blank)* |
| 04777 | 1 | 4 | DIV | 194 | *(blank)* |
| 04778 | 1 | 6 | Agency | 10102 | 10060 |
| 04801 | 1 | 6 | Agency | 10081 | 10083 |

## Central 20

**Portal workbook:** `/home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-وسطي 20-2026/Central-20-2026_Oracle-upload.xlsx`

### Structural discrepancies

None. Invoice line counts agree.

### Lines present in clerk but missing in portal

None.

### Lines present in portal but missing in clerk

None.

### Per-field mismatches

| Invoice | Line | Field | Clerk value | Portal value |
|---|---:|---|---|---|
| 04852 | 1 | Distribution Combination | 03-20100-61500027-160014-170-10064-10072-00000-00-000000 | 03-20100-61500027-160014-170-00000-10072-00000-00-000000 |
| 04877 | 1 | Distribution Combination | 03-20100-61500027-160014-170-10064-10072-00000-00-000000 | 03-20100-61500027-160014-170-00000-10072-00000-00-000000 |

### Distribution Combination segment differences

| Invoice | Line | Segment index | Segment | Clerk value | Portal value |
|---|---:|---:|---|---|---|
| 04852 | 1 | 5 | Solution | 10064 | 00000 |
| 04877 | 1 | 5 | Solution | 10064 | 00000 |

## Notes

Distribution segment indices are zero-based. In particular, Location is index 1 and Agency is index 6.
