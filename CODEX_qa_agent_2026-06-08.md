Implemented the QA agent and portal wiring.

**Changed Files**
- [scripts/qa_agent.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/qa_agent.py:1): new self-contained read-only QA agent with Excel/JSON/KB/evidence loading, Gemini call, JSON parsing, formatted `[QA]` report streaming, and saved report output.
- [scripts/droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:622): added lock-free `POST /qa-run` SSE endpoint.
- [dashboard/public/_worker.js](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/_worker.js:210): added `/api/qa-run` proxy route.
- [dashboard/public/portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:360): added secondary QA button, collapsible QA report panel, fetch-based SSE streaming, severity styling, and ephemeral QA state.

**Checks**
- `python3 -m py_compile scripts/qa_agent.py scripts/droplet_api_flask.py` passed.
- `node --check dashboard/public/_worker.js` passed.
- Portal inline script extraction + `node --check /tmp/portal-scripts.js` passed.

I did not run the live QA agent because that would make a real Gemini call. I also did not run `wrangler pages deploy`, per instruction.

Flask needs to be restarted for `/qa-run` to become active.

[status: done rc=0]
