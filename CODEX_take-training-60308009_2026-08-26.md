Implemented without committing, deploying, or running the golden gate. Existing uncommitted `run_v30.py` changes—including business-Trip-Goal precedence—were preserved.

Precise diff:

- [scripts/trip_purpose_classifier.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/trip_purpose_classifier.py:45)
  - Lines 45–60: added `conduct training`, `conducting training`, and `trainer` to deliver-training/business signals.
  - Lines 86–102: added `_matches_take_training_goal()`.
    - Positive: training, lab training, attend/take/receive course or certification, course/certification attendance, “to be trained”.
    - Negative precedence: provide/deliver/conduct/trainer.
  - Lines 158–223: replaced inline training checks with the shared helper and ensured provide-training Trip Goals override generic Training awards.
  - Lines 290–301: subject-based training classification now uses the same disambiguation.

- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:617)
  - Lines 617–705: extended existing `apply_own_form_trip_purpose_precedence()` with `take_training_only`.
  - Before: the early pass accepted only authoritative business Trip Goals.
  - After: it can independently accept only classifier-confirmed `TRAINING → 60308009` form signals.
  - This pass does not exclude `_verified_emp_lock`, so L0/direct-emp and other verified fast-path rows are covered.
  - [Lines 6197–6223](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6197): added the take-training pass alongside the existing business-goal pass, before family/annual routing.

Ordering:

1. L0/direct Ref.No. identity remains trusted and locked.
2. `pc_index` and other earlier routing stages run unchanged.
3. Existing business-Trip-Goal precedence runs.
4. New positive take-training precedence sets `60308009`.
5. Family/annual `21070229` runs afterward but cannot flip `60308009`, because only plain travel accounts are eligible.
6. The existing late Trip Account Override remains available.
7. The 003/004 cost-center stage only changes `60301003/60301004`; it cannot override `60308009`.

Projected existing-row changes from current v30 outputs:

- J26-1080, ticket `4860493599`, ABDULJABBAR/AFNAN: `60301003 → 60308009`
- J26-1108, ticket `4860528696`, ALHAZZAA/KADI: `60301003 → 60308009`
- J26-1220, ticket `4861179583`, HAMOUR/MOHAMMED, emp `1000521`: `60301003 → 60308009`
- J26-1220, ticket `4861224653`, ALHATO/ABDULHADI: `60301003 → 60308009`

J26-1220 provide-training tickets `4861129857`, `4861179591`, `4861129941`, `4861063632`, `4861179597`, `4861129878`, and `4860493670` remain business travel under existing 003/004 CC logic. Ordinary business travel is unaffected. J26-870 ticket `6905992272` is already `60308009` and remains unchanged.

Validation performed:

- Python compilation passed.
- Positive/negative classifier matrix passed.
- Real HAMOUR evidence parsed as `Attend Training (Technical/Non-Technical)` and targeted application produced `60308009`.
- Real provide-training evidence remained `60301003`.
- `git diff --check` passed.
