Implemented flat root-level evidence support. No pipeline, batch, tests, or deployment were run.

Diff summary:

- [scripts/preflight_scan.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:22)
  - Root-level eligible PDFs are now body-scanned.
  - Filename and body extraction continues to support 10-digit tickets, `26-NNN` references, and PNRs.
  - Invoice, SOA, statement-of-account, and refund PDFs remain excluded.

- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2665)
  - Hard-gate indexing now includes root-level eligible PDF bodies.
  - Creates temporary, ticket-number-keyed logical bundle directories containing symlinks to the flat source files.
  - Companion PDF/MSG/EML files are attached only through a shared PNR/26-reference or at least two passenger-name filename tokens.
  - Passenger name and PNR cannot create a bundle; an embedded 10-digit ticket is required as the primary key.
  - Added the volume batch root to hard-gate indexing.

Changed functions:

- `collect_ticket_folder_names()` — [preflight_scan.py:187](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:187)
- `at_or_below_root()` — [preflight_scan.py:284](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:284)
- `should_scan_ticket_body_pdf()` — [preflight_scan.py:292](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:292)
- `build_ticket_folder_index()` — [run_v30.py:2977](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2977)
- `_at_or_below_root()` — [run_v30.py:3057](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3057)
- `_should_scan_ticket_body_pdf()` — [run_v30.py:3065](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3065)
- `build_bundled_ticket_pdf_map()` — [run_v30.py:3102](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3102)
- `_flat_filename_name_tokens()` — [run_v30.py:4635](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4635)
- `_collect_flat_evidence_bundles()` — [run_v30.py:4643](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4643)
- `_collect_evidence_folders()` — [run_v30.py:4716](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4716)
- Ticket-root initialization in `main()` — [run_v30.py:4836](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4836)

Folder-layout regression risk is low: existing physical-folder discovery remains unchanged and runs first. Logical bundles are additive, temporary, and ticket-named, so `find_folder_v25()` keeps its deterministic folder matching behavior. No fraud/QC checks or output columns were changed.

Operator verification for J26-1080:

```bash
python3 scripts/preflight_scan.py J26-1080 \
  --raw-dir batches/jawal-J26-1080/raw
```

Confirm `PREFLIGHT_MISSING_FOLDER` no longer appears for tickets embedded in the flat passenger PDFs and that `missing_folders` drops accordingly.

Then run the normal v30 workflow:

```bash
python3 scripts/run_v30.py J26-1080 --input-suffix v15.11.2
```

Confirm the 79 rows are no longer blanket-stamped `missing_evidence_gate`, logical ticket folders are resolved, Distribution Combination is populated where evidence supports it, and normal QC/fraud catches remain active.
