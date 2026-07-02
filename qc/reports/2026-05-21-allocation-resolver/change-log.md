# Change Log - Allocation Resolver (2026-05-21)

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `scripts/msg_parser.py` | Production-grade .msg email body extraction with caching |
| `scripts/allocation_resolver.py` | 3-tier allocation resolver (deterministic + LLM + hierarchy) |
| `qc/tests/test_allocation_resolver.py` | 18 unit tests covering all tiers and edge cases |

### Modified Files
| File | Change |
|------|--------|
| `scripts/process_batch.py` | Added allocation resolver integration after resolve_line, before QC gates. New `--raw-dir` argument. When a line has ALLOCATION_TARGET_MISSING, runs the 3-tier resolver. If resolved, rebuilds the 10-segment combo using the subordinate's Manpower data. |
| `qc/qc_gates.py` | Added 4 new soft gate codes: S1a (ALLOCATION_RESOLVED_DETERMINISTIC), S1b (ALLOCATION_RESOLVED_LLM), S1c (ALLOCATION_RESOLVED_HIERARCHY), S1d (MULTI_ALLOCATION_PENDING_REVIEW). Added H14 hard gate for ALLOCATION_LOOP_DETECTED. |

### Backup Files
| File | Backup |
|------|--------|
| `scripts/process_batch.py` | `scripts/process_batch.py.bak-pre-allocation-20260521` |
| `qc/qc_gates.py` | `qc/qc_gates.py.bak-pre-allocation-20260521` |

## Key Design Choices

1. **3-Tier Architecture:** Deterministic regex > LLM (Gemini Flash) > Hierarchy fallback. Designed for when email bodies eventually contain allocation language.

2. **Hierarchy Fallback (Tier 3):** Uses Manpower org tree. Priority: same-Agency subordinate > any usable direct sub > indirect subs (2 levels). Single match = auto-resolve; multiple = MULTI_ALLOCATION_PENDING_REVIEW.

3. **No Regression Policy:** If no tier resolves, the original ALLOCATION_TARGET_MISSING flag is preserved. The resolver never makes things worse.

4. **Loop Prevention:** Never allocates to another "Need to allocate" employee (hard gate H14).

5. **Caching:** Both msg_parser and LLM results cached to `extracted/msg-cache/` and `extracted/allocation-llm-cache/` by SHA256 hash.

## Critical Finding

The .msg email bodies in J26-788 (all 84 files, 79 parseable) contain ONLY generic approval stamps. No allocation-target language exists. This is a data-level blocker requiring action from Laith's team.
