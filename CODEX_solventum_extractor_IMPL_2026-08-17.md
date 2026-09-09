Implemented the real POD extraction front-end. No deployment performed.

What changed:

- Added `GeminiPodExtractor` implementing `PodExtractor`.
- Direct Gemini API calls using `GEMINI_API_KEY`.
- Flash-first (`gemini-2.5-flash`), Pro fallback (`gemini-2.5-pro`).
- Whole-PDF multimodal upload.
- Candidate Sales lines included as non-authoritative prompt context.
- Filename TRX always overrides document references.
- Nullable lot/manufacturer/UOM fields accepted.
- SHA-256 disk cache keyed by PDF, model, prompt version, and prompt.
- Conservative `pdftotext` table pre-pass.
- New `extract` CLI producing reviewable JSON and per-file diagnostics.
- Fake-client unit tests covering cache, cascade, nullable fields, TRX authority, text path, vision path, and Sales context.

Example:

```bash
python3 scripts/solventum_chargeback.py extract \
  --pods batches/solventum/wave2_pods \
  --sales "batches/solventum/wave2_pods/JUNE SALES 2026.xlsx" \
  --out-extraction reviewed.json
```

Smoke test

All 24 PODs extracted:

- Text layer: 1
- Gemini vision: 23

Per-PDF confidence:

```text
2600014042  vision  0.95
2600015471  vision  0.98
2600015669  vision  1.00
2600015875  text    0.96
2600015947  vision  0.95
2600015963  vision  1.00
2600015965  vision  1.00
2600015967  vision  0.90
2600015968  vision  1.00
2600016032  vision  0.90
2600016033  vision  0.99
2600016255  vision  0.95
2600016282  vision  1.00
2600016310  vision  0.90
2600016384  vision  0.95
2600016541  vision  0.98
2600016577  vision  0.95
2600016659  vision  0.98
2600016726  vision  0.95
2600016855  vision  0.99
2600016942  vision  1.00
2600017290  vision  1.00
2600017291  vision  1.00
2600017490  vision  0.90
```

The live extraction did not reproduce the golden 86 rows:

- Strict line mode stops at `2600014042` with an incomplete/ambiguous assignment.
- With `--line-fallback trx`: 89 rows.
- TRX `2600015875`: 10 rows, not 6.
- 10 TRXs matched at line level; 14 used transaction fallback.

The focal text extraction found all six delivered lines, but identified the polishing item as `CELLULOID`; it did not independently establish the controlled `1954 × 100` mapping. I did not hand-tune the JSON.

Tests:

```text
Focused Solventum suite: 15 passed
Full suite: 128 passed, 5 failed
```

The five failures are the known unrelated failures listed in the implementation note:

- Allocation resolver
- Asateel project allocation
- Asateel trigger validation
- J26-1108 scoring
- Sponsorship allocation extraction

Files touched:

- [scripts/solventum_chargeback.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/solventum_chargeback.py)
- [tests/test_solventum_pod_extractor.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_solventum_pod_extractor.py)

Generated smoke artifacts:

- 26 ignored cache files under `batches/solventum/.extraction_cache/`
- Review JSON, workbooks, and reports under `/tmp`

Working-tree diff summary:

```text
scripts/solventum_chargeback.py         +565 -51
tests/test_solventum_pod_extractor.py   new, 104 lines
```

The script’s reported working-tree diff also includes its previously uncommitted shipped line-matcher changes. The deterministic matcher, offline JSON extractor, golden fixture, and existing tests were not modified.
