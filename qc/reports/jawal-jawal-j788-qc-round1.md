# QC Review — jawal / jawal-j788 — Round 1

**Generated:** 2026-05-22 12:20 UTC
**Model:** anthropic/claude-sonnet-4-6
**Tokens:** input=7043 output=3721

---

## Verdict: CONCERNS
**Confidence:** 0.78

## Structural Defense

The DUP_ROUTE catches are structurally defensible under the KB rules (same passenger + same route + same date). Five of the six DUP_ROUTE catches have gap_days=0, which is the strongest signal for change-without-cancel or genuine duplicate billing. The one with gap_days=2 (ALANAZI/FARHAN MR, RUH TUU RUH) is weaker but still within a plausible rebooking window and is correctly flagged at MEDIUM rather than escalated. The single VAT_MISMATCH catch (ticket 6905428854, Sponsoring Expenses routed item with 15% VAT instead of expected 0%) aligns with the KB's VAT_CLASS_VS_PCT rule for Jawal. All catches cite specific ticket numbers, passengers, and SAR values, making them actionable and independently verifiable.

However, the catch list appears severely incomplete relative to the flag_breakdown table, which shows 305 total flag hits across 12 categories for what appears to be a 100-row batch. Only 7 catches were surfaced. Categories like FORM_NOT_FOUND_IN_EMAIL (48 hits), NO_FOLDER equivalent, and FORM_EMP_NO_MISMATCH (8 hits) have no corresponding catches in the catch_summary, suggesting the pipeline either suppressed them or failed to promote them into the formal catch output. The KB explicitly assigns HIGH severity to NO_FOLDER and VAT_MISMATCH — yet only one VAT_MISMATCH was caught despite the flag_breakdown showing nothing under a NO_FOLDER-equivalent category.

## False-Positive Candidates (3)

- **DUP_ROUTE: AAMIR ABDELLATIF SHARIF, TRAIN SERVICE, 26-729/26-730** — Sequential ticket numbers (26-729, 26-730) on the same date for a train service may represent two separate legs of the same journey (e.g., outbound and return on same day), not a duplicate booking. The route label 'TRAIN SERVICE' is generic rather than a specific origin-destination pair, weakening the same-route inference. Needs physical verification before treating as at-risk.
- **DUP_ROUTE: MOSTAFA AMER, Kimpton Vividora Barcelona, 26-731/26-732** — Sequential ticket numbers (26-731, 26-732) on the same date for a hotel may represent a two-room booking or a split-billing arrangement (e.g., room + incidentals split across two invoice lines). The SAR 8,950 combined value is material but the sequential numbering pattern warrants checking whether this is a structural billing split rather than a duplicate.
- **DUP_ROUTE: SULTAN ABU DOGHMEH, Kimpton Vividora Barcelona, 26-733/26-734** — Same reasoning as MOSTAFA AMER — sequential tickets 26-733/26-734 on same date, same hotel. Notably, both MOSTAFA AMER and SULTAN ABU DOGHMEH have hotel duplicates at the same property on the same date (2026-05-01), suggesting this may be a systematic billing pattern for a group trip rather than individual duplicate errors. If both travelers attended the same event, the 4 tickets may all be legitimate.

## Missed-Catch Candidates (8)

- **NO_FOLDER / FORM_NOT_FOUND_IN_EMAIL — 48 rows where form was not found in email** — flag_breakdown shows FORM_NOT_FOUND_IN_EMAIL: 48, but zero catches of category NO_FOLDER or NO_APPROVAL appear in catch_summary. KB assigns HIGH severity to NO_FOLDER. → suggested category: `NO_FOLDER or NO_APPROVAL (HIGH severity per KB)`
- **FORM_EMP_NO_MISMATCH — employee number on form does not match master** — flag_breakdown shows FORM_EMP_NO_MISMATCH: 8, but no catch of this category appears in catch_summary. This is a data integrity signal that could indicate misrouted expenses or identity confusion. → suggested category: `FORM_EMP_NO_MISMATCH (likely MEDIUM-HIGH severity)`
- **EMPLOYEE_AS_SPONSORED — 8 rows where an employee is incorrectly classified as a sponsored party** — flag_breakdown shows EMPLOYEE_AS_SPONSORED: 8, no catch surfaced. This could represent misclassification of employee travel into sponsorship expense buckets, potentially a VAT or cost-center error. → suggested category: `EMPLOYEE_AS_SPONSORED (MEDIUM-HIGH severity, VAT implications possible)`
- **ALLOCATION_TARGET_MISSING — 26 rows with no allocation target** — flag_breakdown shows ALLOCATION_TARGET_MISSING: 26. No catch surfaced. Per KB, missing allocation targets are a meaningful control gap (analogous to PARTIAL_ALLOC_MISSING_JQ in Asateel). 26 out of 100 rows is 26% of the batch. → suggested category: `ALLOCATION_TARGET_MISSING (MEDIUM severity)`
- **MANPOWER_DIV_NOT_IN_MASTER — 60 rows flagged, nothing in catches** — flag_breakdown shows MANPOWER_DIV_NOT_IN_MASTER: 60 — the single most common flag in the batch, affecting 60% of rows. Zero catches surfaced for this. If the division is not in master, GL posting may fail or go to a suspense account. → suggested category: `MANPOWER_DIV_NOT_IN_MASTER (at minimum LOW-MEDIUM, possibly HIGH if it blocks Oracle posting)`
- **TRIP_PURPOSE_UNKNOWN — 47 rows** — flag_breakdown shows TRIP_PURPOSE_UNKNOWN: 47. No catch surfaced. Unknown trip purpose is a common audit requirement for travel expense approval; 47 rows is nearly half the batch. → suggested category: `TRIP_PURPOSE_UNKNOWN (LOW-MEDIUM, reviewer discretion)`
- **PERSONAL_CONTRIB_SELF_APPROVAL — KB describes this as a HIGH-severity audit catch (56 cases in reference benchmark)** — No PERSONAL_CONTRIB_SELF_APPROVAL catch appears in catch_summary or flag_breakdown for this batch. KB specifically calls this out as a major audit catch category. Either the batch has zero cases (possible) or the check was not run. → suggested category: `PERSONAL_CONTRIB_SELF_APPROVAL (HIGH severity per KB)`
- **Additional VAT_MISMATCH candidates — only 1 caught vs 54 FORM_TRIP_VALUE_DIFFERS flags** — FORM_TRIP_VALUE_DIFFERS: 54 in flag_breakdown, yet only 1 VAT_MISMATCH catch. Value differences between form and trip record could indicate pricing errors, VAT misclassification, or overbilling beyond the single flagged ticket. → suggested category: `FORM_TRIP_VALUE_DIFFERS / VAT_MISMATCH (HIGH severity where values diverge materially)`

## Summary Consistency Issues (5)

- **matched_rows, exception_count, reconciliation_rate, total_value_sar, and net_payable_sar are all null. This means the summary provides no usable financial totals and the reconciliation rate cannot be verified. The pipeline ran on 100 rows but produced no aggregate financial output.** — {'total_rows': 100, 'matched_rows': None, 'exception_count': None, 'reconciliation_rate': None, 'total_value_sar': None, 'net_payable_sar': None}
- **catch_count is reported as 7, which matches the 7 entries in catch_summary. However, flag_breakdown shows 305 total flag instances across 12 categories. The ratio of 7 formal catches to 305 flags is implausibly low and suggests the pipeline is failing to promote flags into catches, or catch_count only counts a subset of catch types.** — {'catch_count': 7, 'total_flag_instances': 305, 'flag_categories_with_no_catch': ['MANPOWER_DIV_NOT_IN_MASTER', 'FORM_TRIP_VALUE_DIFFERS', 'FORM_FUSION_CODES_LOGGED', 'FORM_NOT_FOUND_IN_EMAIL', 'TRIP_PURPOSE_UNKNOWN', 'ALLOCATION_TARGET_MISSING', 'EMPLOYEE_AS_SPONSORED', 'FORM_EMP_NO_MISMATCH', 'MANAGER_NOT_REALLOCATED', 'EMPLOYEE_NOT_IN_MASTER']}
- **layer_breakdown, top_gl_accounts, and top_divisions are all null, which makes it impossible to assess GL posting risk or division-level exposure. Given that MANPOWER_DIV_NOT_IN_MASTER affects 60 rows, top_divisions data is particularly important.** — {'layer_breakdown': None, 'top_gl_accounts': None, 'top_divisions': None, 'MANPOWER_DIV_NOT_IN_MASTER': 60}
- **pipeline_version is null. Given the KB describes v1, v2, v3 fixes for known bugs (e.g., VAT GL-name heuristic fixed in v2, multi-space self-approval regex fixed in v3), inability to confirm which version ran means we cannot confirm bug-fix coverage.** — {'pipeline_version': None}
- **value_at_risk_sar for the DUP_ROUTE catches sums to SAR 27,567.41 (5050 + 280 + 3565.01 + 8950 + 8950 + 772.40), plus SAR 2,000 for VAT_MISMATCH = SAR 29,567.41 total flagged at risk. With total_value_sar null, it is impossible to contextualize this as a percentage of batch value.** — {'dup_route_sum_sar': 27567.41, 'vat_mismatch_sar': 2000.0, 'total_value_at_risk_sar': 29567.41, 'total_value_sar': None}

## Severity Concerns (3)

- **VAT_MISMATCH: ticket 6905428854, AHMED/AHMED MOHAMED MR** — MEDIUM → HIGH: KB catch-rules.md explicitly assigns VAT_MISMATCH severity as HIGH. The pipeline assigned MEDIUM. A ticket routed to Sponsoring Expenses with 15% VAT when 0% is expected represents a direct financial error with a SAR 2,000 value at risk — this is not a soft signal.
- **DUP_ROUTE: ALANAZI/FARHAN MR, RUH TUU RUH, gap_days=2** — MEDIUM → MEDIUM: MEDIUM is correct per KB. The 2-day gap makes this less certain than same-day duplicates, so no escalation warranted, but it should not be downgraded either.
- **All FORM_NOT_FOUND_IN_EMAIL flags (48 rows) — not in catch_summary** — NOT FLAGGED → HIGH: Per KB, NO_FOLDER (equivalent evidence-missing category) is HIGH severity. 48 rows without email evidence is a major control gap and should be individually surfaced as catches, not silently absorbed into a flag count.

## Extraction Completeness

Extraction completeness cannot be assessed for this batch because total_value_sar, net_payable_sar, matched_rows, and reconciliation_rate are all null — the pipeline produced no aggregate financial totals. The flag_breakdown suggests extraction ran (305 flag instances recorded across 100 rows), but the absence of any SAR totals means the completeness_sar_ratio equivalent for Jawal cannot be computed or verified.

## Next-Round Recommendations

- Require pipeline_version to be non-null in all outputs; block batch approval if null, as bug-fix coverage cannot be confirmed.
- Investigate why 48 FORM_NOT_FOUND_IN_EMAIL flags and 60 MANPOWER_DIV_NOT_IN_MASTER flags produced zero formal catches — determine if the catch-promotion logic has a threshold filter suppressing these, and if so, lower or remove it.
- Emit total_value_sar and net_payable_sar even if approximate; null financial totals make the summary non-actionable for AP sign-off.
- For the Kimpton Vividora Barcelona hotel entries (tickets 26-731/26-732 for MOSTAFA AMER and 26-733/26-734 for SULTAN ABU DOGHMEH), verify whether these are two separate travelers at the same event (legitimate) vs. duplicate billing for the same room; the same-property same-date pattern across four sequential tickets warrants group-trip review.
- Re-examine the VAT_MISMATCH severity assignment in code — KB mandates HIGH but pipeline emitted MEDIUM. This is a code-level misconfiguration that will systematically under-prioritize VAT errors.
- Run PERSONAL_CONTRIB_SELF_APPROVAL check explicitly and confirm whether zero hits is genuine for this batch or whether the check was skipped (pipeline_version=null makes this unverifiable).
- Surface FORM_EMP_NO_MISMATCH (8 rows) and EMPLOYEE_AS_SPONSORED (8 rows) as formal catches with individual ticket references, not just flag counts — these have direct financial and audit implications.
- For ALLOCATION_TARGET_MISSING (26 rows), determine if these rows are being paid without a cost center assignment; if so, this is a HIGH-severity Oracle posting risk and should be escalated immediately.
