# AlJeel AP — AI Consistency Check: Final Summary (v16.2)

**Generated:** 2026-06-29 10:18 UTC
**Schema:** v16.2 — Pydantic v2 + Gemini responseSchema locked categories
**Model:** gemini-3.1-pro-preview (Cloudflare AI Gateway, 2M context)

## Headline Findings

### J26-640
- AI: **0 RED + 0 YELLOW** / ? rows
- **Total SAR at risk: 0.00**
- v15.11 flagged: **0 rows**
- Agreement: **11** | AI-only: **45** | Rules-only: **11**
- Pydantic valid: ? | Errors: 0
- Categories: _(none)_
- Cost: $? | Latency: ?s

### J26-788
- AI: **0 RED + 0 YELLOW** / ? rows
- **Total SAR at risk: 0.00**
- v15.11 flagged: **0 rows**
- Agreement: **7** | AI-only: **3** | Rules-only: **38**
- Pydantic valid: ? | Errors: 0
- Categories: _(none)_
- Cost: $? | Latency: ?s

## Schema Judgment

The v16.1 hardened schema enforces:
- 12 named primary_category values (no free-form invention)
- Structured Evidence (source enum + pointer + quote)
- value_at_risk_sar per row (enables SAR aggregation)
- entity_key for cross-batch tracking (computed post-call)
- top_5_cases with recommended_action enum
- Pydantic v2 validation gate: >5% row failures = hard stop
- Gemini responseSchema + responseMimeType enforcement (structural)

## Token Budget Actuals

| Batch | Input Tokens | Output Tokens | Total | Cost |
|-------|-------------|--------------|-------|------|
| J26-640 | 0 | 0 | 0 | $? |
| J26-788 | 0 | 0 | 0 | $? |

_Pricing: $2/M input, $12/M output (Gemini 3.1 Pro, Google March 2026)._