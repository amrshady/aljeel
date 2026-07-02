# OVER_LIMIT — Fraud Rule Case File

**Category:** `OVER_LIMIT` (within-batch QC)
**Severity in rule:** intended as MEDIUM/HIGH based on overage size
**Status in v15.10:** **🚨 STRUCTURALLY DEAD — cannot fire. 0 catches is meaningless.**
**Investigation date:** 2026-05-22
**Verdict:** **🔴 SUSPEND — rule has been silent because the data it depends on doesn't exist. Don't ship it until grade data is added to Manpower OR rule is rewritten to use a different ceiling source.**

---

## What the rule is supposed to catch

A single ticket whose amount exceeds the employee's grade-based annual travel ceiling. Used as a single-trip sanity check (e.g., a grade-10 employee shouldn't buy a SAR 15,000 international business-class ticket).

## Why the rule never fires (structural failure)

In `scripts/qc_catches_within_batch.py:286-289`:

```python
def _over_limit(lines: list[BatchLine], md=None) -> list[dict]:
    """Single ticket > grade ceiling."""
    catches = []
    for line in lines:
        if not line.grade:
            continue
```

The rule short-circuits on `line.grade` being null. Grade comes from `BatchLine.grade`, populated in `run_within_batch_catches()` line 367-371:

```python
grade = None
if md and r.emp_no:
    emp = md.employees.get(r.emp_no)
    if emp:
        grade = getattr(emp, 'grade', None)
```

So grade is read from the Manpower master via `emp.grade`. **But there is no `grade` column in the Manpower sheet** of `Aljeel_Lookups.xlsx`. Verified directly:

```
Manpower headers (15 cols): Emp No, Old Emp No, Name, Arabic Name, Location, Manager No,
Line Manager, [empty], Code, New Division, Code, New agency, New cost center,
New cost center name, Solution
```

No grade column. `getattr(emp, 'grade', None)` returns None for all 656 employees. The `if not line.grade: continue` triggers for every row. The rule never reaches its threshold check. 0 catches forever.

## Comment in code already acknowledges this

`scripts/process_batch.py:1052`:

```python
"grade": None,  # Grade not in Manpower master — OVER_LIMIT and OVER_BUDGET catches skip gracefully
```

So this was a known gap when v15.10 was built. The rule was left in place but is silent.

## What v15.11 should do

Three options:

**Option A — Suspend the rule** (recommended for now): mark it as deprecated in the source, remove from the active catch pipeline. Document in RULES.md that "grade-based ceiling check is not active because Manpower master doesn't track grade." Surface as a known limit in IMPLEMENTATION.md.

**Option B — Use an alternative ceiling source.** Define ceilings based on something we DO have: account (60301003 vs 60301004 vs 60307021), or department (DIV code), or simply a flat per-trip ceiling (e.g., "any single domestic-route ticket >SAR 5,000 is high enough to warrant a flag"). This is a different rule with different semantics but easier to implement.

**Option C — Get grade data from AlJeel.** Coordinate with Laith to add a `Grade` column to Manpower. Then the rule fires meaningfully. This is the cleanest path long-term but requires Aljeel-side data work.

**Recommended v15.11 action:** Option A — suspend with documentation. Reactivate when grade is available.

## What v15.11 surfaces to Finance

**Nothing.** Rule is dead. Suspending it explicitly removes a fake-zero from the QC pipeline.

---

**Investigated by:** Malik via Amr's direction (2026-05-22)
**Next action:** All 8 cases done. Update master decision log and trigger consolidated v15.11 refinement.
