
## Stage 2.5 resilience: stale-parse guard + 503 fallback delay (2026-06-10)

Two gaps closed around the Phase 1 document parser (Stage 2.5):
- scripts/droplet_api_flask.py: if Stage 2.5 fails AND a stale `{batch}-ai-parsed.json` exists
  from a previous run, the pipeline now ABORTS instead of letting Stage 3 silently audit stale
  invoice data. If no stale file exists, behavior unchanged (warn; Stage 3 fails on missing file).
  NOTE: requires a Flask restart to take effect.
- qc/ai-poc/ai_document_parser.py: on HTTP 503/UNAVAILABLE the model cascade now waits 15s
  before trying the next model (previously zero delay — a short Gemini spike exhausted all
  3 models in seconds). Other errors still fall through immediately.

## Stage 5: Multi-employee row splitter (2026-06-10)

New final pipeline stage producing a second output file `Spreadsheet-{batch}-FILLED-v30-SPLIT.xlsx`
alongside the untouched v30 file. Rows with comma-separated Employee No (e.g. Euro Anesthesia
"1000477,1002037") are split into one row per employee; `*Amount` and `*Invoice Amount` are divided
equally (2dp, rounding remainder on the last row) and personal GL segments (Location, Cost Center,
DIV, Solution, Agency + names) are re-derived from Manpower per employee. Account/Project/IC/Future1
kept; Distribution Combination rebuilt. Unknown employees keep original segments and get
`EMP_NOT_IN_MANPOWER` in Agent Flags.

Changes:
- scripts/split_multi_emp.py: new script (importable `split_multi_emp()` + CLI)
- scripts/droplet_api_flask.py: STAGE 5 wired after Stage 4.5; SPLIT file copied to public
  outputs; new `/files/<batch_id>` (+ `/api/files/...`) endpoint reporting which outputs exist
- dashboard/public/portal.html: second "📥 Download Split Output" button, shown only when
  `/api/files/{batch}` reports the SPLIT file exists

Verified on J26-870: 27 rows in, 12 split, 39 out; *Amount and *Invoice Amount totals conserved
exactly; segments match Manpower (1000477→40100/GE, 1002037→10100/NUBOMED); non-split rows
byte-identical.

## v11-labadi (2026-05-22)

### Account Classifier Rebuild (Fix 3 — Labadi Matrix)
Rebuilt `classify_account()` in `cost_center_resolver.py` around Labadi's verbatim rules:

| Priority | Rule | Account |
|---|---|---|
| L1 | Sponsorship: OPEX/event refs (CRM-XX, HF-XX, EP-XX, SIS, DMS, ISHLT, Heart Failure, Prague Rhythm, DDW, etc.) | 60307021 |
| L2 | Recruitment: keywords OR HR approver Elham/Hessa | 60308007 |
| L3 | Annual leave / annual ticket | 21070229 |
| L4 | Training / course / certification | 60308009 |
| L5 | Personal travel | 11034013 |
| L6 | GE agency + warranty/project | 21070227 |
| L7 | DIV=888 (G&A) or DIV=190 (S&M overhead) | 60301004 G&A travel |
| L8 | All other DIVs (120, 170, 192, 194, 196, etc.) | 60301003 S&M travel |
| L9a | External (not in Manpower) + OPEX refs | 60307021 sponsor |
| L9b | External (not in Manpower) + no OPEX refs | 60301003 default travel |

### OPEX-Ref Segment Override (Fixes 1, 2, 4)
When sponsorship is detected from OPEX/event refs in description, segments are now derived
from the event reference code, not the employees Manpower data:

## v11-labadi (2026-05-22)

### Account Classifier Rebuild (Fix 3 — Labadi Matrix)
Rebuilt `classify_account()` in `cost_center_resolver.py` around Labadi's verbatim rules:
- L1: Sponsorship (OPEX/event refs) → 60307021
- L2: Recruitment (keywords OR HR approver Elham/Hessa) → 60308007
- L3: Annual leave → 21070229
- L4: Training → 60308009
- L5: Personal → 11034013
- L6: GE warranty/project → 21070227
- L7: DIV=888 or 190 → 60301004 (G&A travel)
- L8: All other DIVs → 60301003 (S&M travel)
- L9a: External + OPEX refs → 60307021 (sponsor)
- L9b: External + no OPEX refs → 60301003 (default travel)

### OPEX-Ref Segment Override (Fixes 1, 2, 4)
When sponsorship detected from OPEX/event refs, segments derived from event code:
- CRM refs → CC=160014, DIV=170, Agency=10072, Sol=10017
- HF refs → CC=160014, DIV=170, Agency=10072, Sol=10050
- EP refs → CC=160014, DIV=170, Agency=10072, Sol=10064
- SIS refs → CC=160011, DIV=196, Agency=10043
- DMS refs → CC=160013, DIV=192, Agency=10202
- Location=20100 for all sponsor rows
- EP solution code confirmed as 10064 (was pending/None)

### Golden Results (J26-640)
- Full combo match: 51/117 (43.6%)
- Excluding Location: 105/117 (89.7%)
- 12 remaining non-Loc diffs are employee resolver mismatches, not Account classifier errors
- 63 Location mismatches from Manpower data gap (494/662 at 10100; golden expects varied)

### Files Changed
- scripts/cost_center_resolver.py
- scripts/process_batch.py

## v15.3 — Location Resolver Overhaul (2026-05-22)

**Problem solved:** Location code  was a phantom default that didn't map to any real AlJeel region. It was being written for ~93 rows per batch (all employees with Manpower location=10100 HQ placeholder). This caused those rows to fail H4 UNKNOWN_LOCATION.

**Solution:** New  module with L0→L1→L2→L3 cascade:

| Layer | Logic | Coverage (combined J26-640+J26-788) |
|---|---|---|
| L0 | Employee's Manpower location (10100/30100/40100) | 184 rows (84%) |
| L1 | Email LLM — reads full .msg + attachments, asks where to charge? | 3 rows (1%) |
| L2 | IATA deterministic map (JED=40100, DMM=30100, RUH=10100, etc.) | 4 rows (2%) |
| L3 | LLM city classification for unknown IATAs (HAS→Hail→Central, etc.) | 1 row (0%) |
| INTL | International travel flagged for review | 5 rows (2%) |
| UNMAPPABLE | Hotel/transport/train rows with no IATA + no .msg | 28 rows (13%) |

**Key verification:**
- MERHEB/MOHAMAD MR (not in Manpower, RUH→JED trip): L0 misses → L1 reads email → To City: Jeddah → 40100 ✅
- HAS (Hail Airport): L3 LLM → region=central → 10100 ✅
- No 20100 in either output Excel: confirmed ✅
- Zero hard failures H4 UNKNOWN_LOCATION in both batches ✅

**Files changed:**
-  (NEW — full L0/L1/L2/L3 cascade module)
-  — L0 in resolve_line(), removed v12 20100 default
-  — L1 email block inserted after v2/L7.5, L7.5 uses L0 for valid pool_loc
-  — S28a (L0), S28b (L1 email), S28c (L2 IATA), S28 (INTL), S29 (L3), S30/S31 (fallbacks)
-  — new location flags added to INFORMATIONAL_FLAGS / REVIEW_WORTHY_FLAGS

## v15.3 — Location Resolver Overhaul (2026-05-22)

**Problem solved:** Location code  was a phantom default written for ~93 rows/batch (employees with Manpower location=10100 HQ placeholder). Caused H4 UNKNOWN_LOCATION failures.

**Solution:** New L0-to-L3 cascade in :

| Layer | Logic | Combined coverage (220 rows) |
|---|---|---|
| L0 | Employee Manpower location (10100/30100/40100) | 184 rows (84%) |
| L1 | Email LLM - full .msg + attachments, asks where to charge | 3 rows (1%) |
| L2 | IATA deterministic map (JED=40100, DMM=30100, RUH=10100...) | 4 rows (2%) |
| L3 | LLM city classification for unknown IATAs | 1 row (0%) |
| INTL | International travel - flagged for review | 5 rows (2%) |
| UNMAPPABLE | Hotel/transport/train - no IATA + no .msg | 28 rows (13%) |

**Verification:**
- MERHEB (not in Manpower, RUH->JED): L0 miss -> L1 email reads To City: Jeddah -> 40100 OK
- HAS (Hail Airport): L3 LLM -> central -> 10100 OK
- No 20100 in either output. Zero H4 hard failures. Both batches green.

**Files changed:** location_resolver.py (NEW), cost_center_resolver.py, process_batch.py,
qc_gates.py (S28a/S28b/S28c), excel_styling.py

## v15.6 — Location Resolver Realignment (2026-05-22)

**Context:** Confirmed from Amr/Laith that AlJeel's GL Location scheme is:
-  = Head Office (no rows in J26-640)
-  = Central Region (Riyadh-rooted trips — the valid default)
-  = Eastern Region (Dammam / Gulf coast)
-  = Western Region (Jeddah / Hejaz / Asir)

**Problem:** v15.3–15.5 treated 20100 as HQ placeholder/phantom and removed it from valid_locations. Manpower employee location codes drove GL location, which was incorrect — GL location should follow trip itinerary, not employee home region.

**Changes:**
1.  — Added : deterministic, no LLM, no Manpower, pure IATA-based:
   - Any international IATA → 20100 (Central default for intl/sponsored HCP trips)
   - Western city in itinerary (JED/MED/YNB/TIF/AHB/GIZ/TUU/ABT/EAM/RSI/AJF/TUI/WAE) AND NOT triangular-via-RUH → 40100
   - Eastern city (DMM/AQI/HOF) → 30100
   - No parseable IATA, triangular-via-RUH (JED RUH JED), or ambiguous → 20100
   - Triangular suppression:  → 20100 (routes through Riyadh HQ, not a western trip)
   - Western wins over Eastern on mixed itineraries ( → 40100)
2.  — Replaced L0 Manpower+L2/L3 IATA cascade with single  call. Added 20100 to valid_locations.
3.  — Removed all location override blocks (L1 email LLM, L7.5 pooled manager location, L9/OPEX sponsor origin, trip-classifier sponsor re-resolve). Location is now set once in  and never overridden.
4.  — Updated location gates: S28a/b/c/d for the 4 valid location codes. All clean, no yellow triggers for location alone.

**Results on J26-640 (117 rows vs. AlJeel canonical):**
- Location match: 114/117 = **97.4%** (was using Manpower location in v15.5 which was wrong)
- Combo match: 104/117 = 88.9%

**Known deliberate mismatches (surfaced, not patched):**
- Sl#62, Sl#96 — : no IATA → our rule: 20100, canonical: 40100
  (Haramain High Speed Rail context; cannot determine Western vs Central without IATA)
- Sl#74 — : Ha'il is ambiguous city not in Eastern/Western carve-outs → our rule: 20100, canonical: 30100
  (Canonical may reflect employee Manpower location 30100 for this employee, which v15.6 deliberately ignores)

**Flag renames (v15.3–15.5 → v15.6):**
- Removed: LOCATION_FROM_EMPLOYEE_MANPOWER, LOCATION_FROM_EMAIL_LLM, LOCATION_FROM_IATA_MAP, LOCATION_FROM_LLM_CITY_CLASS, LOCATION_FALLBACK_TO_EMPLOYEE_HOME, LOCATION_UNMAPPABLE, LOCATION_INTERNATIONAL, LOCATION_SPONSOR_FROM_ORIGIN_IATA, LOCATION_SPONSOR_FROM_EVENT_REF, LOCATION_SPONSOR_ORIGIN_INTERNATIONAL, LOCATION_FROM_VENUE_LLM, LOCATION_VENUE_INTERNATIONAL
- Added: LOCATION_DEFAULT_CENTRAL_20100, LOCATION_FROM_WESTERN_CARVEOUT, LOCATION_FROM_EASTERN_CARVEOUT, LOCATION_HEAD_OFFICE_10100 (reserved)

## v15.6 -- Location Resolver Realignment (2026-05-22)

AlJeel GL Location scheme confirmed: 10100=Head Office, 20100=Central, 30100=Eastern, 40100=Western.
v15.3-15.5 had 20100 removed as 'phantom'. v15.6 restores it as the correct default for Central trips.

Changes:
- location_resolver.py: Added resolve_location_v15_6() -- deterministic IATA-based, no LLM, no Manpower
  Rules: intl IATA -> 20100 | Western city (JED/MED/TIF/AHB...) + not triangular-via-RUH -> 40100
         Eastern (DMM/AQI/HOF) -> 30100 | else -> 20100 (Central default)
  Triangular suppression: JED RUH JED -> 20100 (HQ routing, not western regional trip)
- cost_center_resolver.py: Replaced L0 Manpower + L2/L3 cascade with resolve_location_v15_6()
  Added 20100 to valid_locations.
- process_batch.py: Removed all location override blocks (L1 email LLM, L7.5 Manpower,
  L9/OPEX sponsor origin, trip-classifier sponsor re-resolve). Location set once in resolve_line().
- qc_gates.py: Updated location gates S28a-d for the 4 valid codes. No yellow triggers for location.

Results J26-640 (117 rows vs AlJeel canonical): Location 114/117 = 97.4%, Combo 104/117 = 88.9%

Known deliberate mismatches (surfaced, not patched):
  Sl#62, Sl#96: TRAIN TICKET -> our: 20100, canonical: 40100 (no IATA; Haramain rail context)
  Sl#74: HAS RUH -> our: 20100, canonical: 30100 (Hail ambiguous; canonical uses Manpower loc)

New flags: LOCATION_DEFAULT_CENTRAL_20100, LOCATION_FROM_WESTERN_CARVEOUT,
           LOCATION_FROM_EASTERN_CARVEOUT, LOCATION_HEAD_OFFICE_10100 (reserved)
Old flags retired: LOCATION_FROM_EMPLOYEE_MANPOWER, LOCATION_INTERNATIONAL, LOCATION_UNMAPPABLE,
                   LOCATION_FROM_EMAIL_LLM, LOCATION_FROM_IATA_MAP, LOCATION_FROM_LLM_CITY_CLASS,
                   LOCATION_FALLBACK_TO_EMPLOYEE_HOME, LOCATION_SPONSOR_FROM_ORIGIN_IATA, etc.
