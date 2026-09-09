Implemented line-level POD matching behind opt-in `--match-level line`. Default `trx` behavior remains unchanged and produces 90 Wave 2 rows.

Key changes:

- Added `PodExtractor` protocol and offline `JsonPodExtractor`.
- Added global one-to-one matching using lot, normalized codes, description codes/similarity, quantity, and UOM.
- Added deterministic pack-size conversion.
- Added the `1954: 20 × 100 → 2000` rule through fixture metadata.
- Added the lot-anchored `4870A2 → 56921KIT`, quantity 5 exception.
- Added duplicate-page line suppression.
- Added `--line-fallback trx|error`.
- Added optional `--reconciliation-report`.
- Filename TRX remains authoritative, including multi-TRX filenames.
- No Gemini or network calls occur.
- Workbook remains at 11 columns with normalized `Order Type` header.
- Nothing was deployed.

Tests:

- Focused Solventum suite: **10 passed**
- Wave 2 golden:
  - Default TRX mode: **90 rows**
  - Line mode: **86 rows**
  - TRX `2600015875`: **6 verified rows**
  - Other 23 TRX counts preserved
- Full suite with required `PYTHONPATH=.:scripts`: **123 passed, 5 failed**
- The five failures are unrelated, pre-existing areas:
  - allocation resolver
  - Asateel project allocation
  - Asateel trigger validation
  - J26-1108 truth scoring
  - sponsorship allocation extraction
- Plain full-suite invocation also encounters the repository’s existing `cost_center_resolver` import-path collection issue.

Files touched:

- [scripts/solventum_chargeback.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/solventum_chargeback.py)
- [tests/test_solventum_chargeback_line.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_solventum_chargeback_line.py)
- [tests/fixtures/solventum_wave2_pod_extractions.json](/home/clawdbot/.openclaw/workspace/aljeel/tests/fixtures/solventum_wave2_pod_extractions.json)

Diff summary:

```text
scripts/solventum_chargeback.py                 +300 -51
tests/test_solventum_chargeback_line.py         new, 215 lines
tests/fixtures/solventum_wave2_pod_extractions.json
                                                 new, 41 lines
```

The existing [tests/test_solventum_chargeback.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_solventum_chargeback.py) was not modified and passes unchanged.
