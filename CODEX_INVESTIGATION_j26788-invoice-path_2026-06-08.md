Read-only investigation completed. No files edited.

**Verdict**

`J26-788.xlsx` was passed because Fix #5 changed a batch-layout helper into an invoice-selector. That was the wrong boundary.

`_resolve_jawal_batch_paths()` should resolve the batch directory and raw evidence directory. It should not decide what Excel file Stage 1 should parse as `--invoice-file`.

**Call Chain**

1. Portal run button uploads the selected file only if the user chose one:
   [portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:809) posts `/api/upload`, receives `invoicePath`, then calls `/api/process?...&invoice_path=...`.

2. Flask `/process` resolves the selected batch:
   [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:178) calls `_resolve_jawal_batch_paths(batch_id)`.

3. The live-layout branch scans batch-root `.xlsx` files:
   [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:96) treats root `.xlsx` files except `Spreadsheet`, `Master`, `Labadi`, etc. as invoice candidates.

4. The bad Fix #5 then wired that returned candidate into Stage 1:
   [CODEX_FIXES_invoice-upload-audit_2026-06-08.md](/home/clawdbot/.openclaw/workspace/aljeel/CODEX_FIXES_invoice-upload-audit_2026-06-08.md:81) shows:
   `elif discovered_invoice is not None: cmd1 += ["--invoice-file", str(discovered_invoice)]`.

5. `process_batch.py` receives `--invoice-file`, passes it into:
   [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:578), which calls `_load_voucher_empno_map()`.

6. `_load_voucher_empno_map()` expects a workbook with `Details` or sheet index `1`:
   [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:447). `J26-788.xlsx` only has one sheet named `Sheet`, so it is not valid for this explicit input path.

**What J26-788.xlsx Is**

`batches/jawal-J26-788/J26-788.xlsx` is a symlink:

`batches/jawal-J26-788/J26-788.xlsx -> archive/raw-J26-788/01-07may/J26-788.xlsx`

It is a raw Jawal tax invoice workbook. It has a single sheet named `Sheet`; the first rows show invoice metadata like “TAX INVOICE” and invoice number `J26-788`. It is effectively the same style/content as `INV-01-07 MAY 26 AL JEEL.xlsx`.

It is not the primary Stage 1 input. Stage 1’s real working input is the Oracle-style template selected here:
[process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:561), preferring output `Spreadsheet-*-FILLED-v4*.xlsx`, then `Spreadsheet-v4-input.xlsx`, then `Spreadsheet.xlsx`.

So: `J26-788.xlsx` is a raw/source/display/legacy artifact, not a legitimate explicit `--invoice-file` for the current `process_batch.py` contract. It is not an output artifact, but it also should not be passed as the user’s uploaded Stage 1 input.

**Why Discovery Picked It**

The live-layout branch does this:

[droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:101)

It scans every `*.xlsx` in the batch root and excludes names containing `Spreadsheet`, `Master`, `Labadi`, `input`, or `validation`. `J26-788.xlsx` survives that filter, so it becomes a candidate.

That was not the right thing to do. Fix #5 was misguided because it assumed “we discovered an invoice-shaped file in the batch folder” means “we should pass it as an explicit user invoice override.” Those are different concepts.

**What The User Means**

When the user says, “I uploaded a sheet,” they mean the sheet selected in the portal upload control:
[portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:217).

That file is uploaded into `/uploads/portal/<uuid>/<filename>` and then passed back as `invoice_path`. It is a user-provided file for this run.

`J26-788.xlsx` is different: it is already on disk in the batch folder as a symlink to the archive. The user did not upload that file through the portal during the run. So the complaint is valid: if they uploaded a sheet, the system should not silently substitute or additionally parse an unrelated server-side `J26-788.xlsx`.

**Should `_resolve_jawal_batch_paths()` Return An Invoice?**

No, not for this route.

The clean contract should be:

`_resolve_jawal_batch_paths(batch_id) -> batch_dir, raw_dir, error`

No `discovered_invoice`. No root `.xlsx` auto-selection in Flask. If any invoice-like discovery remains, it should live inside the component that actually needs it, with a precise validation contract.

**Correct Architecture**

`--invoice-file` should be passed to `process_batch.py` only when there is an explicit operator/user-provided override, such as the portal upload path after validating it is under `UPLOADS_DIR`.

It should not be passed just because `_resolve_jawal_batch_paths()` saw an `.xlsx` in the batch root.

Normal run:

```bash
python3 scripts/process_batch.py --batch <batch_dir> --raw-dir <raw_dir> --suffix v15.11.2
```

Explicit uploaded invoice/voucher workbook run:

```bash
python3 scripts/process_batch.py --batch <batch_dir> --raw-dir <raw_dir> --suffix v15.11.2 --invoice-file /uploads/portal/<uuid>/<file>.xlsx
```

Also, the frontend/backend naming is overloaded. The portal “Invoice File (Spreadsheet)” upload is being used as a run input, while `process_batch.py --invoice-file` specifically means “voucher employee-number source workbook with `Details`/sheet-index-1 semantics.” Those should be separated or renamed so uploaded comparison/display spreadsheets are not treated as voucher-map inputs.
