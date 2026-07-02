Implemented in [scripts/droplet_api_v2.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_v2.py:189).

Added routes:
- `GET /v2/batches/<batch_id>/evidence/tree?path=...`
- `GET /v2/batches/<batch_id>/evidence/file?path=...`
- `GET /v2/batches/<batch_id>/evidence/msg?path=...`

Shared helpers added:
- `_resolve_evidence_path(...)`: common traversal guard using `resolve(strict=False)` and `is_relative_to(root)`
- `_build_evidence_tree(...)`: bounded live tree, max depth `8`, max nodes `5000`, dirs-first sorting, hides `.evidence_text_index*`
- `_serve_evidence_file(...)` and `_serve_evidence_msg(...)`: reused by batch routes and the existing run file route
- `_batch_evidence_root(...)`: reuses `v1._resolve_volume_evidence_root(...)` first, then `v1._batch_evidence_candidates(...)`

The existing `/v2/runs/<run_id>/evidence/tree` snapshot contract is unchanged. The new routes are on `bp`, so the existing `@bp.before_request` auth gate still applies.

Validation:
- Parse check passed:
  `python3 -c 'import ast; ast.parse(open("scripts/droplet_api_v2.py").read())'`
- Waited until `/current-run` reported unlocked before restart.
- Restarted Flask with `.env` loaded and `nohup python3 scripts/droplet_api_flask.py`; current process is running on port 5000.
- Post-restart `/current-run`: `{"locked":false,"run_id":null,"since":null}`

Curl verification, no secrets shown:

```text
tree_http_code 200
Content-Type: application/json
tree_children ['16jun', '17jun', '18jun', '20jun', '21jun', '22jun', '23jun']
tree_counts {'dir_count': 89, 'file_count': 197, 'node_count': 286, 'truncated': False}

file_http_code 200
Content-Disposition: inline; filename="MR AHMED ALEM-92282U.pdf"
Content-Type: application/pdf
Content-Length: 163864
file_body_head 25 50 44 46 2d 31 2e 34
```

[status: done rc=0]
