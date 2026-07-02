# Escalation Paths

When something breaks, who to ping.

---

## Primary contact

**Amr Shady (Accord CEO, admin)** — Telegram `1581837640`

All escalations route to Amr. Default behavior in the Aljeel Finance Telegram group: address Amr only. Do not ping any other operator, vendor contact, or AlJeel team member unless Amr explicitly directs it.

---

## When to escalate

| Trigger | Action |
|---|---|
| Pipeline error (crash, exception) | Capture stack trace + batch ID; surface to Amr |
| Extraction completeness gate fires repeatedly on a vendor | Surface to Amr with sample batch IDs |
| Cost run-up (single batch > $5, or daily cost > $20) | Surface to Amr immediately |
| New catch category seen that doesn't fit existing rules | Document in known-issues.md; surface to Amr |
| Dashboard down / Cloudflare Access issue | Surface to Amr with timestamp |
| Suspected double-pay confirmed (Asateel DUP_JQ_STRICT high-confidence) | Surface to Amr with full evidence trail |

---

## When NOT to escalate

- Routine batch completion → just update dashboard, no ping
- Single false-positive catch → file in known-issues.md for next QC round
- Cost <$1 batch → no notification
- Dashboard cache miss → self-resolve via rebuild

---

## How to surface

- **Telegram group:** `Malik // Aljeel Finance` (chat id `-5136922690`) for batch/pipeline matters
- **Direct DM Amr** (`1581837640`) for sensitive or off-topic
- Always include: batch ID, vendor, severity, value-at-risk-SAR, one-line root cause hypothesis
