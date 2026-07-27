# Codex Brief — P&T Mappings: resolve people by emp_no, auto-fill name (kill exact-spelling block)

## Scope guard (NON-NEGOTIABLE)
P&T (PROJECTS) invoice type ONLY. Do not touch any other invoice/vendor path.
Only files in play: `apps/api/scripts/pt-mappings.py`, the P&T service/controller
under `apps/api/src/pt-mappings/`, and the P&T web page under
`apps/web/src/app/[locale]/ap/pt-mappings/`. The Python allocation module and the
JSON contract (`asateel_projects_labadi_v1.json`) stay byte-compatible.

## Problem
The current resolver (`apps/api/scripts/pt-mappings.py`) hard-blocks a save when the
typed person NAME does not exactly match the Manpower master name. Real case:
Agency "KLS Martin" (resolves 10052 fine), manager emp_no 1000615 (a real Manpower
employee), but clerk typed "Aamir Sharif" while master has "Aamir Abdellatif Sharif"
→ rejected with "manager name ... does not exactly match Manpower employee".
Clerks should not need to know each person's exact legal spelling.

## Change (fix #1: emp_no is the source of truth for people)
In `pt-mappings.py` resolve logic, for manager, line head, and salesman:
- Resolve the person SOLELY by emp_no against Manpower master.
- If emp_no exists in Manpower → ACCEPT, and OVERWRITE the returned name with the
  master's canonical `employee_name` (auto-fill). Ignore whatever name string the
  clerk typed for validation purposes (do NOT compare names, do NOT error on
  mismatch). The typed name becomes irrelevant/cosmetic; master name wins.
- If emp_no is MISSING or not found in Manpower → still a hard ERROR (keep option (a)
  safety: person must be a real master employee).
- Keep ALL other validation intact: agency name must still uniquely resolve to one
  master agency_code (hard block), AGENCY mode still requires managerEmpNo present,
  manager-home-agency mismatch stays a NON-blocking warning.

## Web page follow-through (UX)
On the P&T Mappings page (agency grid + BMX line-head/salesman editors):
- After a successful resolve/save, display the canonical master name returned by the
  API (so the clerk sees the corrected/auto-filled name).
- Ideally, when the clerk enters an emp_no, show the resolved master name inline
  (read-only echo) before save. Minimal version: just accept emp_no and let the
  saved row show the master name. Keep EN/AR.
- Name input can remain for reference but is no longer authoritative.

## Must not break
- JSON regeneration must still produce output structurally identical to
  `build_lookup()` for the seeded data (names in the JSON come from master anyway,
  so this aligns). Re-verify regen + `load_lookup` still passes.
- BMX salesman/line-head resolution uses the same emp_no-first rule.

## Deliverables
1. Patched `pt-mappings.py` (emp_no-first, auto-fill name, no name-match error).
2. Any web tweak to surface the resolved master name.
3. Quick proof: run resolve on {KLS Martin / 1000615 / "Aamir Sharif"} → now returns
   NO errors and managerName "Aamir Abdellatif Sharif". Also show a bad emp_no still
   errors.
4. Short note appended to REPORT.md. Report the diff; DO NOT deploy.
