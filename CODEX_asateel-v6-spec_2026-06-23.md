Read-only review completed. Proposed code adjustments:

1. **Add JQ parsing helper near `_additional_info` (`asateel_poc.py:974-981`).**  
   Add a helper such as `_split_jqs(raw) -> list[str]` that extracts every `JQ-\d+` token from a supplier sheet cell. It must turn values like `JQ-26115750 JQ-26115752` into `["JQ-26115750", "JQ-26115752"]`. Use this helper in `_additional_info` so each output row gets exactly one `empno.JQ`.

2. **Change supplier sheet loading to preserve JQ units (`load_expenses_format`, `883-934`).**  
   Today one supplier worksheet row becomes one `rec`, even when the JQ cell contains multiple JQs. Change this block so each parsed JQ becomes a separate allocation unit. Keep the original supplier row number plus fields like `_source_jq_cell`, `_jq_count`, `_jq_index`, and `_supplier_row_amount`. For `03072`, this means two records, one for `JQ-26115750` and one for `JQ-26115752`.

3. **Allocate amount by supplier JQ unit, not PDF line count (`build_rows`, `1133-1181` and `1193-1429`).**  
   The current row driver is `lines`, and `split_method` is based on extracted PDF line counts. Replace that for invoices with supplier JQs: build an `allocation_units` list from supplier records for the invoice, then loop over those units. If supplier JQ units exist, output one row per JQ, with `split_method = "per_jq"`. Only fall back to the existing PDF-line loop when no supplier JQ data exists.

4. **Replace `match_supplier_line` line-order behavior (`937-971`).**  
   The current matcher consumes supplier rows by PDF line index and amount. That is the line-level behavior Mohammed rejected. Add a new matcher such as `supplier_jq_units_for_invoice(invoice_no, supplier_index)` and use it before `match_supplier_line`. Keep `match_supplier_line` only as fallback for invoices missing supplier JQs.

5. **Handle multi-JQ amount apportionment explicitly (`load_expenses_format` or new helper used before `build_rows`).**  
   If a supplier row has multiple JQs and one amount, split that supplier row amount across its JQs with deterministic rounding, assigning any cent remainder to the last JQ unit. Mark `_amount_basis` as something like `supplier_row_amount_split_by_jq`. This is necessary for `03072` and the `03097` row containing `JQ-26116785 JQ-26116807`, unless a better per-JQ amount exists elsewhere.

6. **Use supplier sheet allocation as authoritative even when Manpower employee exists (`build_rows`, `1223-1300`).**  
   Current code first resolves employee number through Manpower at `1223-1234`, then later only overrides agency fields at `1276-1299`. This can leave division/cost center from Manpower while agency comes from supplier. Change this so when `supplier_has_allocation` is true, the full supplier allocation wins: agency, division, cost center, cost center name, solution. Manpower should be retained only as comparison metadata.

7. **Add explicit Manpower-vs-supplier discrepancy detection (`build_rows`, around `1223-1300`).**  
   After finding `manpower_emp`, compare `_code(manpower_emp["agency_code"], 5)` to `_code(supplier_match["agency_code"], 5)`. If different, keep supplier allocation but add a flag such as `_supplier_home_agency_discrepancy = "Y"` and notes like `Supplier agency 10041/Fujifilm differs from Manpower home agency 10043/Erbe; supplier sheet used`.

8. **Add output/debug columns for discrepancy review (`DEBUG_HEADERS`, `72-101`, and `write_excel`, `1511-1541`).**  
   Add columns such as:
   - `Supplier Sheet Agency`
   - `Manpower Home Agency`
   - `Home Agency Discrepancy`
   - `Supplier JQ Count`
   
   Populate them in `debug_values`. This gives reviewers a direct highlight for cases like `03317` Ghadeer Alfaleh.

9. **Force human-review highlighting for discrepancies (`classify`/`build_rows`, `760-781`, `1320-1332`).**  
   If `_supplier_home_agency_discrepancy == "Y"`, set `Row_Status = "YELLOW"` while still keeping the supplier allocation populated. Current `keep_allocation` already allows supplier allocation to remain when `supplier_action == "supplier_agency"`; preserve that behavior.

10. **Update row notes and trace output (`invoice_trace["supplier_matches"]`, `1205-1218`).**  
   Include parsed JQ, source supplier row, `_jq_index`, `_jq_count`, supplier agency, Manpower home agency, and discrepancy flag. This makes audit evidence clear for each JQ allocation row.

11. **Stop treating Entry sheets as allocation truth for this rule (`validate`, `1577-1728`, and summary `1899-1937`).**  
   Keep Entry validation only as legacy comparison, or relabel it clearly as non-authoritative. Do not tune row count, amount split, or agency matching to Entry sheet collapses. For invoices with multiple JQs collapsed in Entry, expect validation misses rather than changing the allocation.

12. **Data and edge-case risks to handle.**  
   `03072` has two JQs in one supplier row with one amount, so amount must be apportioned or sourced elsewhere. `03097` has one supplier row with two JQs, so output row count should exceed PDF line count. If an invoice PDF has a JQ missing from the supplier sheet, fall back to current PDF extraction but flag `YELLOW`. If supplier has duplicate rows for the same JQ, flag duplicate and avoid silently double-booking. If supplier agency text cannot resolve to lookup, do not fall back to Manpower without a review flag, because Rule 2 makes supplier sheet agency authoritative once resolved.

[status: done rc=0]
