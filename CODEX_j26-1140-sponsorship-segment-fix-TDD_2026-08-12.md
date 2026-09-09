Implemented the TDD fix. No deployment, batch delivery, or wrangler actions were performed.

### Step 1 — Tests failed first

Added [test_j26_1140_sponsorship_segment_order.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_j26_1140_sponsorship_segment_order.py:1).

It covers:

- Production final-stage ordering with all five affected J26-1140 rows.
- Ambiguous agency `10072` across CRM/HF/EP Manpower variants.
- Preservation of the already-correct ticket groups:
  - `4860901746`
  - `4860966793/794`
  - `4861063587/588`
- Rejection of an unrelated `0F6C2F9AA`-style folder.
- Selection of the matching CRM OPEX owner folder.

Pre-fix result:

```text
FF                                                                       [100%]

FAILED test_final_stage_allocates_before_resolving_j26_1140_segments
E AssertionError:
E ['apply_sponsorship_event_segments',
E  'apply_sponsorship_allocations']
E !=
E ['apply_sponsorship_allocations',
E  'apply_sponsorship_event_segments']

FAILED test_exact_non_sis_ref_rejects_unrelated_folder_and_uses_matching_opex
E AssertionError:
E PosixPath('.../0F6C2F9AA')
E !=
E PosixPath('.../CRM-2026-43')

2 failed in 1.40s
```

### Step 2 — Minimal fixes

Changed [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1456):

```diff
 if invoice_serial and not invoice_serial.startswith("SIS-"):
+    expected_key = _canonical_event_serial(invoice_serial)
+    existing_key = _canonical_event_serial(str(p))
+    if existing_key == expected_key and _find_opex_pdfs(p):
+        return p
+    event_pdfs = _build_opex_event_pdf_index(all_folders).get(
+        expected_key, []
+    )
+    if event_pdfs:
+        row["_sponsorship_folder_status"] = "NORMALIZED_EVENT_SERIAL"
+        return _opex_owner_folder(event_pdfs[0])
     return p
```

The final `return p` preserves the existing fallback only when no canonical event OPEX form exists.

Swapped the final passes at [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6262):

```diff
-apply_sponsorship_event_segments(...)
 apply_sponsorship_allocations(...)
+apply_sponsorship_event_segments(...)
 inherit_ancillary_event_allocations(...)
```

No account, location-normalization, or employee-assignment policy was changed.

### Step 3 — Verification

Focused tests:

```text
..                                                                       [100%]
2 passed in 1.36s
```

The fixture verifies these final tuples:

```text
26-1049  CRM-2026-43  160014/170/10017/10072
26-1051  HF-2026-31   160014/170/10050/10072
26-1075  CRM-2026-45  160014/170/10017/10072
26-1076  CRM-2026-46  160014/170/10017/10072
26-1082  CRM-2026-43  160014/170/10017/10072
```

Already-correct regression assertions also passed:

```text
4860901746       CRM  160014/170/10017/10072
4860966793/794   EP   160014/170/10064/10072
4861063587/588   CRM  160014/170/10017/10072
```

Targeted existing folder-selection regressions:

```text
4 passed, 26 deselected in 1.44s
```

Compilation and whitespace validation passed.

The broader test selection produced `40 passed, 2 failed`. Both failures are outside this change:

- A real scanned LAB fixture currently omits employee `1000414`.
- The J26-1108 committed truth/output artifacts have already drifted from the golden snapshot, including artifact SHA, sponsorship-row counts, and `distribution` → `combo` schema naming.

Direct J26-1108 gate result:

```text
+ primary artifact semantic gate: batches/jawal-J26-1108/output/Spreadsheet-J26-1108-FILLED-v30.xlsx
J26-1108 GOLDEN DRIFT
```

Files touched:

- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1456)
- [tests/test_j26_1140_sponsorship_segment_order.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_j26_1140_sponsorship_segment_order.py:1)

No deployment or batch output was generated.

[status: done rc=0]
