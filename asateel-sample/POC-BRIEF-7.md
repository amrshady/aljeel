TASK: v4 — fix the AGENCY segment by sourcing it from the supplier "Expenses Format" Agency text (the per-line brand) instead of the rep's Manpower home agency. EDIT mode: only modify asateel-sample/asateel_poc.py. Do NOT touch pipelines/, scripts/, deployed code. New output files only. Report; do not deploy.

CONTEXT: v3 scored Agency 78.3%, CC 94.3%, DIV 94.3%, full-combo 70.1% vs finance Entry-1/Entry-2. The remaining gap is almost entirely the AGENCY segment: v3 takes Agency from Manpower (the rep's HOME agency), but finance books the BRAND shipped on that line. The supplier "Expenses Format" tab has a per-line Agency text column that equals the finance-booked brand. OPERATOR VERIFIED this directly:
  03041 L2 "Solventum"->10202 (finance 10202 ✓), 03317 L1 "Fujifilm"->10041 ✓, L3 "Fluke"->10038 ✓, 03306 "Sakura"->10126 ✓, 03154 "MedSource"->10102 ✓. Only misses are pure name->code normalization (e.g. "GETINGE GROUP" should be 10100 but no exact Agency-sheet string match).

=== SUPPLIER SHEET FIELDS (Central-11-2026.xlsx, sheet "Expenses Format", data row 9+) ===
- col N (idx13) = Invoice Number (forward-fill down for multi-line invoices)
- col AF (idx31) = Agency TEXT (the per-line brand, e.g. "Solventum", "Fujifilm", "Fluke", "Sakura", "MedSource", "GETINGE GROUP")
- col AG (idx32) = Division text, col AI (idx34) = Solution text, col AJ (idx35) = Cost Center text
- col AO (idx40) = Employee Number, col X (idx23) = #Of JQ, col Y (idx24) = Employee Name, col AK (idx36) = AMOUNT
(Match supplier line to our distribution line the same way v3 already does: invoice + line order, amount fallback.)

=== FIX 1: AGENCY from supplier Agency text -> Agency lookup code (NEW primary for the agency segment) ===
For each distribution line, resolve the AGENCY segment as follows (highest precedence first):
  1. Supplier "Expenses Format" Agency text for that invoice+line -> normalize -> match against the Agency lookup sheet (qc/master-data/Aljeel_Lookups-v2.xlsx sheet "Agency": col AG=code, col DESCRIPTION=name). If it resolves to a code, USE IT as the Agency code + name. Source tag: "supplier_agency".
  2. Else fall back to the v3 behavior (Manpower home agency via emp_no, then brand path, then salesperson).
Normalization for the name->code match: lowercase, strip, collapse internal whitespace, strip trailing corporate words ("group","co","co.","company","inc","ltd","llc","medical","systems","scientific") when an exact match fails, and apply the EXISTING brand remap (3M->Solvento/Solventum, Biofire->BMX, Biomerieux->BMX) plus add these confirmed aliases discovered in this data:
   "getinge group" -> the Agency code whose name is Getinge (resolve by substring "getinge" against the Agency sheet; that is 10100 per finance) 
   Implement the substring/fuzzy fallback generally: if no exact normalized match, try (a) the brand-remap dict, (b) startswith/substring against Agency names, (c) token-overlap best match with a high threshold (>=0.9); if still nothing, leave agency unresolved and fall through to step 2. Record in a debug note which method matched.
IMPORTANT: This change affects ONLY the Agency code + Agency name segments. KEEP Cost Center, DIV, and Solution exactly as v3 resolves them (Manpower-driven CC/DIV at ~94%, supplier-text Solution). Do not regress those.

=== FIX 2: keep everything else from v3 ===
- Manpower emp_no join still drives CC/DIV (and the "Need to allocate"->RED rule).
- Solution from supplier text -> Solution code.
- Location=20100 all rows, Additional Info (empno | JQ one per line), multi-line capture, brand remap, A..AF header matches Jawal reference char-for-char.
- Amount split unchanged (operator deferred).
- Update the "Allocation Source" debug column to reflect when agency came from supplier_agency vs manpower/brand. Add/keep an "Agency Resolve Method" note (exact / alias / substring / token / manpower_fallback).

=== RUN ===
Smoke-test 03317 + 03041 first (expect L2 agency now 10202, 03317 L1 10041/L3 10038), print those lines, then full CENTRAL:
  python3 asateel-sample/asateel_poc.py --folder CENTRAL --full --out-suffix CENTRAL-full-v4
(cwd /home/clawdbot/.openclaw/workspace/aljeel). Reuse Gemini cache (allocation-layer change only, no re-extraction).
NEW outputs: asateel-poc-oracle-CENTRAL-full-v4-2026-06-20.xlsx + trace json. Do NOT overwrite v3.

=== RE-SCORE vs answer key + DELTA ===
Re-score v4 vs Entry-1/Entry-2 (same method as COMPARE-REPORT-v3). Write asateel-sample/COMPARE-REPORT-v4-2026-06-20.md with side-by-side v4 vs v3 vs v2 hit rates (Agency/CC/DIV/Solution/full-combo/amount, N/total). Also regenerate the diff workbook if cheap (optional): asateel-diff-vs-finance-v4-2026-06-20.xlsx using the existing build_diff_vs_finance_v3.py approach pointed at the v4 output (you may copy/param the script; do not edit pipeline code).

=== REPORT (stdout) ===
- 03317 + 03041 confirmation lines.
- New Agency hit rate + delta vs v3 (78.3%). Confirm CC/DIV/Solution did NOT regress.
- Agency resolve-method distribution (exact/alias/substring/token/manpower_fallback) and how many lines still miss agency + why.
- New full-combo rate + delta. GREEN/YELLOW/RED counts. Location=20100 100%. Header A..AF intact.
- Final xlsx + report paths.

=== CONSTRAINTS ===
- Only edit asateel-sample/asateel_poc.py (+ optionally a copied diff script). New output files only. No deploy.
- Canonical lookup = Aljeel_Lookups-v2.xlsx (Agency/Manpower/Solution sheets). Supplier input = Central-11-2026.xlsx "Expenses Format". Entry-1/Entry-2 = answer key only.
- Cloudflare gateway ONLY for any LLM call.
