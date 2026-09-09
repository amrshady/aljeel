Implemented the ingestion-only fix. No deployment or batch delivery was run.

Files touched:

- [scripts/run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py)
- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py)
- [scripts/full_evidence_agent.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent.py)
- [scripts/full_evidence_agent_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py)

Changes:

- Added CDF/OLE2 magic-byte detection for `.m`, `.ms`, and extensionless files.
- Preserved ordinary `.msg` behavior.
- Added `_NNNNNNN_` employee-number extraction alongside `(NNNNNNN)`.
- Added parsed subject/body fallback for employee numbers and PC signals.
- Routed truncated messages through evidence discovery, collection, indexing, flat-bundle handling, and stage 3c-related scans.
- Fixed v30’s parser adapter to consume `body_text`, ensuring embedded Oracle award types reach the classifier.
- PC home-segment lookup continues to use the extracted employee number directly, without requiring a snapshot name match.

Verification:

- Ticket `4860966722`: parsed `.m`, indexed `1002602`, body contains `Business Trip`.
- Ticket `4861013115`: parsed extensionless message, indexed `1002630`, body contains `Business Trip`.
- Both folders produce a `pc_rec` accessible through stage 3c’s `pc_index.get(str(folder))`.
- Normal `.msg` ingestion remains successful.
- A fake non-OLE2 `.m` file was rejected.
- All four files pass `py_compile` and `git diff --check`.

Diff summary: 4 files changed, 85 insertions, 32 deletions. No account-policy mapping was added or changed; the embedded award remains available to drive classification.

[status: done rc=0]
