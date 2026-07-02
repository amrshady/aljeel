Read-only diagnosis complete. I did not edit or deploy.

**Root Cause**

The 6 historical RED rows did not lose RED because of GL Description, and not because split rows stopped being forced YELLOW.

They lost RED because new SO_Detail fallback/review logic now runs even when SO_Detail is not loaded. In the golden command, `--so-detail` is absent, so `so_detail_index = {}`. But each supplier JQ row still has `unit_jq`, no `so_detail_rec`, and this condition fires:

[asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:1803)
```python
if unit_jq and not so_detail_rec:
    status = "YELLOW"
```

That happens after `classify()` already set RED here:

[asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:787)
```python
if not inv or total is None:
    notes.append("RED: invoice number or total not extractable")
    return "RED"
```

So the precise path is:

1. Gemini cache has JSON parse error, so invoice number/total are not extractable.
2. `classify()` returns `RED`.
3. New post-classification SO_Detail missing-JQ override changes that RED to `YELLOW`.
4. Notes still contain `RED: invoice number or total not extractable`, but final `Row_Status` is YELLOW.

**The 6 Former RED Rows**

From the v6 baseline workbook `asateel-poc-oracle-CENTRAL-full-v6-2026-06-23.xlsx`:

| Invoice | Line | JQ | Employee | Agency | CC/DIV | Previous RED reason |
|---|---:|---|---|---|---|---|
| 03140 | 1 | JQ-25077156 | 1001294 | 10153 BMX | 160012 / 194 | Gemini JSON parse error; invoice number or total not extractable |
| 03140 | 2 | JQ-26116792 | 1002442 | 10153 BMX | 160012 / 194 | same |
| 03140 | 3 | JQ-26118299 | 1002442 | 10153 BMX | 160012 / 194 | same |
| 03142 | 1 | JQ-26112270 | 1000433 | 10072 Abbott | 160014 / 170 | same |
| 03142 | 2 | JQ-26109251 | 1000862 | 10111 Bio-Rad | 160012 / 194 | same |
| 03307 | 2 | JQ-26114025 | 1001016 | 10153 BMX | 160012 / 194 | same |

Current in-memory golden behavior with no SO_Detail gives `188` rows, `GREEN=7`, `YELLOW=181`, `RED=0`, blank CC `6`.

**Default SO_Detail Behavior**

The splitfix report is correct for `pipelines/asateel.py`: production no longer applies SO_Detail by default.

[pipelines/asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:309)
```python
parser.add_argument("--so-detail", default="")
```

[pipelines/asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:321)
```python
so_detail_index = engine.load_so_detail(Path(args.so_detail)) if args.so_detail else {}
```

So the golden command:
```bash
python3 pipelines/asateel.py --folder CENTRAL --full
```
does not load SO_Detail.

But it does **not** behave exactly like the true pre-SO_Detail baseline, because SO_Detail-derived missing-JQ review logic still executes against an empty `so_detail_index`.

Also note: direct POC still defaults to SO_Detail:

[asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:2491)
```python
"--so-detail",
default=str(DEFAULT_SO_DETAIL_XLSX),
```

**Recommendation**

Restore RED. Missing invoice number/total is a hard extraction failure and should not be downgraded by a secondary SO_Detail review condition.

The right fix would be conceptually:

- Only apply “JQ not in SO_Detail export” when SO_Detail was actually enabled/loaded.
- Do not let YELLOW post-classification overrides downgrade existing RED statuses; severity should be monotonic unless explicitly intended.

So this is a bug caused by the SO_Detail status override leaking into the no-`--so-detail` default path.
