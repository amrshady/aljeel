# Agent & Contributor Guide

> **If you are an AI coding agent or a new engineer, read this first.** It tells you how to
> pick up work, the rules to follow, and how to leave the project better than you found it.

---

## 1. Start here

1. Read [`SPECIFICATION.md`](SPECIFICATION.md) (what), [`ARCHITECTURE.md`](ARCHITECTURE.md)
   (how), [`DATA_MODEL.md`](DATA_MODEL.md), and [`API.md`](API.md).
2. Open [`ROADMAP.md`](ROADMAP.md) and find the **next unblocked task** (a `[ ]` task whose
   `Depends on` items are all `[x]`).
3. Do exactly that task — no more, no less. If you discover it must be split, split it in the
   roadmap and explain why.

## 2. Golden rules

- **One task = one PR.** Keep changes small and reviewable.
- **Don't break the contract.** `packages/shared-types` is the source of truth for FE/BE
  types. Update it first, then both sides.
- **Tenant isolation is sacred.** Every supplier-scoped query must filter by `supplierId`
  from the auth context. Add a test proving cross-tenant access is denied.
- **Security first.** Never log secrets, tokens, bank details, or full documents. Bank
  changes always go through maker-checker.
- **Bilingual + RTL.** Any user-facing string is translated (EN/AR) and verified in RTL.
- **Audit everything.** State changes write an `AuditEvent`. The audit log is append-only.
- **Fail safe.** External dependencies (OCR, ERP, ZATCA) must degrade gracefully — never
  lose a supplier's upload because a downstream service is down.

## 3. Workflow for a task

1. **Claim it:** set the roadmap checkbox to `[~]`.
2. **Plan:** restate the task's "Done when" criteria; list files you'll touch.
3. **Implement:** follow existing patterns; prefer editing over new files.
4. **Test:** unit tests always; integration tests when crossing a module/boundary.
5. **Verify locally:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
6. **Update docs:** API changes → `API.md` + OpenAPI; schema changes → `DATA_MODEL.md` +
   migration.
7. **Finish:** set the checkbox to `[x]`, add the PR link, and write a clear PR description
   referencing the task ID (e.g. `P1-E3-T5`).

## 4. Definition of Done (every task)

See `ROADMAP.md → Cross-cutting Definition of Done`. A PR is not done until all of it is met
**and** CI is green.

## 5. Conventions

- **Language:** TypeScript everywhere; no `any` on public boundaries.
- **Validation:** Zod schemas in `shared-types`, reused by NestJS DTOs and React Hook Form.
- **Money:** store as `Decimal` (or integer minor units); never floats.
- **Dates/currency:** localized; default currency SAR; support Hijri display.
- **Errors:** use the standard error envelope from `API.md §1`.
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`, `docs:`…).
- **Branches:** `feat/P1-E3-T5-invoice-submit` style.
- **Tests:** colocate; name by behavior, not implementation.

## 6. What needs a human decision (don't guess — flag it)

These are explicitly **open** and should be confirmed with stakeholders before building the
dependent task:

- Which **ERP** is the system of record (drives `P1-E2` connector specifics).
- Exact **ZATCA obligations** for Aljeel as a buyer vs supplier-driven e-invoicing (`P2-E6`).
- **Document retention** durations (tax/legal) for storage lifecycle policies.
- Choice of **auth provider** (Keycloak vs Azure AD B2C) and **OCR provider**.
- **Cloud region**/data-residency constraints under PDPL.

If a task depends on one of these and it's unresolved, implement against the **interface/mock**
(e.g. ERP connector mock, OCR provider abstraction) and leave the real integration behind a
clearly marked adapter.

## 7. Definition of "good result" for this project

A reviewer should be able to: pull the branch, run one command to start everything locally,
exercise the new capability through the UI or API, see tests covering it, and confirm the
roadmap + docs reflect the change. If all of that is true, the task delivered a fine result.

## 8. Quick reference

| I want to… | Go to |
|---|---|
| Understand a feature | `SPECIFICATION.md` |
| Understand a flow/diagram | `ARCHITECTURE.md` |
| Find an entity/field | `DATA_MODEL.md` |
| Find an endpoint | `API.md` |
| Find the next task | `ROADMAP.md` |
| Know the rules | this file |
