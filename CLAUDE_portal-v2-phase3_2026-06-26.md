Implemented Phase 3 in [scripts/droplet_api_v2.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_v2.py:1). No v1 route/module edits, no deploy, and the live service was not restarted. The local harness was started on `127.0.0.1:5103` and stopped after verification.

**Diff Summary**
- Added v2 evidence endpoints:
  - [evidence_tree](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_v2.py:559)
  - [evidence_file](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_v2.py:580)
  - [evidence_msg_attachment](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_v2.py:602)
- Reused v1 helpers: `_parse_msg_payload`, `_parse_eml_payload`, `_msg_attachment`, `_atomic_copy`.
- Added run-scoped traversal guards against `run["evidence_root"]`.
- Added report endpoints:
  - [get_report](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_v2.py:628)
  - [generate_report](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_v2.py:656)
- Added report JSON payload builder/cache and manual refresh manifest update.
- Normalized report download labels at the v2 boundary to `Risk & Inconsistencies`.
- `python3 -m py_compile scripts/droplet_api_v2.py` passed.

This workspace is not a Git repository, so `git diff`/`git status` are unavailable here.

**Curl Verification**
Against run `J26-788-20260626T043340Z-075b83`:

```text
GET /v2/runs/.../evidence/tree
STATUS 200
folders=91 files=246
```

```text
GET /v2/runs/.../evidence/file?rel=<msg>
STATUS 200
type=msg, subject/from/to/body present, attachments returned
```

```text
GET /v2/runs/.../evidence/file?rel=INV-01-07 MAY 26 AL JEEL.pdf
STATUS 200
content-type=application/pdf, bytes=301394
```

```text
GET /v2/runs/.../evidence/msg-attachment?rel=<msg>&attachment=0
STATUS 200
content-type=image/png, bytes=1933
```

```text
GET /v2/runs/.../evidence/file?rel=../../etc/passwd
STATUS 400
{"error":"invalid_path"}
```

```text
GET /v2/runs/.../report?format=json
STATUS 200
label="Risk & Inconsistencies"
kpis={flagged_rows:45, sar_at_risk:73552.14, hard_count:15, fraud_catches:2}
rows=47
```

```text
GET /v2/runs/.../report?format=xlsx
STATUS 200
content-type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
sheets=Summary,Risk Catches,Hard Inconsistencies,All Catches
```

```text
GET /v2/runs/.../report?format=md
STATUS 200
heading="# Risk & Inconsistencies Report - J26-788"
```

```text
POST /v2/runs/.../report
STATUS 200
{"state":"ready","generated_at":"2026-06-26T05:17:11Z"}
```

Phase 3 backend endpoints are curl-complete.

[status: done rc=0]
