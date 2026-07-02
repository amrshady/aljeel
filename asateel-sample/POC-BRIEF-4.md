TASK: Repoint the POC's Gemini calls to go through the Cloudflare AI Gateway (exactly like the Al Jawal scripts), then run the FULL CENTRAL folder (all 92 PDFs). EDIT mode: only modify asateel-sample/asateel_poc.py. Do NOT touch pipelines/, scripts/, deployed/portal code. Report; do not deploy.

# CRITICAL — ROUTE THROUGH CLOUDFLARE ONLY (no direct Google, no LiteLLM)
The POC currently calls Gemini with the google-genai SDK `genai.Client(api_key=key)` which hits
generativelanguage.googleapis.com DIRECTLY. That is WRONG. All Gemini traffic MUST go through the
Cloudflare AI Gateway, identical to the Jawal scripts.

Reference implementation to COPY: /home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent.py
- GEMINI_BASE_URL = os.environ.get("GEMINI_BASE_URL", "https://gateway.ai.cloudflare.com/v1/3724a3e71944b366a39b3735aa117a58/accord-aljeel-ap/google-ai-studio/v1beta")
- It calls: POST f"{GEMINI_BASE_URL}/models/{model}:generateContent?key={GEMINI_API_KEY}" via urllib, JSON body with "contents":[{"parts":[...]}], generationConfig (temperature, maxOutputTokens, responseMimeType application/json), parses candidates[0].content.parts[0].text. See its call_gemini() (around line 273) and the model cascade GEMINI_MODEL_CASCADE = ["gemini-pro-latest","gemini-2.5-pro","gemini-2.5-flash"].

# WHAT TO CHANGE IN asateel_poc.py
1. Replace the google-genai SDK usage (genai.Client / client.models.generate_content / gtypes.Part.from_bytes)
   with a raw REST call to the Cloudflare gateway base URL, mirroring full_evidence_agent.call_gemini().
2. This is a VISION call (PDF page PNGs), so the parts list must include inline image data. Use the
   Google generateContent REST schema for inline images:
     "contents": [{"parts": [
         {"inline_data": {"mime_type": "image/png", "data": "<base64>"}},   # one per page
         {"text": "<the existing prompt>"}
     ]}]
   base64-encode each rendered PNG. Keep generationConfig with responseMimeType "application/json".
3. Add GEMINI_BASE_URL constant defaulting to the CF gateway URL above (env-overridable, same as Jawal).
4. Use the SAME model cascade as Jawal: try gemini-pro-latest first, then gemini-2.5-pro, then gemini-2.5-flash.
   (The current single GEMINI_MODEL "gemini-3.1-pro-preview" should be replaced by this cascade so it
   matches production and resolves correctly through the gateway.)
5. Keep GEMINI_API_KEY loading from /home/clawdbot/.openclaw/.env (load_env_key pattern). Never echo the key.
6. Keep retries/backoff (3x: 2s,5s,10s) on 429/5xx/timeout. Keep per-invoice JSON caching.
7. DELETE/RECACHE: the existing cache files in asateel-sample/_poc_out/_cache/ were produced via the
   DIRECT API. To be safe and consistent, IGNORE existing cache for this run: add a flag --refresh-cache
   that forces re-extraction through the gateway and OVERWRITES the cache. Run CENTRAL full with --refresh-cache
   so 100% of the output came through Cloudflare. (Keep caching writes so a later resume is cheap.)
8. Do NOT change allocation/split/Oracle-format/validation logic — only the transport layer (how Gemini is called)
   and the model cascade.

# KEEP the full-folder mode (may already be partially added in a prior interrupted run — verify it exists)
   --folder CENTRAL --full --out-suffix CENTRAL-full   enumerates all *_0001.pdf in "وسطي 11-2026", invoice=5-digit prefix, sorted.
   Robust per-invoice try/except -> RED placeholder row on failure, continue. Progress prints [extract i/N].
   Output: asateel-poc-oracle-CENTRAL-full-2026-06-20.xlsx + asateel-poc-trace-CENTRAL-full-2026-06-20.json
   (do not overwrite the 15-sample asateel-poc-oracle-2026-06-20.xlsx).

# VERIFY ROUTING before the big run
- After editing, do a 1-invoice smoke test through the gateway (e.g. CENTRAL 03041 with --refresh-cache) and PRINT
  the request URL host (must be gateway.ai.cloudflare.com) and confirm a valid JSON extraction came back. Only then
  proceed to all 92.

# RUN
  python3 asateel-sample/asateel_poc.py --folder CENTRAL --full --out-suffix CENTRAL-full --refresh-cache
  (cwd = /home/clawdbot/.openclaw/workspace/aljeel)

# REPORT (stdout)
- Confirm: "All Gemini calls routed via gateway.ai.cloudflare.com" + the base URL used.
- Per-invoice one-liner: inv, #lines, source(brand/salesperson/none), GREEN/YELLOW/RED counts.
- Totals: invoices, distribution rows, GREEN/YELLOW/RED, fully-resolved vs review.
- Sum col E (dedup per invoice) vs sum col M sanity check.
- CENTRAL vs Entry-1/Entry-2 hit-rate (Agency/CC/DIV) across all matchable invoices.
- Any RED-placeholder invoices + reason. Header A..AF still matches Jawal reference.
- Final xlsx + json paths.

# CONSTRAINTS
- Cloudflare gateway ONLY for LLM. No direct generativelanguage.googleapis.com, no LiteLLM.
- ONLY lookup = Aljeel_Lookups-v2.xlsx. Entry sheets = answer key only.
- Only edit asateel-sample/asateel_poc.py. New output files only. No deploy.
