Implemented only in [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py).

- Master supplier record `invoice_date` is now authoritative when available.
- Internal dates use canonical `YYYY-MM-DD`.
- Oracle dates use day-first `DD/MM/YYYY`.
- Ambiguous slash dates no longer use `pd.to_datetime()`.
- Excel date format is now `dd/mm/yyyy`.
- No allocation, agency, CC, or other non-date output fields were changed.
- `python3 -m py_compile asateel-sample/asateel_poc.py` passed.
- Seven targeted date parsing cases passed.
- No deployment performed and no golden expected files modified.

Full diff:

```diff
diff --git a/asateel-sample/asateel_poc.py b/asateel-sample/asateel_poc.py
index b694f8f..9224810 100644
--- a/asateel-sample/asateel_poc.py
+++ b/asateel-sample/asateel_poc.py
@@ -20,7 +20,7 @@ import urllib.request
 from collections import Counter
 from copy import copy
 from dataclasses import dataclass
-from datetime import datetime, timezone
+from datetime import date, datetime, timezone
 from pathlib import Path
 from typing import Any
 
@@ -194,19 +194,35 @@ def _date_str(v: Any) -> str:
         return _clean(v)
 
 
+def _parse_invoice_date(v: Any) -> date | datetime | None:
+    """Parse supported invoice date representations without date-order guessing."""
+    if isinstance(v, (datetime, date)):
+        return v
+    if not isinstance(v, str):
+        return None
+    value = v.strip()
+    for date_format in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y", "%d/%m/%y"):
+        try:
+            return datetime.strptime(value, date_format)
+        except ValueError:
+            continue
+    return None
+
+
+def _canonical_iso_date_str(v: Any) -> str:
+    """Render a supported invoice date in canonical ISO form."""
+    if not v:
+        return ""
+    parsed = _parse_invoice_date(v)
+    return parsed.strftime("%Y-%m-%d") if parsed else _clean(v)
+
+
 def _oracle_date_str(v: Any) -> str:
-    """Render an invoice date in Oracle's required month/day/year form."""
+    """Render a supported invoice date in Oracle's required day/month/year form."""
     if not v:
         return ""
-    if hasattr(v, "strftime"):
-        return v.strftime("%m/%d/%Y")
-    try:
-        dt = pd.to_datetime(v, errors="coerce")
-        if pd.isna(dt):
-            return _clean(v)
-        return dt.strftime("%m/%d/%Y")
-    except Exception:
-        return _clean(v)
+    parsed = _parse_invoice_date(v)
+    return parsed.strftime("%d/%m/%Y") if parsed else _clean(v)
 
 
 def _sha256_file(path: Path) -> str:
@@ -1976,6 +1992,9 @@ def build_rows(
 
         used_supplier_rows: set[int] = set()
         invoice_no = _code(ext.get("invoice_number"), 5) or expected_inv
+        master_records = supplier_index.get(invoice_no, [])
+        master_invoice_date = master_records[0].get("invoice_date") if master_records else None
+        date_value = master_invoice_date if _clean(master_invoice_date) else ext.get("invoice_date")
         supplier_jq_units = supplier_jq_units_for_invoice(invoice_no, supplier_index)
         paired_signal_sources = [
             _clean((ln.get("allocation_signal") or {}).get("source")).lower()
@@ -2268,7 +2287,7 @@ def build_rows(
             row = {
                 "folder": folder,
                 "invoice_no": invoice_no,
-                "invoice_date": _date_str(ext.get("invoice_date")),
+                "invoice_date": _canonical_iso_date_str(date_value),
                 "line_no": unit["line_no"],
                 "description": _clean(ln.get("description")),
                 "reference": _clean(ln.get("reference")),
@@ -2295,7 +2314,7 @@ def build_rows(
                 "*Invoice Number": invoice_no,
                 "*Invoice Currency": "SAR",
                 "*Invoice Amount": item.get("master_invoice_amount") if master_fallback else total,
-                "*Invoice Date": _oracle_date_str(ext.get("invoice_date")),
+                "*Invoice Date": _oracle_date_str(date_value),
                 "**Supplier[..]": SUPPLIER_NAME,
                 "**Supplier Number": "",
                 "*Supplier Site[..]": "",
@@ -2493,7 +2512,7 @@ def write_excel(rows: list[dict[str, Any]], path: Path) -> None:
             cell = ws.cell(ridx, c)
             cell.value = value
             if header == "*Invoice Date":
-                cell.number_format = "mm/dd/yyyy"
+                cell.number_format = "dd/mm/yyyy"
 
         fill, font = _row_style(row.get("Row_Status") or "GREEN")
         for c in range(1, header_count + 1):
```

The golden gate may now report expected date-only differences if its fixtures encode the old month-first representation. Any non-date golden-field difference would be unrelated to this patch and should not be accepted as expected.
