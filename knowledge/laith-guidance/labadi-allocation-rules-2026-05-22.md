# Labadi's High-Level Allocation Rules (AUTHORITATIVE)

**Source:** Laith Jaradat (AP Supervisor, AlJeel), via Amr forwarding on Telegram 2026-05-22 00:19 UTC.
**Status:** Authoritative — overrides assumptions made from the call transcript or inferred from the golden.

---

## Verbatim text

> Kindly note that not all expenses should be allocated directly against employees. Expense allocation may be distributed based on the instructions of the concerned person, as stated in the Master Data sheet identifying the employees who there expense should be allocated.
>
> Please also note that there are multiple expense categories; accordingly, the required approvals and supporting documents vary depending on the nature of the expense, as follows:
>
> • **Internal Travel:** Requires SANAD approval, proof of price comparison/checking, and system request approval in line with the authority matrix.
>
> • **External Travel:** Requires the same approvals and supporting documents as internal travel, including request approval as per the authority matrix.
>
> • **Sponsor Expenses:** Require SANAD approval together with all related approvals and supporting documents attached to the sponsor form, while ensuring expenses do not exceed the approved budget.
>
> • **New Hiring Requests:** Require allocation and confirmation from HR (Elham or Hessa).
>
> • **Annual Tickets:** Must be approved by HR and SANAD, together with the approved system request.
>
> • **Abbott Expenses:** Allocation should be added based on the respective employee solution/business line.
>
> • **G&A Employee Travel:** All tickets and hotel expenses related to G&A employees should be booked under the account **Travel Cost Expense – G&A** (`60301004`).
>
> • **Business-Related Travel:** Tickets and hotel expenses related to **IVD Solutions, Capital Equipment, Contribution, Dental & Medical Solutions, and Technical Services teams** should be booked under the account **Travel Cost Expense – S&M** (`60301003`).

---

## Account routing matrix (operationalized)

| Trigger | Account | GL Description |
|---|---|---|
| Employee DIV = 888 (G&A) | `60301004` | Travel Cost Expense – G&A |
| Employee DIV ∈ {IVD Solutions, Capital Equipment, Contribution, Dental & Medical Solutions, Technical Services, S&M} | `60301003` | Travel Cost Expense – S&M |
| Annual leave / annual ticket award | `21070229` | Accrued Employee Annual Tickets |
| Recruitment / new hire (HR approver Elham or Hessa, OR description marker "new employee" / "candidate") | `60308007` | Recruitment Fees |
| Sponsorship (OPEX form attached OR event reference: CRM-XXXX, IEPC, EP-2026-XX, HF-2026-XX, ISHLT, etc.) | `60307021` | Sponsoring Expenses |
| Abbott employees (Agency code 10072) | `60301003` + Solution from Manpower (10017 CRM / 10050 HF / 10064 EP) | Travel Cost Expense – S&M with explicit Solution |
| Allocation override per Master Data instruction column | as instructed | (read from Manpower flag column) |

---

## Required approvals per category (soft-flag check)

The pipeline does NOT block on missing approvals (we can't enforce upstream Workday), but it DOES flag them:

| Category | Required approvals | Soft flag if missing |
|---|---|---|
| Internal/External Travel | SANAD (Sanad Al Shammari, `sfalshammari@aljeel.com`) + system request | `MISSING_SANAD_APPROVAL` |
| Sponsor Expenses | SANAD + OPEX form attachment + budget within cap | `MISSING_SANAD_APPROVAL`, `MISSING_OPEX_FORM`, `OVER_BUDGET` |
| New Hiring | HR (Elham OR Hessa) | `MISSING_HR_APPROVAL` |
| Annual Tickets | HR + SANAD + system request | `MISSING_HR_APPROVAL`, `MISSING_SANAD_APPROVAL` |

---

## Open items to resolve with Laith

1. Which Manpower DIV codes correspond to: IVD Solutions, Capital Equipment, Contribution (170 OR 260?), Dental & Medical Solutions (192?), Technical Services (120?), S&M (190?)
2. "Master Data sheet identifying the employees whose expense should be allocated [elsewhere]" — which column? The Manpower flag column (`Can Be used` / `Need to allocate` / `Charge to Medsource` / `there should be no expenses if any charge to Erbe`)?
3. Authority matrix details (price comparison ≥ N quotes? Budget ceiling per category?)

