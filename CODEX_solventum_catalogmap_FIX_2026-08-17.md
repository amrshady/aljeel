Implemented and verified. No deployment performed.

What changed:

- Added committed, table-driven catalog rules for:
  - `CELLULOID` / SOF-LEX aliases → `1954`
  - `1954 × 100` pack conversion
  - Generic `Box-N` / `Bag-N` normalization
  - Lot-anchored `4870A2 → 56921KIT`
  - Controlled fallback for contradictory receipt evidence
- Added pre-match normalization preserving:
  - Raw extracted line
  - Normalized line
  - Applied rule ID and provenance
- Added fallback modes:
  - `trx` — new non-crashing default
  - `partial` — matches only reciprocal unique pairs and retains uncertain Sales rows
  - `error` — preserves explicit hard-fail behavior
- Reconciliation statuses are now `line_matched`, `partial`, or `trx_fallback`.
- Avoided replacing Sales manufacturer/UOM with raw GTIN or document `EA` values unless a controlled rule authorizes it.

Live cached smoke result:

- Line-mode rows: **86**
- TRX `2600015875`: **6 rows**
- Fully line-matched: **10 TRXs**
- TRX fallback: **14 TRXs**
- Focal output:
  - `1470A2` — 30 `Bag-1`
  - `1470A1` — 20 `Bag-1`
  - `1470A3` — 60 `Bag-1`
  - `1954` — 2000 `Box-1`
  - `56921KIT` — 5 `kit-1`
  - `1470B2` — 30 `Bag-1`

Remaining delta: row count and focal six-line result now match the clerk’s 86. Fourteen TRXs remain conservatively at TRX fallback because cached extraction contains tied duplicate Sales candidates, insufficient identifiers, or contradictory document evidence. No extraction JSON was hand-tuned.

Verification:

- Focused Solventum suite: **19 passed**
- Full suite: **132 passed, 5 failed**
- The same five known unrelated failures remain:
  - Allocation resolver
  - Asateel project allocation
  - Asateel trigger validation
  - J26-1108 scoring
  - Sponsorship allocation extraction
- `py_compile` and `git diff --check` passed.

Files touched:

- [scripts/solventum_chargeback.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/solventum_chargeback.py)
- [scripts/data/solventum_catalog_map.json](/home/clawdbot/.openclaw/workspace/aljeel/scripts/data/solventum_catalog_map.json)
- [tests/test_solventum_chargeback_line.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_solventum_chargeback_line.py)

Working-tree status for these files:

```text
 M scripts/solventum_chargeback.py
?? scripts/data/solventum_catalog_map.json
?? tests/test_solventum_chargeback_line.py
```

The script and test file already contained earlier uncommitted Solventum work, so repository-wide diff statistics include that prior implementation as well. No generated smoke artifacts were committed.
