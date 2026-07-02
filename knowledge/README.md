# Knowledge Base Index — AlJeel AP Agent

The canonical reference layer for AP processing. Six files, ~480 lines, no duplication of MEMORY.md.

## When to read which file

| Question shape | Read |
|---|---|
| "How do I process a new J&J / Asateel / Jawal batch?" | vendor-handlers.md |
| "What does catch category X mean? What's the severity?" | catch-rules.md |
| "Why did v1/v2 over-flag X? What was fixed?" | known-issues.md |
| "What vendor / cost-center / currency is this?" | master-data.md |
| "What GL account does catch X map to?" | gl-account-map.md |
| "Who do I escalate this to?" | escalation-paths.md |

## File map

- `vendor-handlers.md` — per-vendor file patterns, discovery, match strategy, benchmarks
- `catch-rules.md` — exact catch logic, thresholds, severity assignments
- `known-issues.md` — resolved bugs (v1 → v3) + open / known limits + process lessons
- `master-data.md` — vendor / cost-center / currency anchor (populated batch-by-batch)
- `gl-account-map.md` — Oracle GL account mapping (placeholder; populated as Oracle data lands)
- `escalation-paths.md` — Amr is the only contact. No vendor or AlJeel team pings.

## Update discipline

- New catch class seen → append to catch-rules.md AND known-issues.md
- New normalize() edge case → known-issues.md (with regression test note)
- New vendor / cost-center / GL code → append to master-data.md or gl-account-map.md
- New process lesson from QC → known-issues.md (process lessons section)

## What this KB does NOT contain

- Per-batch results (those live in `aljeel/batches/<batch-id>/` and the dashboard)
- Operator credentials, tokens, secrets (those live in `~/.openclaw/.env`)
- Accord-internal context (TAX, M&A, fleet) — boundary enforced in SOUL/AGENTS
- Vendor or AlJeel team contact names (escalation = Amr only)
