Both issues investigated and fixed. Verified with `py_compile` and mocked behavioral tests; no redeploy performed.

## Issue 1: 503s in Stage 2 — findings

The 503 tracebacks in run 0135fa8c were **not unhandled exceptions** — `call_gemini()` in `scripts/full_evidence_agent_v30.py:296` catches everything, but its except block called `traceback.print_exc()`, which is what dumped the raw tracebacks into the log. No row got a degraded result from this directly. The actual problems were:

1. **Retry, but the wrong kind**: on 503 it retried the *same overloaded model* 3 times with only 1s/2s/4s backoff — each attempt printing a full traceback (that's why you saw 3–4 tracebacks per row).
2. **No delay on fallback**: `call_gemini_with_cascade()` (line ~358) and the salesman-extract loop in `scripts/run_v30.py:415` did fall back to the next model, but immediately, with no breathing room — unlike the 15s-wait fix already in `qc/ai-poc/ai_document_parser.py:123-125`.

The rows completed because the cascade happened to succeed on the next model (the log shows flash failing with 503 then pro succeeding), so the existing fallback did its job — it was just noisy and hammered the overloaded endpoint.

### Fix applied (mirrors the `ai_document_parser.py` pattern)

**`scripts/full_evidence_agent_v30.py`:**
- Added `import urllib.error` and a dedicated `except urllib.error.HTTPError` branch in `call_gemini()`: on 503/UNAVAILABLE it prints one clean line (`[gemini/<model>] HTTP 503 Service Unavailable — skipping remaining retries`), skips the remaining same-model retries, and returns `unavailable: True` in the result dict. Non-503 HTTP errors keep the exponential backoff but log one line instead of a traceback. Only truly unexpected exceptions still print tracebacks.
- `call_gemini_with_cascade()` now sleeps 15s between models when the previous one returned 503, before falling through `gemini-pro-latest → gemini-2.5-pro → gemini-2.5-flash`.

**`scripts/run_v30.py`** (salesman-extract, line ~415): extended the model list to `flash → 2.5-pro → pro-latest` and added the same 15s wait before the next model when a 503 was hit. The error-string format is unchanged (`HTTPError: HTTP Error 503: Service Unavailable`), so existing log lines stay grep-compatible.

Mocked-503 test confirms: 1 attempt per model (was 3), `unavailable=True` propagated, exactly two 15s waits across the 3-model cascade, zero tracebacks.

## Issue 2: empty `ticket_no` — it's legitimate, validation was wrong

I checked the actual `invoice-source.xlsx` for J26-870. The 10 flagged rows (17–23, 25–27; row 24 is a normal flight) are **hotel/train rows**: the invoice column is literally headed "رقم التذكرة/ الفندق — Ticket/**Hotel** No." and for these rows it contains hotel voucher refs like `26-808`…`26-823`, with hotel names ("Hilton Rotterdam - 3 NTS.", "Kempinski Al Othman…") or "TRAIN ROUND TRIP EURO STAR" in the itinerary column. The parser's prompt defines `ticket_no` as "10-digit ticket number ONLY", so the model correctly emitted `""` — these rows genuinely have no airline ticket number. Previous runs showed "all valid" simply because earlier invoices had no hotel rows.

**Fix** in `qc/ai-poc/ai_document_parser.py:_validate_row()`: removed the non-empty check on `ticket_no` (with a comment explaining the hotel-voucher case). The key must still be *present* in each row, and `sl_no` emptiness is still an error — both verified by test.

One observation, not changed: the hotel voucher refs (`26-8xx`) are currently dropped entirely from the parsed output. If downstream evidence-matching would benefit from them, the prompt could be extended to put them in `notes` — say the word and I'll do it.
