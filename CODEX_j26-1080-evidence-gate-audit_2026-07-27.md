## Verdict

**DISCOVERY GAP**, triggered by a layout the pipeline does not fully support.

The evidence is present and the passenger PDFs contain the actual 10-digit ticket numbers. For example, `MR_AAMIR_SHARIF-86YW8B.pdf` contains:

- PNR: `86YW8B`
- Ticket: `4860401276`
- Passenger: Aamir Sharif

However, because the PDFs are files directly under `raw/`, the matcher indexes only their filenames and deliberately skips their PDF bodies. It therefore sees `86YW8B`, but never discovers `4860401276`.

The safest immediate fix is to **re-stage each passenger PDF inside a ticket-numbered folder**. The durable fix is a code change allowing root-level, non-invoice PDFs to be indexed by embedded ticket number and treated as logical evidence units.

## 1. Scripts implementing the matching

### Preflight emitter

[preflight_scan.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:321) implements the preflight scan.

- `read_invoice_tickets()` extracts each row’s trailing reference: [lines 146–178](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:146)
- `collect_ticket_folder_names()` indexes references found in evidence: [lines 183–219](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:183)
- `run_scan()` compares the two sets: [lines 321–344](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:321)
- The actual emission is:
  `emit("PREFLIGHT_MISSING_FOLDER", item)` at [line 344](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:344).

It is launched by:

- [_run_preflight_scan()](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:628)
- Portal v2 delegates to that function from [run_worker_v2.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_worker_v2.py:534).

### v30 hard gate

[run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2972) independently rebuilds an evidence-reference index and applies the allocation-blanking gate:

- `build_ticket_folder_index()`: [lines 2972–2991](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2972)
- `build_bundled_ticket_pdf_map()`: [lines 3094–3116](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3094)
- `cascade_row_no_folder()`: [lines 3131–3152](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3131)
- `stamp_missing_evidence_gate()`: [lines 3169–3232](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3169)
- Invocation before LLM processing: [lines 4882–4900](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4882).

The gate clears `account`, `cost_center`, `div`, `solution`, and `agency` at [lines 3221–3229](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3221). The workbook is then stamped RED/MISSING at [lines 4440–4467](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:4440).

### v15.11.2 QC cascade

The older `NO_FOLDER` detector is stricter:

- `_ticket_folder_exists()` requires a directory whose basename equals the ticket number exactly: [qc_catches_within_batch.py:265](/home/clawdbot/.openclaw/workspace/aljeel/scripts/qc_catches_within_batch.py:265)
- `_no_folder()` emits `NO_FOLDER` when that exact folder is absent: [lines 416–463](/home/clawdbot/.openclaw/workspace/aljeel/scripts/qc_catches_within_batch.py:416).

It has a special passenger/content fallback only for shared OPEX sponsorship folders, not ordinary passenger ticket PDFs.

### `discover.py`

[discover_jawal()](/home/clawdbot/.openclaw/workspace/aljeel/scripts/discover.py:259) selects the invoice and a probable evidence root. It does **not** perform the row-level preflight match.

Its documented/expected structure is a root containing date or per-ticket subdirectories: [lines 30–37](/home/clawdbot/.openclaw/workspace/aljeel/scripts/discover.py:30), with the root heuristic at [lines 274–289](/home/clawdbot/.openclaw/workspace/aljeel/scripts/discover.py:274).

## 2. Exact matching behavior

The row-side key is obtained from the final parenthetical in `Description`:

```text
... (4860401276)
```

`read_invoice_tickets()` stores that value as `ticket_no`. Despite the field name, supported tokens are:

- 10-digit ticket number
- `26-NNN` reference
- Six-character alphanumeric PNR containing both letters and digits

See normalization at [preflight_scan.py:24](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:24).

The evidence-side index scans:

- Directory names
- File basenames
- PDF bodies, but only for PDFs nested below the evidence root

See [collect_ticket_folder_names()](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:183).

The final operation is simple exact set membership:

```python
ticket["ticket_no"] not in folder_names
```

at [preflight_scan.py:338](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:338).

There is no correlation step such as:

```text
ticket 4860401276
  → passenger AAMIR SHARIF
  → MR_AAMIR_SHARIF-86YW8B.pdf
```

Nor is there a mapping from the row ticket number to the PDF filename’s PNR.

## 3. Passenger-name or PNR fallback

- **PNR:** Supported only as another exact reference token. It works if the row’s trailing reference is the same PNR found in the filename/body. It does not translate ticket number ↔ PNR.
- **Passenger name:** No passenger-name fallback exists in the preflight or v30 hard gate.
- **Booking reference relationship:** No parser builds a ticket-to-PNR association from PDF contents.
- **Downstream folder matcher:** `find_folder_v25()` can inspect ticket-folder contents for a ticket number, but it runs only over discovered directories and occurs after the hard-gate index is constructed: [run_v30.py:333](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:333).
- The older reverse index recognizes passenger names in Jawal PDF filenames, but only for PDFs located inside discovered evidence folders: [run_v16.py:140](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:140).

Thus there is no usable ordinary passenger/PNR fallback for this flat batch.

## 4. Why all 79 rows failed

J26-1080’s `raw/` contains **zero directories**. All evidence is directly under `raw/`.

The audit found:

- 79 invoice reference keys
- 58 filename-derived evidence tokens, mostly PNRs/event references
- `4860401276`: absent from both preflight and v30 indexes
- `86YW8B`: present because it appears in the filename
- Zero bundled PDF tickets

The decisive exclusion is:

- Preflight `nested_below_root()` requires `len(rel.parts) > 1`: [preflight_scan.py:278](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:278)
- Root-level PDFs are rejected at [line 292](/home/clawdbot/.openclaw/workspace/aljeel/scripts/preflight_scan.py:292).
- v30 has the same restriction at [run_v30.py:3051](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3051).

Therefore the ticket number printed inside `raw/MR_AAMIR_SHARIF-86YW8B.pdf` is never indexed.

Files such as `223_07012026_MAD_33DF6C1C3.pdf` do not help unless their filename or scanned body contains the exact row reference. The numeric prefix `223` is not a supported 10-digit ticket reference.

## Recommended minimal fix

### Immediate, lowest-risk fix

Re-stage each evidence bundle under a ticket-numbered directory:

```text
raw/
  4860401276/
    MR_AAMIR_SHARIF-86YW8B.pdf
    relevant approval email.msg
```

Then rerun from preflight/cascade onward. This satisfies preflight, v15.11.2 QC, v30 gating, and downstream evidence parsing without code changes.

### Durable code fix

Update both `preflight_scan.py` and `run_v30.py` to:

1. Permit root-level non-invoice PDFs in body scanning.
2. Extract their embedded 10-digit ticket numbers.
3. Index those ticket numbers.
4. Represent each matched flat PDF and its related approval files as a logical evidence bundle so downstream resolution can consume it.

Changing only `nested_below_root()` would prevent the immediate `NO_FOLDER` gate, but would not fully solve downstream resolution: `_collect_evidence_folders()` still discovers directories, not independent flat passenger bundles. Therefore a complete code fix needs logical flat-file grouping, preferably keyed by embedded ticket number, with PNR/passenger used only as secondary corroboration.

No files were modified.
