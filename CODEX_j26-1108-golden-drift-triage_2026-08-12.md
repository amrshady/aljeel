The gate is red for three distinct reasons: an intentional scorer semantic change, two scorer bugs in sponsorship pairing/coverage accounting, and genuine pipeline mismatches. There was no truth-workbook change.

The current artifact is not trustworthy enough to freeze as the new golden baseline.

## Executive decision

Recommended path: combination of (B) pipeline fixes and (C) scorer fixes first, followed by (A) re-baselining only after a reviewed regeneration.

- Re-baseline now: no.
- Fix scorer first: yes.
- Fix remaining pipeline defects before freezing: yes.
- Re-baseline afterward: yes, including the `distribution`→`combo` structural key and corrected combo-derived truth metrics.

## Root-cause classification

| Drift family | Bucket | Diagnosis |
|---|---|---|
| `pipeline_columns.distribution → combo`, `truth_columns.distribution → combo` | (a) Scorer schema change | Pure key rename. Column indices remain 14 and 15, respectively. |
| Truth sponsorship count `19 → 33` | (a) Scorer semantic/schema change | The truth workbook did not change. The Aug-10 scorer began deriving Account and the other segments from Distribution Combination. Fourteen rows whose standalone Account helper was blank now correctly resolve to `60307021`. |
| “truth rows silently skipped” | (d) Scorer bug | False/misleading invariant. Rows are loaded, but sponsorship-key mismatches leave them unmatched. The check adds evaluated rows to the number of unmatched groups, not unmatched physical rows. |
| Ten `pipeline_only travel|26-NNN` groups and corresponding truth-only sponsorship groups | (d) Scorer bug, with some truth-normalization complications | The pipeline rows are actually account `60307021`. The scorer admits pipeline rows to sponsorship only when their complete sponsorship key exactly equals a truth key; otherwise it incorrectly sends them to travel pairing. |
| Headline/evaluation and pairing-integrity deltas | Mixed: mostly (a)+(d), with real defects inside evaluated pairs | The denominator changed because 14 rows were reclassified as sponsorship, then 12 truth rows failed exact-key pairing. These aggregate deltas cannot safely be treated as pipeline regression measurements until pairing is corrected. |
| New account `60308009`, evaluated 2, full5 0 | (a) scorer exposure + (c) real pipeline mismatch | Combo derivation exposes two truth rows as `60308009`; the artifact has `60301003` for both. This is a genuine output mismatch, not a cosmetic baseline difference. |
| Current evaluated sponsorship mismatches | (c) Real pipeline regression/defect | At least truth rows 28, 60, and 104 contain substantive account/segment/employee mismatches in the current artifact. |
| `pipeline_sha256` change | Artifact identity change; ultimately (c)/review-required | The artifact was regenerated Aug 11. The hash itself is expected to change, but it must not be accepted until the semantic defects are resolved and reviewed. |
| Four CE-202-26 rows | Partially fixed (c), with residual pipeline inconsistency | Employee rebinding is fixed in the current artifact, but CRM/HF Description prefixes remain inconsistent with OPEX serial on all four. |
| `account_breakout`, per-field, travel/sponsorship, pairing-integrity totals | Mixed | Recompute only after scorer pairing is fixed. Some differences are legitimate combo-derived truth corrections; others reflect genuine pipeline errors. |

## 1. `distribution` → `combo`: rename versus value change

The structural rename is purely cosmetic:

- Pipeline: column 14 remains column 14.
- Truth: column 15 remains column 15.
- Only the scorer’s internal discovered-column key changed from `distribution` to `combo`.

However, commit `82359e0` did more than rename the key. It changed row loading to parse Distribution Combination positionally:

```text
company-location-account-cc-div-solution-agency
```

and use those values before standalone helper columns. See [score_against_truth.py](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:276).

Therefore:

- The two `structure.*.distribution/combo` drift pairs are cosmetic and should eventually be re-baselined.
- The resulting metric changes are not cosmetic. They are an intentional truth-interpretation correction that exposes previously hidden truth values and genuine pipeline mismatches.

The backup `jawal_j26_1108_golden_expected.json.bak-pre-combo-scorer-20260810` and live expected JSON are byte-identical. The baseline was never updated for this scorer release.

## 2. Why truth sponsorship changed 19 → 33

The truth file itself is unchanged.

Evidence:

- Expected truth SHA: `97d01ad7e683cb325bd9dc481008651b6c16e5d78da2b9a65bd97504a3979048`
- Current truth SHA: the same value.
- Truth workbook mtime remains Aug 7, before both the baseline and scorer change.

Previously, sponsorship classification used the standalone Account helper. Fourteen truth rows had blank helper accounts, so they were treated as travel even though their Distribution Combination contained account `60307021`.

The Aug-10 scorer now extracts account from Distribution Combination, causing the correct classification:

```python
return "sponsorship" if row.account == "60307021" else "travel"
```

See [score_against_truth.py](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:325).

Thus:

- `truth_sponsorship_rows: 19 → 33` is not a truth-file change.
- `truth_sponsorship_employee_coverage: 19 → 33` follows directly; all 33 have employee numbers.
- The hard-coded invariant requiring 19 is obsolete and should become 33 after the scorer problems are corrected.

### “Silently skipped” is not accurate

The current calculation is:

```python
logical_virtual_evaluated + len(truth_only_logical_groups) < 102
```

See [jawal_j26_1108_golden_check.py](/home/clawdbot/.openclaw/workspace/aljeel/qc/jawal_j26_1108_golden_check.py:117).

That compares physical rows against logical-group count. A truth-only group can contain multiple allocation rows, so this is dimensionally invalid. For example, `26-998` contains three truth employee rows but its grouping metadata is split across inconsistent sponsorship keys.

The rows were loaded; they were not silently dropped by the workbook loader. They became unmatched because the sponsorship-pairing policy is too strict.

## 3. Scorer pairing bug behind the travel/sponsorship orphans

The scorer builds sponsorship identity from:

```text
OPEX serial + normalized description + invoice reference
```

It then selects pipeline sponsorship rows only if this complete key already exists among truth keys:

```python
sponsorship_pipe = [
    row for row in pipeline_rows
    if sponsorship_group_key(row) in sponsorship_keys
]
```

See [score_against_truth.py](/home/clawdbot/.openclaw/workspace/aljeel/qc/score_against_truth.py:517).

This fails for the newly recognized sponsorship rows because truth and pipeline differ in metadata such as:

- Truth OPEX values `n/a`, `missing`, or blank versus normalized HF/SIS serials in the pipeline.
- Description prefix punctuation/spacing.
- `HF2026-28` versus `HF-2026-28`.
- Inconsistent OPEX/invoice metadata among the three truth allocations for `26-998`.

Once the exact key fails, the pipeline row is incorrectly sent to travel pairing—even though its output Account is `60307021`. That directly produces the ten `pipeline_only_logical_groups` named `travel|26-NNN`.

This is a scorer bug, not evidence that those pipeline rows became travel rows.

The scorer needs a sponsorship fallback keyed by stable identifiers such as `26-NNN`/ticket, with invoice reference and description used for disambiguation. It must preserve allocation multiplicity and reject ambiguous matches rather than silently moving sponsorship rows into travel.

## 4. Status of the four CE-202-26 rows

The Aug-9 regression has changed but is not fully gone.

Current artifact:

| Event | Employees now | Description prefix | Status |
|---|---|---|---|
| 26-1001 | `1002075,1001986` | `CRM-2026-40` | Allocation fixed; prefix inconsistency remains |
| 26-1004 | `1002075,1001986` | `HF-2026-29` | Allocation fixed; prefix inconsistency remains |
| 26-1005 | `1002075,1001986` | `CRM-2026-40` | Allocation fixed; prefix inconsistency remains |
| 26-1009 | `1002075,1001986` | `CRM-2026-42` | Allocation retained; prefix inconsistency remains |

So the serious three-row employee/agency rebinding described in the Aug-9 report is no longer present. The Aug-10 settled-sponsorship rebind guard did its job.

The scorer’s Aug-10 prefix-normalization change also allows these CRM/HF-prefixed descriptions to pair with their CE truth rows. That is a reasonable scorer tolerance, but the artifact remains internally inconsistent: OPEX Serial says CE-202-26 while Description is stamped with CRM/HF.

### Effect of the J26-1140 pass-order/folder-binding fix

None on this artifact.

The artifact was generated Aug 11. The J26-1140 changes currently present in `run_v30.py` were made Aug 12 and no J26-1108 regeneration was performed afterward. Therefore they cannot explain or repair any value in the audited workbook.

Those changes may improve a future J26-1108 regeneration, particularly correct OPEX-owner selection and segment ordering, but that must be verified; it cannot be inferred from the current artifact.

## 5. Genuine current pipeline defects

Even before repairing orphan pairing, current successfully paired rows include substantive errors:

- Truth row 28, HF-2026-28 airfare:
  - Expected sponsorship `60307021 / 160014 / 170 / 10050 / 10072`, employee `1002483`.
  - Pipeline has account `60301003`, travel-style segments, and employee `1000587`.

- Truth row 60, CRM-2026-42 Rawa:
  - Expected account `60307021`.
  - Pipeline has `60301003`.

- Truth row 104, `26-1025` HF-2026-28 car:
  - Expected `160014 / 170 / 10050 / 10072`, employee `1002483`.
  - Pipeline carries CE-style `160011 / 196 / 0 / 10100` and employees `1002075,1001986`.

- Truth account `60308009`, tickets `4860528692` and `4860528696`:
  - Pipeline has `60301003` for both.

There are additional travel mismatches, including missing/blank segment rows and employee differences. Whether each is newly regressed relative to the prior artifact cannot be determined reliably from the red aggregate comparison because the baseline used incomplete helper-column truth. They are nevertheless real current disagreements with the clerk’s Distribution Combination and must be dispositioned before freezing.

## Ordered remediation plan

1. Fix the scorer pairing and coverage checks.

   - Classify truth sponsorship from parsed combo, retaining the correct 33-row count.
   - Do not require exact OPEX/description/invoice key equality before considering a pipeline row sponsorship.
   - Add deterministic `26-NNN`/ticket fallback pairing with ambiguity reporting.
   - Normalize event serial spelling such as `HF2026-28`.
   - Count unmatched truth physical rows or employee allocations in the coverage invariant, not logical-group strings.
   - Keep the CRM/HF-versus-CE prefix tolerance.

2. Re-score the existing Aug-11 artifact read-only with the corrected scorer.

   This will separate genuine output mismatches from the current false travel/sponsorship orphaning and produce stable denominators.

3. Fix or explicitly adjudicate the real pipeline mismatches before regeneration.

   At minimum address truth rows 28, 60, 104, the two `60308009` rows, and the residual CE Description/OPEX identity inconsistency. Review all remaining corrected-scorer mismatches individually.

4. Verify the J26-1140 pass-order and folder-binding changes against J26-1108 tests.

   They postdate the current artifact. Add J26-1108 regression coverage before relying on them, especially for HF/CRM folder ownership and CE-202-26 preservation.

5. Only then regenerate and review J26-1108.

   Confirm no reappearance of the three-row CE employee rebound, correct sponsorship multiplicities and amount conservation, and validate all mismatches against clerk truth.

6. Re-baseline once the reviewed artifact is accepted.

   The new baseline should legitimately include:

   - `distribution` renamed to `combo`;
   - truth sponsorship rows and employee coverage at 33;
   - the reviewed artifact SHA;
   - corrected pairing-integrity and metric values;
   - no false sponsorship-as-travel orphan list;
   - a truthful row-level coverage invariant.

Bottom line: the current red gate is not resolved by a simple snapshot refresh. The schema rename and 19→33 truth interpretation require re-baselining eventually, but scorer pairing must be repaired and genuine pipeline mismatches fixed or formally accepted first.

[status: done rc=0]
