# QC Review — asateel / current — Round 1

**Generated:** 2026-05-20 04:52 UTC
**Model:** anthropic/claude-sonnet-4-6
**Tokens:** input=20929 output=3391

---

## Verdict: CONCERNS
**Confidence:** 0.75

## Structural Defense

The two DUP_JQ_STRICT catches are well-supported: identical JQ numbers, same employee, same date, same amount, consecutive invoice numbers — this is a textbook double-pay pattern and HIGH severity is warranted. The PARTIAL_ALLOC_MISSING_JQ catch on invoice 02912 is correctly identified (Rahaf Nour Eddin Alrefaei, emp 1000780, has a null JQ with an amount of SAR 316.67). However, the KB specifies PARTIAL_ALLOC_MISSING_JQ should be MEDIUM severity, not LOW as assigned. The five EMP_SAME_DAY_MULTI_INVOICE catches are structurally defensible as soft signals — each has 3+ distinct JQs/invoices on the same day. However, one catch (emp 1000584, Ahmed Mohamed Mohamed Elsawy, 2026-04-20) lists 4 occurrences with 4 invoice numbers, but the evidence rows show 5 allocation rows including one for a different employee (Mahmoud Kamal Abdelwahed Muhammad, emp 1000862, JQ-26069578) — the occurrence count and the evidence rows are inconsistent, suggesting a grouping error in how the pipeline assembled this catch's evidence block.

## False-Positive Candidates (2)

- **EMP_SAME_DAY_MULTI_INVOICE / emp 1001016 / 2026-04-13** — The evidence block for Zayed Saleh Almuhanna on 2026-04-13 includes 8 allocation rows across invoices 02764, 02771, 02774, but most of those rows belong to other employees (Mahmoud Hammad, Abdelrahman Hamdan, Ghadeer Alfaleh, Ahmed Elsawy, Rahaf Alrefaei, Abdulrahman Alsaffar). Zayed only appears 3 times with distinct JQs (JQ-25091091, JQ-25079060, JQ-26112552) at amounts SAR 2450, 500, 262.5. The catch correctly identifies 3 occurrences, but the extra rows in the evidence block may have been included in error and could confuse a reviewer. The underlying catch is defensible but the evidence presentation is misleading.
- **EMP_SAME_DAY_MULTI_INVOICE / emp 1001016 / 2026-04-18** — Zayed Saleh Almuhanna's 5 rides on 2026-04-18 total SAR 6525 across 5 distinct JQs. All are different cost centers/agencies (all BMX/IVD), but each has a unique JQ — no JQ duplication. Given the field-sales nature of the role this could legitimately be multiple client visits. The LOW severity is appropriate, but reviewer effort may not be justified given clean JQ distribution.

## Missed-Catch Candidates (4)

- **PARTIAL_ALLOC_MISSING_JQ — invoice 02897 has jq_lines=0 but cc_direct_lines=1 and distinct_employees=1 with a non-S&M division (IVD Solutions / BMX)** — Invoice 02897: allocation_lines=1, jq_lines=0, cc_direct_lines=1, divisions=['IVD Solutions'], agencies=['BMX']. Cost-center-direct rows are expected only for Warehouse/S&M lines per the KB description. An IVD Solutions / BMX line without a JQ is anomalous and not flagged. → suggested category: `PARTIAL_ALLOC_MISSING_JQ (or a new NON_WAREHOUSE_CC_DIRECT category)`
- **Two invoices 02859 and 02860 are fully reconciled AND appear in DUP_JQ_STRICT catch, meaning the pipeline accepted both invoices into the reconciled total while simultaneously flagging them as double-pay. The value_at_risk_sar is correctly stated as 1900, but total_invoice_value_sar presumably includes both invoices (SAR 2185 + 2185 = SAR 4370 gross). No hold flag or exclusion from reconciled count is visible.** — summary.reconciled_invoices=117, summary.unallocated_invoices=0. Invoices 02859 and 02860 both appear in allocation_sample as reconciled=true with header_total 2185.0 each. DUP_JQ_STRICT catch flags these as near-certain double-pay at SAR 1900 at risk. The pipeline should arguably flag these as pending/held rather than fully reconciled. → suggested category: `RECONCILIATION_STATUS_CONFLICT — flagged HIGH double-pay but counted as clean reconciled`
- **Same conflict for invoices 02908 and 02909 (DUP_JQ_STRICT for Abdulrahman Alsaffar at SAR 2950)** — Both 02908 and 02909 appear in allocation_sample with reconciled=true and header_total=3392.5. DUP_JQ_STRICT flags these simultaneously. Combined gross exposure is SAR 6785, of which SAR 2950 is at-risk duplicate. → suggested category: `RECONCILIATION_STATUS_CONFLICT`
- **Mohamed Abdelsalam Abdelsalam Elgamal (emp 1001256) on 2026-04-18: invoices 02867 and 02870 share the same amount (SAR 2950) and same agency (Dirui) and same cost center, with different JQs (JQ-26113088 vs JQ-25087406). This is not flagged as DUP_JQ_STRICT because the JQs differ, but the identical amount + same agency + same employee + same day pattern warrants at least a MEDIUM flag. It resembles the DUP_JQ_STRICT scenario but with two different JQ numbers — could indicate two JQs were issued for the same trip.** — EMP_SAME_DAY_MULTI_INVOICE catch for emp 1001256 shows invoice 02867 (SAR 2950, JQ-26113088, Dirui) and invoice 02870 (SAR 2950, JQ-25087406, Dirui) — same amount, same agency, same division. This is only captured as LOW same-day signal, not as a potential duplicate. → suggested category: `DUP_AMOUNT_SAME_AGENCY_SAME_DAY (new) or escalate existing EMP_SAME_DAY_MULTI_INVOICE to MEDIUM`

## Summary Consistency Issues (3)

- **value_at_risk_sar in summary (4850.0) equals 1900 + 2950 from the two DUP_JQ_STRICT catches. However, the EMP_SAME_DAY_MULTI_INVOICE catches all carry value_at_risk_sar=0.0 and PARTIAL_ALLOC_MISSING_JQ also 0.0. This arithmetic is internally consistent, but it means SAR 4,850 covers only the duplicate invoice amounts, not the gross invoice value of the duplicated invoices (which would be 2×SAR 2185 + 2×SAR 3392.5 = SAR 11,155). The value_at_risk_sar definition used is the net allocation duplicate amount, which is a defensible but narrow definition — this should be clearly communicated to reviewers.** — {'value_at_risk_sar_summary': 4850.0, 'dup_jq1_amount': 1900.0, 'dup_jq2_amount': 2950.0, 'invoice_02859_header': 2185.0, 'invoice_02860_header': 2185.0, 'invoice_02908_header': 3392.5, 'invoice_02909_header': 3392.5}
- **allocation_total_rows is reported as 117 at the bottom of the output, but the summary states allocation_lines=212. These are different fields (total invoices vs total allocation lines) but the naming 'allocation_total_rows=117' is ambiguous and could be confused with total allocation detail rows. Internally consistent if 'allocation_total_rows' means invoice count, but naming is misleading.** — {'summary.allocation_lines': 212, 'allocation_total_rows': 117, 'summary.invoice_count': 117}
- **EMP_SAME_DAY_MULTI_INVOICE catch for emp 1000584 (Ahmed Elsawy, 2026-04-20) lists occurrences=4 and invoice_nos has 4 entries, but the evidence block contains 5 allocation rows — the extra row is for a different employee (Mahmoud Kamal, emp 1000862, inv 02900). The total_sar=5625 appears to sum only Elsawy's 4 lines (1550+2250+475+1350=5625), so the arithmetic is correct for Elsawy alone, but the evidence block is contaminated with a foreign employee row.** — {'stated_occurrences': 4, 'evidence_allocation_rows': 5, 'extra_row_employee': 'Mahmoud Kamal Abdelwahed Muhammad', 'extra_row_emp_no': 1000862, 'stated_total_sar': 5625.0, 'elsawy_lines_sum': 5625.0}

## Severity Concerns (2)

- **PARTIAL_ALLOC_MISSING_JQ / invoice 02912** — LOW → MEDIUM: KB catch-rules.md explicitly specifies PARTIAL_ALLOC_MISSING_JQ as MEDIUM severity. The pipeline emitted LOW, which contradicts the canonical rule definition.
- **EMP_SAME_DAY_MULTI_INVOICE / emp 1001256 (Mohamed Elgamal) / 2026-04-18** — LOW → MEDIUM: Two of the three rides (invoices 02867 and 02870) have identical amounts (SAR 2950 each), same agency (Dirui), same cost center, and same employee on the same day. This sub-pattern within the same-day catch materially elevates the duplication risk beyond a generic multi-leg journey signal and should be escalated.

## Extraction Completeness

The Asateel pipeline sampled 5 of 117 PDFs and all 5 matched the allocation Excel header totals (pdf_sample_validation: 5/5). The allocation reconciliation math checks out for all sampled invoices (allocation_sum × 1.15 = expected_gross_vat15 with delta=0.0 across all visible rows). No completeness concerns on the extraction side, though the 67 omitted rows in the allocation_sample cannot be directly verified from the output provided.

## Next-Round Recommendations

- Correct the PARTIAL_ALLOC_MISSING_JQ severity from LOW to MEDIUM to match the KB specification in catch-rules.md.
- Investigate invoice 02897 (IVD Solutions / BMX, jq_lines=0, cc_direct_lines=1) — cost-center-direct rows without JQ in a non-Warehouse/non-S&M division are anomalous and should trigger PARTIAL_ALLOC_MISSING_JQ.
- Consider whether DUP_JQ_STRICT invoices (02859, 02860, 02908, 02909) should be held from 'reconciled' status or marked as 'pending_review' rather than counted in reconciled_invoices=117 and unallocated_invoices=0, since they are simultaneously flagged as near-certain double-pays.
- Fix the evidence block contamination in the EMP_SAME_DAY_MULTI_INVOICE catch for emp 1000584: the row for Mahmoud Kamal (emp 1000862) on invoice 02900 should not appear in Elsawy's catch evidence.
- Add a sub-rule or escalation path for same-day, same-agency, same-amount pairs within EMP_SAME_DAY_MULTI_INVOICE catches (as seen with Elgamal's two SAR 2950 Dirui invoices 02867/02870) — these warrant MEDIUM severity, not LOW.
- Clarify the definition of value_at_risk_sar in the summary to explicitly state it represents the net allocation duplicate amount (not the gross invoice header value), so reviewers are not misled about the true payment exposure (SAR 11,155 gross vs SAR 4,850 net).
- Rename 'allocation_total_rows' in the output to 'reconciled_invoice_count' or align it with 'allocation_lines' naming to avoid confusion between invoice count (117) and allocation line count (212).
