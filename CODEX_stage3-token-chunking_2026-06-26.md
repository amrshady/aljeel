# Codex Run — Stage 3 (ai_fraud_detector.py) Token-Ceiling Chunking Fix

**Run ID:** cx-20260626-104917-4073597
**Date:** 2026-06-26
**Status:** done rc=0 (NOT deployed)
**Tokens used:** 129,401

---

Implemented the fix in `qc/ai-poc/ai_fraud_detector.py`.

**What Changed**
- Updated Gemini input ceiling to the observed `1,048,576` limit and added a conservative `850,000` target.
- Replaced the old `chars/4` guard with a mixed UTF-8 byte/token estimate.
- Added oversized-batch chunking:
  - Small batches still use the existing one-shot request path.
  - Oversized batches build compact chunk payloads with all rows for that chunk, relevant full approval emails, compact all-email index, relevant manpower, and relevant cross-batch passenger/ticket history.
- Added merge logic that returns the same downstream schema: `per_row_verdicts`, `top_5_cases`, `batch_summary`.
- Added graceful fallback for impossible chunks: rows are retained exactly once as low-confidence manual-review YELLOW verdicts instead of being dropped or hard-failing.
- Preserved `GEMINI_API_KEY` handling and the existing batch cache mechanism.

**Why It Failed**
The original prompt packed the entire batch into one Gemini call: all invoice rows, full approval email bodies, all manpower rows, overrides, and full cross-batch history. For J26-593, email bodies plus cross-batch history dominated the request and Gemini rejected it even though the old local estimate was only ~518k tokens.

**Verification**
- `python3 -m py_compile qc/ai-poc/ai_fraud_detector.py`: pass
- Stub chunk/merge validation: pass
- `AI_POC_BATCHES=J26-593 python3 -u qc/ai-poc/ai_fraud_detector.py`: pass
  - Chunked Gemini call completed, no 400.
  - Output: `j26-593-fraud-ai-v162.json`
  - Rows in/out: `120 / 120`, unique SLs `120`
  - Pydantic valid: `True`
- `AI_POC_BATCHES=J26-788 python3 -u qc/ai-poc/ai_fraud_detector.py`: pass
  - Used existing cache, one-shot path unchanged.
  - Output: `j26-788-fraud-ai-v162.json`
  - Rows in/out: `100 / 100`, unique SLs `100`
  - Pydantic valid: `True`

Note: J26-593 has `161` rows in the resolved v30 spreadsheet, but Stage 3's actual input loader uses the Phase 1 parser file, which currently contains `120` invoice rows. The fix preserves every Stage 3 input row exactly once.

**Follow-Up Risk**
Chunked mode uses relevant full emails/history plus compact global indexes, not the full raw corpus in every request. That prevents token blowups while retaining cross-batch signal, but unusual approval references with no matching ticket/passenger metadata could be weaker than the previous impossible single-prompt approach.
