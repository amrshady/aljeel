# Accuracy Measure Rulebook v2 — Jawal

**Status:** v2 scorer definition
**Reference batches:** J26-1080, J26-1108, J26-1116
**Updated:** 2026-08-04 UTC

Institutionalizing accuracy + regression testing. This rulebook defines *how we
score a pipeline output against the Labadi-reviewed, Oracle-uploaded ground truth*.
Lock J26-1080 first, then replicate to the rest.

---

## 1. Ground truth definition

- **Truth file:** the supplied workbook identified as the Oracle-upload state evidence.
  Provenance claims stop there: never infer a download event. `AuditEvent` does not
  log `DOWNLOAD`, so the absolute latest downloaded file cannot be proven.
- **Truth sheet:** the **Oracle upload sheet** (the sheet with GL / Employee No /
  allocation columns). The other sheet is the original TAX INVOICE — **ignored** for
  accuracy scoring.
  - Sheet names are unreliable. Detect the Oracle sheet by its actual combination
    header. J26-1080 uses `GL`; Labadi v30 files use `Distribution Combination[..]`.
    `GL` is not accepted as a fallback for Labadi v30 files.

## 2. The accuracy unit — 5 segments (v2 scope)

**Authoritative source rule:** parse the five segments from the actual Oracle
`Distribution Combination[..]` upload column. Never infer truth coverage or accuracy
from the decomposed helper columns (`Account`, `Cost Center`, `DIV`, `Solution`,
`Agency`), because those helpers may be blank while the Oracle upload combination is
fully populated. This mistake invalidated the initial J26-1108 coverage/accuracy claim.

Ground truth encodes the full allocation as one Oracle GL combination string of 10
positional segments:

```
03 - 40100 - 60307021 - 160014 - 170 - 10017 - 10072 - 00000 - 00 - 000000
Co   Loc     Account    CostCtr   DIV   Sol     Agency  Proj   IC   Future
[0]  [1]     [2]        [3]       [4]   [5]      [6]     [7]    [8]  [9]
```

**v2 scores ONLY these 5 segments** (the AlJeel-defined allocation fields):

| # | Segment      | GL position | Truth source        | Pipeline column (v30-SPLIT) |
|---|--------------|-------------|---------------------|-----------------------------|
| 1 | Account      | [2]         | GL string split     | S "Account" (18)            |
| 2 | Cost Center  | [3]         | GL string split     | U "Cost Center" (20)        |
| 3 | DIV          | [4]         | GL string split     | W "DIV" (22)                |
| 4 | Solution     | [5]         | GL string split     | Y "Solution" (24)           |
| 5 | Agency       | [6]         | GL string split     | AA "Agency" (26)            |

Location [1], Company [0], Project/IC/Future = **out of v2 scope** (tracked, not scored).
Employee No = tracked separately (diagnostic), not part of the 5-segment score.

## 3. Normalization (applied to every segment before compare)

- Trim whitespace.
- Strip leading zeros from nonblank numeric segments.
- Empty / None remains blank. **Blank never equals `00000` or `0`.**
- Numeric floats like `1002317.0` → `1002317` (drop trailing `.0`).
- Compare as strings after the above.

## 4. Row alignment (THE hard part — must be key-based, never positional) — LOCKED

Row counts differ (truth 83 filled vs pipeline 82) and split-row ordering differs, so
**positional row matching is banned** — it produces garbage.

Matching is deterministic and staged. A valid `ticket-core` is the last 10 digits
of a contiguous ticket-number digit token of at least 10 digits.
- Truth ticket: `Ticket No.` column; pipeline ticket: `Description` column (holds the
  ticket). Both carry noise prefixes (truth prepends a 3-digit airline code e.g. `065`,
  pipeline prepends the ref e.g. `202639`) — the shared 10-digit core is the stable anchor.
- Employee No is **NOT** part of the key: on sponsorship batches the whole point of
  scoring is that the pipeline may allocate a ticket to a *different* employee than
  Labadi did — keying on emp hides that disagreement.
- A unique valid ticket-core matches first. Tax/upload amount is a **tiebreaker only**
  when a ticket-core repeats.
- Repeated/split rows are multisets. Equal normalized amount groups are paired by a
  stable tuple sort, preserving multiplicity rather than collapsing duplicates.
- Hotel, train, and other nonstandard/ticketless rows can match only on exact
  normalized description plus amount.
- Unresolved repeated cores are ambiguous and are never guessed. All remaining rows
  are reported unmatched.

**Key validation status:** ticket-core remains the candidate primary key, but all
previous J26-1108/J26-1116 accuracy percentages based on decomposed helper columns are
**withdrawn**. They must be recalculated from the authoritative Oracle
`Distribution Combination[..]` field before being locked.

**Reported alignment health:** matched, eligible covered+matched, unmatched truth,
unmatched produced, ambiguous groups, and method counts. Row-level audit records are
included in JSON.

**Unequal rows per key:** pad-and-miss (extra rows on either side count as segment
misses) and list them in the mismatch table.

## 5. Metrics reported

Coverage denominators contain **every invoice/upload data line**, without filtering
on Account, GL, or combination validity. Coverage is the number of nonblank valid
10-part actual combinations divided by all such lines, for truth and produced.

Per run, report:

1. Per-segment and all-5 exact metrics over rows that are matched and covered on both sides.
2. End-to-end per-segment and all-5 exact metrics. The denominator is exactly the
   complete truth row universe; unmatched truth, uncovered truth, ambiguous truth,
   and extra truth rows are padded misses. Unmatched produced rows are audited
   separately and cannot enlarge the truth-row universe.
3. Alignment health, method counts, ambiguity, and row-level comparisons.
4. Workbook core timestamps, filesystem UTC mtime, size, SHA256, and ingest row counts.

## 6. Reproducibility

Run `python3 qc/accuracy_v2/score_5seg.py --self-test`, then run the script without
arguments to score the three locked paths and regenerate the dated JSON and Markdown.
Historical preliminary figures are intentionally removed because they used superseded
alignment and/or helper-column semantics.
