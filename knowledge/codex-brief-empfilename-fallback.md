# Codex Brief — Jawal Emp-Number-in-Filename Evidence Fallback (ADDITIVE, fallback-only)

## Objective
Add a **final** fallback in the Jawal pipeline (`scripts/run_v30.py`) that links an
otherwise-orphaned, hash-named evidence folder to a row by matching the **employee number
found in the folder's filename(s)** to the row's already-resolved employee number. Runs ONLY
after the existing lookup AND the Ref. No. fallback have both found no evidence folder.

## Hard constraints (NON-NEGOTIABLE)
1. **Jawal only.** All work in `scripts/run_v30.py`. Do NOT touch Asateel or JJ code/paths.
2. **Existing lookup logic + the Ref. No. (REFNO_FALLBACK) logic stay 100% unchanged.**
3. This is a **third-tier fallback**: it fires ONLY when a row still has NO evidence folder
   after (a) the normal per-row lookup and (b) the Ref. No. fallback.
4. A row that already resolves (or resolved via REFNO_FALLBACK) must be **byte-for-byte
   identical** — the new path must be unreachable for it.
5. **Match key = employee number.** Only attach a folder when the emp_no parsed from the
   folder's filename(s) EXACTLY equals the row's resolved employee number. No fuzzy/name
   matching. If the row has no resolved emp_no, no fallback.
6. **One folder → one row claim.** A folder already claimed by another row (via any tier)
   must NOT be reused. Never double-attach the same evidence folder to two rows.
7. On hit, attach the folder as the row's evidence and set a distinct visible route_reason /
   flag `EMP_FILENAME_FALLBACK` so the row MAPS but stays auditable — never silently blanked.

## Origin case (must resolve after fix)
- Batch J26-1108, row 21: "MR WALEED BATAWEEL - TRAIN TO JED (26-996)", resolved emp_no
  1001008, VERIFIED_EMP_LOCK. No Ref. No. Evidence sits in hash-named folder `D2FBF61C4`
  containing `356_07082026_MAD_D2FBF61C4.pdf` (SAR train ticket) and
  `RE_Approved_Personal_Contribution_Approval_Requested_for_Waleed_Osama_Bataweel_1001008_...msg`
  (approval email). The `.msg` filename contains emp_no `1001008` == the row's emp_no.
  Currently the folder is orphaned (hash name, ticket 26-996 not in folder/PDF), so the row
  hits MISSING_EVIDENCE(HARD) and the gate blanks its already-computed Distribution
  Combination. After the fix, row 21 must map (evidence folder = D2FBF61C4, flag
  EMP_FILENAME_FALLBACK) and Evidence Folder Status flips MISSING -> OK.

## Verification (MUST pass before shipping)
1. `python3 qc/asateel_golden_check.py` must print `GOLDEN OK` (no shared-path regression).
2. Re-run J26-1108 through the Jawal pipeline. Compare output against the baseline
   `batches/jawal-J26-1108/output.baseline-pre-red-20260731T125920Z/`.
3. The ONLY allowed NEW differences vs the committed post-REFNO_FALLBACK behavior are
   previously-empty rows now resolved via EMP_FILENAME_FALLBACK (row 21 must be one).
   ANY change to a row that already resolved (normal OR REFNO_FALLBACK) = FAIL: revert and
   rethink. NOTE: row 9 (ticket 4860528652, no Ref. No.) has pre-existing LLM/folder-scan
   nondeterminism unrelated to this change — do not attribute it to this patch, but do not
   let this patch change its logic either.
4. Confirm no evidence folder is attached to more than one row after the change.

## Deliverables
- Minimal guarded patch to `run_v30.py`.
- Note of exactly which rows changed in J26-1108 and why. Do NOT deploy; report the diff.
