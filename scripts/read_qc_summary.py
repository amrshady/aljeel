#!/usr/bin/env python3
"""Read QC summary fields from summary JSON. Used by wrapper script."""
import json, sys
d = json.load(open(sys.argv[1]))
rs = d.get("row_status_breakdown", {})
print(rs.get("GREEN", 0))
print(rs.get("YELLOW", 0))
print(rs.get("RED", 0))
print(d.get("within_batch_catches", 0))
print(d.get("cross_batch_catches", 0))
