TASK: v3 accuracy fixes to the Asateel POC (asateel-sample/asateel_poc.py), then re-run FULL CENTRAL and re-score vs the finance answer key. EDIT mode: only modify asateel-sample/asateel_poc.py. Do NOT touch pipelines/, scripts/, or deployed/portal code. New output files only. Report; do not deploy.

CONTEXT: v2 output (_poc_out/asateel-poc-oracle-CENTRAL-full-v2-2026-06-20.xlsx) scored vs finance Entry-1/Entry-2.xlsm answer key: Agency 64.3%, CC 68.2%, DIV 54.1%, full-combo 7.0%. Root cause = we under-use the Manpower sheet and never map Solution. The supplier "Expenses Format" tab (already read in v2) provides Employee Number + JQ per line. These fixes pull the FINANCE-correct segments from the Manpower master via that employee number. We confirmed the data is present (see CONFIRMED FACTS). Do NOT change the amount-split logic (item #3 from the analysis is intentionally left as-is).

=== CONFIRMED FACTS (already verified by the operator — do not re-litigate, just use) ===
Manpower sheet in qc/master-data/Aljeel_Lookups-v2.xlsx has 16 columns. The POC currently only reads Emp No / Name / Location. The other columns carry the finance-correct allocation:
- Col A (idx0) = Emp No
- Col C (idx2) = Name
- Col I (idx8) = "Code"  -> THIS IS THE FINANCE DIV CODE. Distinct values present: 120, 170, 190, 192, 194, 196, 888. (The generic "DIV" lookup sheet does NOT contain 192/194/196 — that is why v2 DIV was wrong. Manpower col I is the source of truth for DIV.)
- Col J (idx9) = New Division (text label, e.g. "Dental & Medical Solutions")
- Col K (idx10) = "Code" -> New agency CODE (e.g. 10200, 10206, 88888, 10060)
- Col L (idx11) = New agency NAME (e.g. "S&M", "Technical Services", "Ansell", "G&A")
- Col M (idx12) = New cost center CODE (e.g. 160011, 160013, 250010, 140040)
- Col N (idx13) = New cost center NAME
- Col O (idx14) = ALLOCATION STATUS FLAG. Values: "Can Be used" (597), "Need to allocate" (63), "Charge to Medsource" (1), "there should be now expenses if any charge to Erbe" (1).
- Col P (idx15) = Solution (ONLY 13 rows populated: EP×4, CRM×6, HF×3) -> NOT a reliable Solution source.
Confirmed CC->DIV coupling in Manpower (1:1, use as fallback when only CC is known):
  160011->196, 160012->194, 160013->192, 160014->170, 140xxx->190, 250010->120, 200010->120, 190020->120, G&A CCs (120xxx/130xxx/150xxx/170xxx/370xxx)->888.

=== FIX 1: DIV + Agency + CC from Manpower via Employee Number (PRIMARY allocation path) ===
The supplier "Expenses Format" tab already gives Employee Number per line (col AO/idx41, value like 1001017) and JQ. For each distribution line that has a supplier-sheet employee number:
- Look up that emp_no in Manpower (col A).
- Pull DIV = Manpower col I, Agency code = col K, Agency name = col L, Cost Center code = col M, Cost Center name = col N directly. These become the resolved segments (overriding the brand/salesperson-derived values), because this is the finance master.
- Mark Allocation Source = "manpower_empno". GREEN when emp_no resolves cleanly in Manpower.
- This single join is expected to fix both the salesperson path (was ~28%) and the supplier-sheet DIV mismatches (110->192, 260->170 etc). Verify against the answer key.
Precedence for resolving a line's Agency/CC/DIV:
  1. manpower_empno (supplier-sheet emp_no -> Manpower)  [highest]
  2. existing brand path (brand -> Agency(676) -> Manpower cluster)
  3. existing salesperson path
  4. none -> YELLOW, leave segments blank/00000 (never guess)
Keep the debug "Allocation Source" column reflecting which path won.

=== FIX 2: DIV correction from CC (fallback) ===
For any line where Agency/CC resolved (via brand path) but emp_no was not available, set DIV from the CC->DIV coupling above (derive it generally: look up the resolved CC code in Manpower col M and read the co-located col I DIV; build that CC->DIV map once from Manpower). This replaces resolving DIV against the generic "DIV" lookup sheet. Net: DIV should always come from Manpower (col I), never from the standalone DIV sheet.

=== FIX 3: Solution segment from supplier "Expenses Format" text -> Solution lookup code ===
v2 wrote Solution=00000, killing full-combo. The supplier sheet has a Solution TEXT column (sheet "Expenses Format", col AI/idx35, e.g. "Dental Oral Care", "Microbiology", "General Lab", "EP", "VCD", "MII"/"Minimal Invasive Interventions (MII)"). Map that text to the Solution CODE via the Solution lookup sheet (qc/master-data/Aljeel_Lookups-v2.xlsx sheet "Solution", col SOL=code, DESCRIPTION=name). Confirmed mappings: "Dental Oral Care"->10054, "Microbiology"->10043, "General Lab"->10033, "EP"->10064, "VCD"->10052, "Minimal Invasive Interventions (MII)"->10008. Implement as a normalized (lowercase, trim, collapse spaces) description->code lookup against the Solution sheet so any supplier text that matches a Solution DESCRIPTION resolves to its code; unmatched -> 00000 with a note. Put the resolved Solution code in the Solution segment of the Distribution Combination (col N) and col Y, and the name in col Z.

=== FIX 4: "Need to allocate" -> RED hard-stop (mirror Jawal) ===
When a line resolves to a Manpower employee whose col O = "Need to allocate" (or the two special "Charge to..." strings), set Row_Status = RED and add the col O text to Notes (matches the existing Jawal rule: ALLOCATION_TARGET_MISSING -> RED). "Can Be used" -> no penalty. Keep the existing RED/YELLOW/GREEN fill logic; this just adds a RED trigger.

=== KEEP UNCHANGED ===
- Amount split logic (PDF per-line amounts) — DO NOT change (operator deferred this).
- Multi-line capture, brand remap (3M->Solvento, Biofire->BMX, Biomerieux->BMX), Location=20100 all rows, Additional Info column (empno | JQ one per line) — all from v2, keep working.
- A..AF Oracle header must still match the Jawal reference character-for-character.
- Cloudflare gateway ONLY for any LLM call.

=== RUN ===
Smoke-test invoice 03317 first (expected: line1 MII Solution 10008, line2 DIV fixed from 110->192, agencies via emp_no), print its lines, then run full CENTRAL:
  python3 asateel-sample/asateel_poc.py --folder CENTRAL --full --out-suffix CENTRAL-full-v3
(cwd = /home/clawdbot/.openclaw/workspace/aljeel). Reuse Gemini cache (no re-extraction needed; these are allocation-layer changes only).
Write NEW outputs: asateel-poc-oracle-CENTRAL-full-v3-2026-06-20.xlsx + matching trace json. Do NOT overwrite v2.

=== RE-SCORE vs answer key ===
After the run, re-score v3 against Entry-1/Entry-2.xlsm exactly as the v2 comparison did (reuse asateel-sample/COMPARE-* approach or the POC's built-in scoring). Print the new hit rates: Agency %, CC %, DIV %, full-combo %, amount % (N matched/total) and compare side-by-side to v2 (Agency 64.3 / CC 68.2 / DIV 54.1 / combo 7.0 / amount 22.9). Write asateel-sample/COMPARE-REPORT-v3-2026-06-20.md.

=== REPORT (stdout) ===
- 03317: confirm Solution codes, DIV fix, agency/CC via emp_no.
- Allocation source distribution (manpower_empno / brand / salesperson / none) and per-source hit rates.
- New overall hit rates vs v2, with delta per field.
- Count of "Need to allocate" RED rows.
- Solution match rate (lines with a resolved Solution code / total).
- Confirm Location=20100 100%, header A..AF intact.
- Final xlsx + json + report paths.

=== CONSTRAINTS ===
- Only edit asateel-sample/asateel_poc.py. New output files only. No deploy.
- Canonical lookup = Aljeel_Lookups-v2.xlsx (Manpower + Solution + Agency sheets). Supplier input = Central-11-2026.xlsx "Expenses Format" tab. Entry-1/Entry-2 = answer key only.
