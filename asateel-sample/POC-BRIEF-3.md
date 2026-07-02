TASK: Add a FULL-FOLDER run mode to asateel-sample/asateel_poc.py and run the COMPLETE CENTRAL folder (all 92 PDFs) end-to-end. EDIT mode: only modify asateel-sample/asateel_poc.py. Do NOT touch pipelines/, scripts/, or deployed/portal code. Do NOT change any allocation/split/format logic — only add the ability to enumerate a whole folder and parameterize the output filename. Report; do not deploy.

# WHY
The POC currently hardcodes 5 invoices per folder (the SAMPLES list). We now want the FULL CENTRAL
folder processed and written in the same Al Jawal Oracle-Fusion format already implemented.

# CHANGES (minimal, surgical)
1. Add argparse (or simple sys.argv parsing) to main():
   --folder {PROJECTS|ADMIN|CENTRAL|ALL}   (default: keep current 15-sample behavior if no args, so nothing else breaks)
   --full                                   when set with --folder X, enumerate EVERY *_0001.pdf in that folder instead of the SAMPLES subset
   --out-suffix <str>                       optional label appended to output filenames
2. Folder name resolution (Arabic dir names already in the file):
   PROJECTS -> "مشاريع 13-2026", ADMIN -> "اداره 8-2026", CENTRAL -> "وسطي 11-2026".
   For --full, list PDF_ROOT/<arabicfolder>/*_0001.pdf, derive invoice number from the filename (the 5-digit prefix), sort ascending.
3. Reuse the EXISTING gemini_extract caching (CACHE_DIR per folder__invoice json). The 5 already-cached CENTRAL invoices (03041-03045) must be reused from cache, not re-called. New invoices get fresh vision calls and are cached.
4. Output filenames when running full CENTRAL:
   asateel-poc-oracle-CENTRAL-full-2026-06-20.xlsx  and  asateel-poc-trace-CENTRAL-full-2026-06-20.json
   (use the --out-suffix / folder to build these; do not overwrite the existing 15-sample asateel-poc-oracle-2026-06-20.xlsx).
5. Everything else (extraction schema, brand->Agency(676)->Manpower->DIV/CC, salesperson path, YELLOW=empty allocation, multi-agency split per-line/even, the 59-col Oracle template writer, RED/YELLOW/GREEN fills, header A..AF validation, Entry-sheet scoring) stays EXACTLY as-is.

# ROBUSTNESS for a 92-PDF run
- Wrap each invoice's extract in try/except: on failure, log the error, write a RED placeholder row (invoice_no filled, allocation empty, Row_Status=RED, notes=the error) and CONTINUE — one bad PDF must not abort the whole run.
- Print progress: [extract i/N] folder inv  (so the run is followable).
- Keep per-invoice Gemini caching so a re-run is cheap/resumable.
- Be mindful of Gemini rate limits: if a call throws a quota/429/5xx, retry up to 3x with backoff (2s,5s,10s); if still failing, RED placeholder + continue.

# RUN
After the edit, run:  python3 asateel-sample/asateel_poc.py --folder CENTRAL --full --out-suffix CENTRAL-full
(from workspace root /home/clawdbot/.openclaw/workspace/aljeel ; the wrapper sets --cd there)
Let it process all 92. Use cache for the 5 already done.

# REPORT (print to stdout)
- Per-invoice one-liner: inv, #lines, allocation sources found (brand/salesperson/none), #GREEN/#YELLOW/#RED rows.
- Totals: invoices processed, distribution rows written, GREEN/YELLOW/RED counts, how many invoices fully resolved vs needing review.
- Sum of col E (invoice totals, dedup per invoice) and sum of col M (line excl-VAT amounts) — sanity check that splits sum back to the invoice subtotal.
- CENTRAL vs Entry-1/Entry-2 answer-key hit-rate (Agency/CC/DIV) across all matchable invoices now (not just 5).
- Any invoices that errored (RED placeholders) with the reason.
- Confirm header A..AF still matches the Jawal reference.
- Final paths of the written xlsx + json.

# CONSTRAINTS
- ONLY lookup = Aljeel_Lookups-v2.xlsx. Entry sheets = answer key only, never an allocation input.
- Only edit asateel-sample/asateel_poc.py. New output files only. No deploy.
