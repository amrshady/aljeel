Implemented the narrow guard in [`main()` at scripts/run_v30.py:5990](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5990).

```diff
diff --git a/scripts/run_v30.py b/scripts/run_v30.py
index 3d545c1..9a10bd4 100644
--- a/scripts/run_v30.py
+++ b/scripts/run_v30.py
@@ -5987,6 +5987,15 @@ def main():
             ticket_no = tm.group(1) if tm else ""
             # Ancillary 26-NNN rows have no airline ticket number, but can still
             # be authoritatively linked to sponsorship by their event Ref No.
+            # Do not let that fallback rebind an already-settled sponsorship
+            # row whose OPEX allocation identity has already been established.
+            settled_sponsorship_identity = bool(
+                h.get("_sponsorship_allocations")
+                or str(h.get("opex_serial") or h.get("_opex_serial") or "").strip()
+                or str(cascade_rows[idx].get("OPEX Serial", "") or "").strip()
+            )
+            if not ticket_no and acct == "60307021" and settled_sponsorship_identity:
+                continue
             if not ticket_no and not found_folder:
                 continue
             passenger = desc.split(" - ", 1)[0].strip() if " - " in desc else ""
```

Changed lines: [`main():5990–5998`](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:5990).

Compile check:

```text
python3 -m py_compile scripts/run_v30.py
Exit code: 0
```

Ticketless rows such as `26-1001`, `26-1004`, `26-1005`, and `26-1009` now skip the stage-3d rebind when they are already account `60307021` and carry an established OPEX serial or `_sponsorship_allocations`. Thus their evidence folder, CE allocation employees, and description identity remain intact. Ticketless rows without that settled account-plus-identity combination still proceed through the existing Ref. No. evidence linkage. No pipeline, deployment, or golden-gate commands were run, and the protected paths were untouched.
