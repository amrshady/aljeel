Implemented in [scripts/droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:150).

**What Changed**
- Added shared evidence discovery for:
  - `raw`
  - `gdrive-evidence`
  - `gdrive-evidence2`
  - `onedrive-pull`
  - `extracted`
  - portal-extracted folders under `uploads/portal/*/.../J26-*`
- Updated `_evidence_raw_dir()` to return the first existing candidate by priority, falling back to the old `batches/jawal-{batch_id}/raw` path.
- Updated `/batches` to use the same resolver and include:
  - `evidence_path`
  - size/count based on resolved evidence folder.

**Audit Findings**
- `batches/` has covered current batches:
  - `J26-550`: `raw`, evidence folders found, currently covered.
  - `J26-589`: `raw`, evidence folders found, currently covered.
  - `J26-593`: `raw`, evidence folders found, currently covered.
  - `J26-640`: `raw`, evidence folders found, currently covered.
  - `J26-788`: `raw`, `gdrive-evidence`, `gdrive-evidence2`, `onedrive-pull`, evidence folders found, currently covered via `raw`.
- `batches/jawal-J26-593-BLIND` and `batches/jawal-J26-640-TRULY-BLIND` have `raw`, but are not covered by the current exact `jawal-J26-\d+` batch listing rule.
- `uploads/portal/` contains 15 UUID dirs, each with one flat `INV-01-07_MAY_26_AL_JEEL.xlsx`; no subdirectories or extracted `J26-*` evidence folders.
- root `extracted/` exists, but contains cache folders only; no `J26-*` evidence folders.
- `archive/` has no `jawal-J26-*` dirs. It does have `raw-J26-593`, `raw-J26-640`, and `raw-J26-788`, already reached through `batches/*/raw` symlinks.

**J26-815 / J26-830 / J26-870**
- None of `J26-815`, `J26-830`, or `J26-870` exists anywhere under `batches/`, `uploads/portal/`, `extracted/`, or `archive/`.
- They are not blocked by `/batches` discovery anymore; the evidence data is absent on disk.
- Recommended sync path: materialize evidence into `batches/jawal-J26-{id}/raw` or `onedrive-pull`, or re-upload extracted/zip evidence through the portal so it creates a `J26-{id}` folder under a portal UUID.

**Verification**
- `python3 -m py_compile scripts/droplet_api_flask.py` passed.
- Flask test client `/batches` still returns the existing 5 batches, now with `evidence_path`.
- No deploy or pipeline scripts were run.

Note: this workspace is not a Git repository, so `git diff` was unavailable. The changed sections are lines `150-225` and `558-618`.

[status: done rc=0]
