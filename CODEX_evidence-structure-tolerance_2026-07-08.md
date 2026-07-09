Implemented the structure-tolerant scanner fix. No deploy, no wrangler.

**Changed files**
- [scripts/full_evidence_agent_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent_v30.py)
- [scripts/full_evidence_agent.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/full_evidence_agent.py)
- [scripts/run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py)
- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py)

**Root Cause**
The main confirmed structure failures were:
- `collect_all_folders()` assumed `raw/day/ref`; it did not support flat roots and did not normalize duplicate refs across day folders.
- `collect_evidence()` and v16 index helpers only read direct children, so `CRM-2026-31/<descriptive child>/...` looked empty.
- `find_folder_v25()`’s cached PDF/msg scan also used direct `folder.iterdir()`, so nested OPEX/event evidence was invisible.
- Duplicate event refs across days created multiple physical candidates instead of one logical evidence folder.

I did not reintroduce broad passenger-name matching. Some remaining rows are not structure-only misses: their invoice refs like `26-908` do not appear in evidence folder/file names or PDF body tokens, and cascade `Notes` has no event ref bridge. Fixing those would require a new matching policy, not just structure tolerance.

**Fix Summary**
- Date folders like `24jun` are transparent passthrough layers.
- Flat root ref folders are accepted.
- A ref folder with exactly one descriptive child containing evidence is read as if files were direct children.
- Duplicate same-name refs across days are merged into one logical folder.
- Duplicate copied files are de-duped by filename plus size.
- v16 helper scans now use the normalized evidence iterator.
- v30 binds imported v16 helpers to the v30 evidence scanner so indexing and evidence loading agree.

**Verification**
- Syntax: `python3 -m py_compile scripts/full_evidence_agent_v30.py scripts/full_evidence_agent.py scripts/run_v16.py scripts/run_v30.py`
- J26-1029 scanner dry run:
  - Before: `114` folders, `64` with direct evidence files.
  - After: `73` logical folders, all `73` evidence-bearing.
  - Row-level dry resolution: `54 -> 85` folder/evidence resolved rows.
  - Original status-problem rows in current v30 workbook: `77`; after scanner fix, `33` resolve at folder/evidence layer.
- J26-640 scanner check:
  - Before: `147` physical paths, `140` with direct evidence.
  - After: `139` normalized paths, all `139` evidence-bearing.
  - Existing `score-v30.md` still reports travel subset `6/6 = 100%`; full all-5 score in the existing artifact is `108/117 = 92.3%`.

The read-only `qc/jawal_golden_check.py` failed, but it checks J26-788 committed artifacts and was already drifting against `jawal_golden_expected.json`; it is not evidence of this code change.
