# Master Data — vendors, cost centers, currencies

Anchor file. Populated batch-by-batch as new entities appear. Single source of truth for vendor identifiers, cost-center codes, and currency handling.

---

## Vendors

| Vendor | Pipeline | Identifier in Oracle | First batch processed |
|---|---|---|---|
| Johnson & Johnson / DePuy | jj | (Oracle vendor ID TBD) | 25DEC (Dec 2025) |
| Asateel Al-Tareeq | asateel | (Oracle vendor ID TBD) | April 2026 |
| Jawal Travel | jawal | (Oracle vendor ID TBD) | J26-640 |

Oracle vendor IDs to be populated when Oracle Fusion master extract is available.

---

## Cost Centers (Asateel allocation)

Observed in April 2026 batch:
- **Warehouse** — cost-center-direct rides (~12 rows, no JQ)
- (Add others as they appear)

JQ-bearing rides allocate to employee's home cost center via JQ → employee → CC lookup (held in Aljeel HR, not in this KB).

---

## Currencies

- **SAR** is the default for all batches processed to date
- All pipeline outputs report SAR
- VAT is calculated at 15% (KSA VAT STANDARD) for taxable transactions, 0% for KSA VAT ZERO
- International Jawal tickets are zero-rated (vat_class = KSA VAT ZERO)

Multi-currency invoices not yet encountered. If a USD/EUR invoice surfaces, will need:
- Currency field at header level
- FX rate source (Oracle rate? Vendor rate? Statement date rate?)
- Conversion to SAR for cost-center allocation totals

---

## Batch identifiers

Standard format: `<vendor>-<batch-id>` (e.g. `jawal-J26-788`, `jj-25DEC`, `asateel-april-2026`).

Batch directory: `aljeel/batches/<batch-id>/` for outputs; `raw/<vendor>/<period>/` for inputs.
