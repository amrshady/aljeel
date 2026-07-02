TASK: Apply Amr's 5 refinements to the Asateel POC (asateel-sample/asateel_poc.py), then re-run FULL CENTRAL. EDIT mode: only modify asateel-sample/asateel_poc.py. Do NOT touch pipelines/, scripts/, or deployed/portal code. New output files only. Report; do not deploy.

CONTEXT: The POC already extracts Asateel transport invoices via Gemini (Cloudflare gateway), allocates brand/salesperson -> Agency(676)/Manpower -> DIV/CC, builds the Jawal Oracle-Fusion 59-col template, and supports --folder CENTRAL --full. Keep ALL that working. These are 5 surgical additions/changes.

=== CHANGE 1: MULTIPLE SALESPEOPLE / MULTI-LINE PER PDF (capture all of them) ===
Some PDFs contain MULTIPLE line items / multiple references-salespeople-brands on a single invoice. Example: وسطي 11-2026/03317_0001.pdf has 3 distinct lines (م/ المراكز الاولية 550; م/ الوطنية للرعاية 200; م/ دلة 200; subtotal 950, VAT 142.5, total 1092.5).
- The extraction prompt + parser MUST capture EVERY line item on the invoice (not just the first), each with its own reference (المرجع/contents), supply order, salesperson, brand, and line amount.
- Each extracted line -> its own distribution row sharing the invoice header (same C/E/F), with M = that line's excl-VAT amount. This is the existing multi-agency split path — verify it triggers for ALL multi-line invoices, not only the 2-line ones already seen (03041, 03044, 03045). Audit the prompt so 3+ line invoices are fully enumerated.
- If a line has no resolvable agency/salesperson, still emit the row as YELLOW with empty allocation (never drop a line; the sum of M across lines must reconcile to the invoice subtotal).

=== CHANGE 2: USE THE SUPPLIER "Expenses Format" TAB AS AN INPUT SOURCE ===
NEW INPUT: asateel-sample/_allocation/Central-11-2026.xlsx, sheet "Expenses Format". This file is provided BY the supplier and Amr wants us to read its "Expenses Format" tab as an additional INPUT (not just an answer key).
Layout (data starts row 9): col N(14)=*Invoice Number, X(24)=#Of JQ (e.g. "JQ-26111081"), Y(25)=Employee Name, AO(41)=Employee Number (e.g. 1001017), AF(32)=Agency, AG(33)=Division, AI(35)=Solution, AJ(36)=Cost Center, AK(37)=AMOUNT. Invoice number appears once on the first line of a multi-line invoice (blank on continuation rows -> forward-fill the invoice number down).
- Build an index keyed by invoice number -> ordered list of line records {jq, employee_name, employee_number, agency, division, solution, cost_center, amount}.
- Use this as a HIGH-CONFIDENCE allocation/enrichment source: when a PDF line maps to an Expenses-Format line (match by line order + amount, fall back to amount-only), pull employee_number + JQ for the Additional Info column (Change 5), and use its Agency/DIV/CC to corroborate or fill allocation. If the supplier line gives a concrete Agency/DIV/CC and the brand path was unresolved, adopt the supplier values and mark Allocation Source = "supplier_expenses_format" (GREEN if a clean 1:1 line match, else YELLOW).
- Keep Aljeel_Lookups-v2.xlsx as the canonical code/name lookup. The Entry-1/Entry-2 answer-key scoring stays separate and untouched.
- Path resolution: prefer asateel-sample/_allocation/Central-11-2026.xlsx for the CENTRAL run; make it an overridable constant/arg so other months can be pointed in later.

=== CHANGE 3: BRAND REMAP (alias normalization before Agency lookup) ===
Add a brand-alias remap applied at the point where extracted brand text is resolved to an Agency:
  "3M"        -> "Solvento"   (i.e. Solventum agency)
  "Biofire"   -> "BMX"
  "Biomerieux"-> "BMX"   (also match "BioMerieux"/"bioMérieux"/"bio merieux" case/space/diacritic-insensitive)
Implement as a normalized dict (lowercase, strip spaces/punctuation/diacritics) so variants collapse. Apply BEFORE the Agency(676) fuzzy match so the remapped name drives the agency code. Record the original extracted brand in the debug "Extracted Brand(s)" column and note the remap in Notes.

=== CHANGE 4: LOCATION = 20100 FOR ALL ENTRIES ===
Hard-set Location segment = 20100 for every row (col R and the Location segment inside the Distribution Combination, col N). It is already defaulting to 20100 in most rows — make it an explicit unconditional constant so no row can ever get a different/blank Location. Drop the "Location defaulted to 20100" caveat phrasing to a simple confirmation note.

=== CHANGE 5: ADDITIONAL INFO COLUMN (employee number + JQ, one per line) ===
Populate an "Additional Information" field per distribution row containing that line's Employee Number and JQ number, e.g.:  "1001017 | JQ-26111081".
- Source the employee_number + JQ from the Change-2 Expenses Format index (matched by invoice + line/amount). If only one is available, include what we have; if neither, leave blank with a note.
- "One per line": each distribution row carries exactly its own line's emp/JQ pair (do NOT concatenate all lines of the invoice into one cell).
- Placement: The real Oracle ADFDI template does not currently have a dedicated "Additional Information" header in A..AF. Add it as a clearly-labelled DEBUG-block column titled "Additional Information" (in the AG..BG debug region, near the front of the debug block) so the A..AF Oracle header still matches the Jawal reference character-for-character. Put the value there, one row per line. Also surface emp_no in col P (Employee No) where we have it, since these lines now have a real employee.

=== RUN ===
After edits, smoke-test invoice 03317 first (it is the multi-line example) and print its extracted lines + rows, then run the full CENTRAL folder:
  python3 asateel-sample/asateel_poc.py --folder CENTRAL --full --out-suffix CENTRAL-full-v2
(cwd = /home/clawdbot/.openclaw/workspace/aljeel). Reuse Gemini cache where valid; only 03317 and any newly-multi-line invoices may need re-extraction (use --refresh-cache only if the cached JSON is missing lines).
Write NEW outputs: asateel-poc-oracle-CENTRAL-full-v2-2026-06-20.xlsx + matching trace json. Do NOT overwrite the v1 CENTRAL-full files.

=== REPORT (stdout) ===
- 03317 specifically: confirm all 3 lines captured, their refs/agencies/amounts, and the Additional Info populated.
- Count of multi-line invoices detected and total distribution rows.
- Brand-remap hits (how many lines hit 3M->Solvento, Biofire->BMX, Biomerieux->BMX).
- Supplier Expenses-Format match rate: lines matched to a supplier line / total lines; how many allocations were filled/corroborated from it.
- Additional Info coverage: rows with emp_no+JQ / total rows.
- Confirm Location=20100 on 100% of rows. Confirm header A..AF still matches Jawal reference exactly.
- Sum col E (dedup/invoice) vs sum col M sanity check. GREEN/YELLOW/RED totals.
- Final xlsx + json paths.

=== CONSTRAINTS ===
- Cloudflare gateway ONLY for any LLM call (no direct generativelanguage.googleapis.com, no LiteLLM).
- Canonical code/name lookup = Aljeel_Lookups-v2.xlsx. NEW allowed input = Central-11-2026.xlsx "Expenses Format" tab. Entry-1/Entry-2 remain answer-key-only for scoring.
- Only edit asateel-sample/asateel_poc.py. New output files only. No deploy.
- Accord brand guidelines for any styling (fills already in place); Inter/navy if any new styling added.
