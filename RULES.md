# RULES.md — AlJeel AP Pipeline (Jawal Travel-Expense Processing)

**Pipeline version:** v15.10 (locked baseline tagged `*.BASELINE-v15.10`)
**Last reviewed:** 2026-05-22
**Match rate vs canonical (J26-640, 115 rows):** 99.1% full-row exact, 100% on every non-location segment
**Owner:** AlJeel AP demo agent · `~/.openclaw/workspace/aljeel/`

This document captures the **rules** the pipeline implements, not the row-level test cases. Specific input→output examples live in test fixtures (`qc/fixtures/`), never in source code or this document.

---

## 1. What the pipeline does

For each line in a Jawal vendor batch (airline tickets, hotels, airport transfers, registrations, meeting rooms, train tickets, etc.), the pipeline produces a 10-segment Oracle Fusion Distribution Combination:

```
Company - Location - Account - CostCenter - DIV - Solution - Agency - Project - Intercompany - Future1
```

The pipeline writes one xlsx row per invoice line with the combo plus extensive audit trace (resolution layer that fired, flags, agent action recommendation, form data captured for review).

---

## 2. Location segment — AlJeel's 4-code regional scheme

AlJeel uses these 4 GL Location codes (confirmed by Laith):

| Code | Region | When it applies |
|---|---|---|
| `10100` | Head Office | HQ-overhead activity (reserved; not currently produced) |
| `20100` | Central region | Riyadh-rooted travel that doesn't fit Eastern or Western — the default |
| `30100` | Eastern region | Trips with destinations exclusively in {DMM, AQI, HOF} |
| `40100` | Western region | Trips touching any Western city (Hejaz/Asir): JED, MED, YNB, TIF, AHB, GIZ, TUU, ABT, EAM, RSI |

### Resolution rule (deterministic, no LLM)

For a parsed trip itinerary (list of IATA codes), apply in order. First hit wins:

0. **Train ticket override:** Description contains "TRAIN TICKET" → `40100` Western. Haramain rail runs the RUH↔JED corridor; all train tickets post to Western regardless of employee home.

1. **Any destination is international** → `20100` Central. HQ funds intl travel — it's a Central regional cost, not a regional carve-out.

2. **Triangular `<Western> → RUH → <same Western>` pattern** → `20100` Central. Same Western city as both origin and final destination AND only middle stop is Riyadh = Riyadh-routed.

3. **Itinerary contains an ambiguous KSA city** (HAS, HMB, ELQ — don't sit cleanly in any region bucket) → `20100` Central.

4. **Itinerary contains any Western city** (no rule above fired) → `40100` Western. Western wins on mixed Western+Eastern itineraries.

5. **Itinerary contains any Eastern city** (no rule above fired) → `30100` Eastern.

6. **No parseable itinerary** (hotel name, venue text, meeting room with no IATA codes) → `20100` Central default.

### What does NOT decide location

- Employee's own home base in Manpower (col 4 `Location`) — that's HR purposes, not GL coding.
- Sponsor entity for sponsorship trips — sponsorship follows destination logic like any other trip.
- LLM inference — location is fully deterministic. Earlier versions (v15.3–v15.5) used LLM layers and introduced inconsistency.

### Extending when new cities appear

When a new IATA code appears in a future batch and gets the `20100` default but the canonical/Laith would have used a regional carve-out:

1. Determine region by **geographic principle**, not row-specific labeling
2. Add to the appropriate frozenset in `scripts/location_resolver.py` (`WESTERN_CITIES_V157`, `EASTERN_CITIES_V157`, or `AMBIGUOUS_KSA_V157`)
3. Re-score against canonical to confirm no regression

Don't memorize specific Sl#→code pairs. The mapping must be principle-based (geography + AlJeel accounting policy) so it generalizes to new batches.

---

## 3. Employee resolution (CC, DIV, Agency, Solution segments)

Cost Center, DIV, Agency, and Solution segments are derived from the traveler's identity. Resolution cascades through layers in priority order. First successful resolution wins.

### Layer cascade

| Layer | Trigger | Source |
|---|---|---|
| L0 / L1 emp_no_direct | Description carries explicit employee number | Manpower lookup by emp_no |
| **L0.5 Overrides table** | Pax name matches PaxOverrides OR resolved manager hits LineManagerOverrides | `qc/master-data/LineManagerOverrides.xlsx` |
| L1 form emp_no | Voucher-format Ref. No. column OR LLM-extracted Person Number from .msg | Manpower lookup |
| L4 GDS fuzzy | Pax name matched fuzzy to Manpower (after normalization) | Manpower with **surname-boost for AL/EL-compound surnames** |
| L7.5 reverse manager | Pax is a manager not in Manpower as employee | Subordinate cost-center pool |
| L7.7 LLM email allocation | No Manpower match and no form emp_no | Gemini reads full .msg + attachments |
| L8 manager-CC unanimity | L7.7 returns Person Number but no cost center | Subordinate cost centers — only if 100% unanimous |
| L9 sponsorship / external | External HCP being sponsored | Routed to sponsorship account 60307021 |

### Voucher → emp_no rule

Input batch xlsx has a column "Ref. No." (col 2). For two row types:
- **Airline ticket (10-digit ticket number):** Ref. No. is a PNR/Pax reference; ignore.
- **Voucher (`26-\d{3,}` ticket number — trains, hotels, airport transfers, registrations):** Ref. No. is the **employee number directly** (often with trailing `.` Excel formatting).

When voucher pattern matches AND Ref. No. is a 7-digit number → strip trailing `.` and feed as `form_emp_no` into the resolver. This single rule resolves train tickets cleanly and bonus-resolves ~25 other voucher rows per batch.

### GDS fuzzy disambiguation (surname-boost)

GDS pax format is `LASTNAME/FIRSTNAME TITLE` (e.g. `ALI/HESHAM MR`, `ALHAJJ/HUSAM MR`). When multiple Manpower employees partial-match on firstname, the AL/EL-compound surname disambiguates. Implementation: normalize both sides (strip spaces from `Al Hajj` → `ALHAJJ`), boost score by +50 when GDS lastname matches a Manpower-name token, restricted to AL/EL-compound surnames (len > 4) to avoid false positives on common single-word surnames.

### LLM-extraction principles

- **Full email body + all attachments** sent to the LLM — no character truncation
- **Oracle Fusion HCM internal IDs are not GL codes** — the LLM is explicitly instructed to ignore them
- **Only return `allocation_found: true` with explicit, named allocation** — يعتمد stamps and name signatures alone don't qualify
- **Returned codes are validated against master lookups** before being written; unknown codes get flagged, never silently posted
- **Manager emp_nos who don't have their own Manpower row are still valid** — L7.7's Person Number propagates to the primary Employee No

### L8 unanimity rule (manager-CC fallback)

When the LLM extracts a Person Number but no cost center, and the person is a line manager:
- Collect cost centers from all direct reports in Manpower
- If 100% identical → write that CC. Same independent check for DIV / Agency / Solution.
- If fragmented (2+ unique values) → check LineManagerOverrides table next; if no override → flag for human review

Threshold is exactly 100%, not "majority" or "best-fit". Earlier prototypes that accepted majority pool resolutions produced wrong allocations and were retired.

### Overrides table (Laith-maintainable institutional knowledge)

File: `qc/master-data/LineManagerOverrides.xlsx`

Two sheets:
- **LineManagerOverrides** — keyed by `manager_no`. Used when L7.5 resolves a manager but L8 finds fragmented subordinates.
- **PaxOverrides** — keyed by sorted pax tokens joined with `|` (e.g. `ali|hesham`, `adnan|al|mahrouq`). Used when the cascade fails to resolve the traveler in Manpower at all (typically C-suite + senior execs not in operational headcount).

Each row provides: emp_no (optional), cost_center, div, account, agency, solution, notes. Layer label when override fires: `v3_L_overrides`. Flag: `RESOLVED_VIA_OVERRIDES_TABLE`.

Maintenance: Laith adds 1 row per executive as they surface in batches. No code changes required.

---

## 4. Account segment

Account code distinguishes:
- `60301003` Travel Tickets Expense — S&M business travel
- `60301004` Travel Cost Expense G&A — G&A travel (DIV 888, 190, etc.)
- `60307021` Sponsoring Expenses — when traveler is sponsored external (L9 sponsorship trigger)
- `21070229` Accrued Employee Annual Tickets — when trip is detected as annual leave
- `11034013` Personal — when trip is detected as personal (family cluster, CHD passenger, etc.)
- `60308007` Recruitment Fees — when description indicates new-hire travel

Account is set by:
1. Sponsorship detection (L9) → 60307021
2. Trip purpose classifier (annual / personal / business / unknown / new-employee)
3. Explicit account in PaxOverrides → trust the override, skip downstream reclassification
4. DIV-based fallback (G&A vs S&M)

The DIV→account reclassification rule (DIV in {888, 190} → 60301004) only fires when account is unset AND resolver layer is NOT `v3_L_overrides`. This prevents PaxOverrides from being silently clobbered.

---

## 5. Sentinels and flags

- No `99999` sentinel anywhere — retired in v15.6. Location defaults to `20100` Central when unresolvable.
- Cost-center sentinel `999999` reserved for rows where the cascade fully fails. Row goes YELLOW with `EMPLOYEE_NOT_IN_MASTER`.
- All `LOCATION_FROM_*` and `RESOLVED_VIA_*` flags are informational (green-OK). All `*_UNKNOWN`, `*_MISSING`, `*_FRAGMENTED` flags are review-worthy (yellow).

---

## 6. Validation against canonical

The pipeline is validated against `qc/fixtures/aljeel-canonical/J26-640-Aljeel_version.xlsx` (the AlJeel-prepared reference).

### Critical validation rule: match by ticket number, NOT row position

- Ticket number is the stable cross-file identifier. Both files carry it (canonical col D, pipeline embedded in Description).
- Row position (`Sl. #` in canonical, row index in pipeline) is unstable — the two files have different sort orders.
- Comparison utility: `qc/score_against_canonical.py`. Run as:
  ```
  python3 qc/score_against_canonical.py <pipeline_xlsx> <canonical_xlsx>
  ```
- The utility extracts ticket numbers from each row (10-digit airline tickets or 26-NNN voucher refs), keys both files by ticket, then compares the 7 segment columns.
- **Never** compare canonical-vs-pipeline by row index.

### Current baseline match rates (v15.10 vs J26-640 canonical, 115 rows)

| Segment | Match | % |
|---|---|---|
| Company | 115/115 | 100.0% |
| Location | 114/115 | 99.1% |
| Account | 115/115 | 100.0% |
| Cost Center | 115/115 | 100.0% |
| DIV | 115/115 | 100.0% |
| Solution | 115/115 | 100.0% |
| Agency | 115/115 | 100.0% |
| **Full row exact** | **114/115** | **99.1%** |
| Excluding location | 115/115 | 100.0% |

These are the production thresholds. A drop below any of these per-segment numbers indicates a regression and requires investigation before the next batch ships.

The 1 remaining residual (NAGMALDIN HAS RUH posted by canonical to 30100) lacks any clean rule explanation — investigated and confirmed not employee-home-based, and HAS is geographically Northern not Eastern.

---

## 7. Process discipline (what the pipeline does NOT do)

- **Does not invent codes.** Any GL code written to the output must be in the master lookup (`Aljeel_Lookups.xlsx`) for its segment. LLM-returned codes are validated; unknown codes get flagged, never silently posted.
- **Does not silently default.** When the cascade fails, the row gets a sentinel + YELLOW row status + review flag — never a quiet fallback that masquerades as a real resolution.
- **Does not use LLM for deterministic decisions.** Location is pure code. LLM is only used where the source data genuinely requires human-grade reading (extracting allocations from forwarded email chains, classifying ambiguous trip purposes).
- **Does not memorize row-level mappings in code.** Codebase contains generalizable rules + reference sets. Specific name → segment overrides live in `LineManagerOverrides.xlsx`, maintainable by Laith without code edits.
- **Does not modify baseline files.** Snapshots tagged `*.BASELINE-vX.Y` are immutable rollback anchors.
- **Does not compare canonical by row position.** Always ticket-keyed via `score_against_canonical.py`.

---

## 8. Version history (high-level)

| Version | Anchor change |
|---|---|
| v14 | Replaced pool/majority manager-CC allocation with LLM-on-email extractor |
| v14.1 | Removed character truncation from LLM email input |
| v15 | Repaired golden validator, added LLM-code validity check, prompt tightening |
| v15.1 | Gemini cascade fix (correct model name), output token cap fix, MERHEB emp_no propagation |
| v15.2 | L8 Manager-CC unanimity fallback (replaces pool/majority logic permanently) |
| v15.3–v15.5 | Location-by-destination cascade with LLM layers (later replaced) |
| v15.4 | Sponsorship-origin location attempt (later corrected — sponsorship follows destination logic) |
| v15.6 | Deterministic location resolver (no LLM), based on AlJeel canonical scheme |
| v15.7 | Corrected city sets + reversed triangular rule. 88.7% full-row match. |
| v15.8 | LineManagerOverrides + PaxOverrides tables. 93.0%. |
| v15.9 | GDS fuzzy surname-boost + executive overrides + DIV-account clobber fix. 97.4%. |
| **v15.10 (current)** | **Voucher→emp_no detection + train-ticket location override. 99.1% full-row, 100% excl. location.** |

Baseline snapshots at `*.BASELINE-v15.4`, `*.BASELINE-v15.7`, `*.BASELINE-v15.8`, `*.BASELINE-v15.9`, `*.BASELINE-v15.10`.
