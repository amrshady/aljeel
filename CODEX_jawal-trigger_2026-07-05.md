Implemented the Jawal trigger API and wired it into Flask without changing the existing Asateel trigger behavior or running/deploying the pipeline.

**What changed**
- Added [scripts/jawal_trigger.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/jawal_trigger.py:1)
  - `X-Jawal-Trigger-Key` auth via `JAWAL_TRIGGER_KEY`
  - `/jawal/openapi.json`, `/jawal/openapi.yaml`, `/jawal/run`, `/jawal/run/<run_id>`
  - In-memory FIFO queue, daemon worker, registry, status semantics
  - Calls the existing Jawal `_run_pipeline_worker` from `droplet_api_flask.py`, under the same `run.lock`, so it uses the canonical end-to-end pipeline path
  - Emails success/failure via `gog`, with `amr@accordpartners.ai` always cc’d
- Registered the blueprint in [scripts/droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:1525)
- Added:
  - [docs/jawal-trigger-api.openapi.yaml](/home/clawdbot/.openclaw/workspace/aljeel/docs/jawal-trigger-api.openapi.yaml:1)
  - [docs/jawal-trigger-api.AGENT.md](/home/clawdbot/.openclaw/workspace/aljeel/docs/jawal-trigger-api.AGENT.md:1)
  - [docs/jawal-vendor-interface-integration.md](/home/clawdbot/.openclaw/workspace/aljeel/docs/jawal-vendor-interface-integration.md:1)
  - [tests/test_jawal_trigger.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_jawal_trigger.py:1)

**Verification**
- `python3 -m py_compile scripts/jawal_trigger.py scripts/droplet_api_flask.py` passed
- `python3 -m pytest tests/test_jawal_trigger.py tests/test_asateel_trigger.py -q` passed: `11 passed in 0.83s`

**Diff note**
The worktree had pre-existing dirty changes in Asateel/portal files when I started. I left those alone. The relevant diff for this task is the new Jawal files plus the `jawal_trigger` import/register lines in `scripts/droplet_api_flask.py`. No deploy and no Flask restart were performed.

[status: done rc=0]
