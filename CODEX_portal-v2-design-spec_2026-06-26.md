   - Show Attention Needed.
   - Show Recent Runs.
   - Show compact Latest Batch Status table.

6. **Implement Batches list**
   - Use dense table.
   - Add search, filters, and sort.
   - Include evidence link and latest run actions.
   - Keep `Run Batch` available with 409 handling.

7. **Implement Batch detail**
   - Show batch summary.
   - Show latest run summary.
   - Show run history table, last 20.
   - Add actions to run, cancel, evidence, report, and SPLIT.

8. **Implement Run detail**
   - Add run status header.
   - Add `RunStatusStageBar`.
   - Poll active states using existing poll mechanism.
   - Add terminal summaries and output links.
   - Add cancel confirmation.

9. **Implement Global Runs**
   - Aggregate runs across batches if needed.
   - Add search, status/date filters, and sort.
   - Link every row to batch, run detail, report, and SPLIT when available.

10. **Implement Risk & Inconsistencies**
    - Dense sticky-header table.
    - Add RED/YELLOW/GREEN filters.
    - Add search across ticket, employee, account/GL, cost center, QC catches.
    - Add evidence links per row.
    - Ensure title never says “Fraud.”

11. **Implement Evidence browser**
    - Add batch selector.
    - Add folder tree.
    - Add PDF preview/fallback.
    - Add `.msg` / `.eml` email viewer.
    - Add unknown-file fallback.

12. **Wire interaction states**
    - Loading skeletons.
    - Empty states.
    - Error states.
    - Toasts.
    - 409 busy host messaging.
    - Cancel flow.

13. **Quality pass**
    - Verify no route touches v1 `/portal`.
    - Verify auth/proxy plumbing remains unchanged.
    - Verify no SSE/EventSource is introduced.
    - Verify SPLIT-only downloads.
    - Verify report naming is exactly `Risk & Inconsistencies`.
    - Verify tables remain usable at 100-200 report rows.
    - Verify all numeric/currency values are right aligned.
    - Verify keyboard focus states are visible.

---

# 8. Acceptance Criteria

The redesign is successful when:

- The landing page is an overview dashboard, not a raw card grid.
- A reviewer can browse all batches from `#/batches`.
- A reviewer can browse previous runs globally from `#/runs`.
- A reviewer can open a batch and see its last 20 runs.
- A reviewer can open a run and see status, stage, duration, outputs, and cancellation controls.
- A reviewer can open `Risk & Inconsistencies` from a completed run.
- A reviewer can filter 100-200 report rows without losing context.
- A reviewer can browse evidence by batch and open PDFs/emails.
- Failed, stalled, risky, and not-run states are visible at a glance.
- Busy host `409` is surfaced clearly and never described as queued.
- The UI uses Accord Partners brand v2.0 tokens exactly.
- The implementation remains vanilla JS with no framework and no build step.

[status: done rc=0]
