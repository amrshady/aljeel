1. Desc-serial logic and precedence

The code is an inline block inside `main()`, stage 5.6, at [scripts/run_v30.py:6630](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6630) through [scripts/run_v30.py:6672](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6672).

Its decision sequence is:

- Require the `Description`, `OPEX Serial`, and `Account` columns.
- Skip rows with missing evidence.
- Only process final sponsorship account `60307021`.
- Read `Invoice Ref No` first.
- Use `OPEX Serial` only if the invoice reference is blank or one of `MISSING`, `N/A`, `NONE`.
- Write `f"{_ref}-{_desc}"`, unless that exact prefix is already present.

The decisive code is [scripts/run_v30.py:6652](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6652):

```python
_acct = str(_ws_dp.cell(_r, _cols_dp["Account"]).value or "").strip()
if _acct != SPONSORSHIP_ACCOUNT:
    continue
_ref = ""
if "Invoice Ref No" in _cols_dp:
    _ref = str(_ws_dp.cell(_r, _cols_dp["Invoice Ref No"]).value or "").strip()
if not _ref or _ref.upper() in ("MISSING", "N/A", "NONE"):
    _ref = str(_ws_dp.cell(_r, _cols_dp["OPEX Serial"]).value or "").strip()
...
_desc_cell.value = f"{_ref}-{_desc}"
```

Therefore, when both fields exist, `Invoice Ref No` wins over `OPEX Serial`.

`_row_event_key()` independently has the same precedence. It is at [scripts/run_v30.py:377](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:377) through [scripts/run_v30.py:396](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:396). After any explicit folder/PDF key, it tests values in this order:

```python
for value in (
    _row_invoice_ref_no(cascade_row),
    row.get("opex_serial"), row.get("_opex_serial"),
    cascade_row.get("OPEX Serial"), cascade_row.get("Description"),
):
```

Thus an invoice reference such as `CRM-2026-40` is returned before `CE-202-26`.

2. Did commit `351ce5b` change either precedence?

No. GroupA did not change the Description-prefix precedence or `_row_event_key()` precedence.

`git log -S` attributes the invoice-first Description behavior to `e960041`, not `351ce5b`:

```text
e960041 Jawal: route-based tax code + sponsorship guard + ref-in-desc;
         sync live droplet WIP to git
```

That earlier commit introduced this hunk:

```diff
-    # ── stage 5.6: prefix OPEX serial onto sponsorship Descriptions (Labadi) ──
+    # ── stage 5.6: prefix invoice reference onto sponsorship Descriptions ──
+    # Prefer Invoice Ref No, falling back to OPEX Serial, so the reference lands
...
-                _serial = str(_ws_dp.cell(_r, _cols_dp["OPEX Serial"]).value or "").strip()
+                _ref = ""
+                if "Invoice Ref No" in _cols_dp:
+                    _ref = str(_ws_dp.cell(_r, _cols_dp["Invoice Ref No"]).value or "").strip()
+                if not _ref or _ref.upper() in ("MISSING", "N/A", "NONE"):
+                    _ref = str(_ws_dp.cell(_r, _cols_dp["OPEX Serial"]).value or "").strip()
...
-                _desc_cell.value = f"{_serial}-{_desc}"
+                _desc_cell.value = f"{_ref}-{_desc}"
...
-                  f"with OPEX serial", flush=True)
+                  f"with invoice reference", flush=True)
```

Likewise, blame/history shows the invoice-ref-first entry in `_row_event_key()` came from commit `658005f8`, before groupA:

```text
658005f8 ... _row_invoice_ref_no(cascade_row),
df5cb887 ... row.get("opex_serial"), row.get("_opex_serial"),
df5cb887 ... cascade_row.get("OPEX Serial"), ...
```

The `HEAD~1..HEAD` groupA diff contains no stage-5.6 hunk. Around `_row_event_key()`, the function body is merely unchanged context; the first actual groupA change is the following function’s new parameter:

```diff
@@ -328,37 +394,39 @@ def _row_event_key(row: dict, cascade_row: dict, folder: Path | None = None) ->
         if key:
             return key
     return ""

 def find_folder_v25(
...
     reverse_index: dict[str, Path],
+    row_desc: str = "",
```

GroupA did change stage 3d, but that is a separate rebind path:

```diff
-            if not ticket_no:
+            # Ancillary 26-NNN rows have no airline ticket number, but can still
+            # be authoritatively linked to sponsorship by their event Ref No.
+            if not ticket_no and not found_folder:
                 continue
```

That hunk can affect allocation/evidence rebinding, but it did not introduce or alter the final Invoice-Ref-over-OPEX Description prefix.

3. What would a fresh HEAD~1 run write?

Assuming the four rows reach stage 5.6 as sponsorship rows and retain the stated populated invoice references, HEAD~1 would write:

| Row | Invoice Ref No | OPEX Serial | HEAD~1 prefix |
|---|---|---|---|
| `26-1001` | `CRM-2026-40` | `CE-202-26` | `CRM-2026-40-` |
| `26-1004` | `HF-2026-29` | `CE-202-26` | `HF-2026-29-` |
| `26-1005` | `CRM-2026-40` | `CE-202-26` | `CRM-2026-40-` |
| `26-1009` | `CRM-2026-42` | `CE-202-26` | `CRM-2026-42-` |

HEAD~1 contains the identical logic at historical lines 6303–6345:

```python
# Prefer Invoice Ref No, falling back to OPEX Serial
...
if "Invoice Ref No" in _cols_dp:
    _ref = ...
if not _ref or _ref.upper() in ("MISSING", "N/A", "NONE"):
    _ref = ...["OPEX Serial"]...
...
_desc_cell.value = f"{_ref}-{_desc}"
```

`_row_event_key()` is also invoice-first in HEAD~1 historical lines 311–330:

```python
for value in (
    _row_invoice_ref_no(cascade_row),
    row.get("opex_serial"), row.get("_opex_serial"),
    cascade_row.get("OPEX Serial"), cascade_row.get("Description"),
):
```

Consequently, the frozen truth’s `CE-202-26-` Descriptions are not reproducible by a fresh HEAD~1 execution with those invoice-reference values. The artifact must have been produced under different effective code/data or subsequently curated. It is not a fresh pre-groupA output guaranteed by the checked-in HEAD~1 code.

4. Bottom line and correct fix location

The CE-versus-CRM/HF Description mismatch is not a groupA prefix regression. There is no groupA prefix-precedence hunk to revert. It is a pre-existing scorer/baseline fragility exposed by a pipeline behavior already present before groupA.

The scorer’s `_logical_description()` at [qc/score_against_truth.py:318](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:318) only strips the prefix when it equals the row’s OPEX serial:

```python
serial = _norm_text(row.opex_serial)
if serial and text.startswith(serial):
    text = text[len(serial):].lstrip(" -–—:|/")
```

Then `sponsorship_group_key()` at [qc/score_against_truth.py:326](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:326) includes that Description-derived value:

```python
return (
    "sponsorship",
    _norm_text(row.opex_serial),
    _logical_description(row),
    _norm_ref(row.invoice_ref).casefold(),
)
```

Pairing depends on exact equality of these keys at [qc/score_against_truth.py:459](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:459) through [qc/score_against_truth.py:475](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:475). Pipeline rows whose Description begins `CRM/HF` cannot have that prefix stripped when their OPEX serial remains `CE-202-26`, so they become unmatched sponsorship groups.

The appropriate fix is therefore in the scorer’s sponsorship-key normalization: strip either the row’s OPEX serial or its invoice-reference prefix before normalizing the logical Description, and treat OPEX serial as the authoritative sponsorship event identity. Using OPEX serial completely alone may be too coarse if one OPEX event contains several distinct expense lines; retaining a genuinely prefix-independent logical Description or another stable discriminator would avoid collisions.

No files were modified, and no pipeline, golden gate, or deployment command was run.
