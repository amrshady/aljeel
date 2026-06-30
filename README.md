# Aljeel Supplier Accounts Payable (AP) Portal

A tier‑1, self‑service Accounts Payable platform where **Aljeel's suppliers** submit
invoices, attachments, and supporting documents, track payment status in real time,
and manage their own profile — while **Aljeel's AP team** gets a validated,
automated intake pipeline that feeds the ERP.

> **Status:** Greenfield. This repository currently contains the full product
> specification and an execution roadmap designed so that engineering teams *and AI
> coding agents* can build the platform incrementally with minimal ambiguity.

---

## What's in here

| Document | Purpose |
|---|---|
| [`docs/SPECIFICATION.md`](docs/SPECIFICATION.md) | The complete product & technical specification (source of truth for *what* to build). |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture, diagrams, tech stack, and key flows (*how* it fits together). |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Entities, relationships, and a reference Prisma schema. |
| [`docs/API.md`](docs/API.md) | REST API contract, conventions, and representative endpoints. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phased delivery plan broken into epics → tasks, each scoped for a single agent/PR. |
| [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md) | **Read this first if you are an AI agent or new engineer.** Working rules, conventions, and how to pick up a task. |


---

## Deployed internal tools (live today)

Beyond the greenfield spec above, this repo also vendors the **source + runbooks
for the internal AlJeel AP tools that are already in production** (under `workers/`):

| Tool | Live URL | Source | Runbook |
|---|---|---|---|
| **KB Upload Portal** (Al Jawal + Asateel tabs) | files-aljeel.accordpartners.ai | [`workers/files-portal/`](workers/files-portal/) | [`FILES_PORTAL.md`](workers/files-portal/FILES_PORTAL.md) |
| **Evidence Browser** (folder tree + full-text search inside PDFs/emails) | aljeel-ap-files.accordpartners.ai/evidence | [`workers/evidence-browser/`](workers/evidence-browser/) | [`EVIDENCE_BROWSER.md`](workers/evidence-browser/EVIDENCE_BROWSER.md) |

Each runbook documents the full architecture (Cloudflare Pages + Functions/Worker +
DigitalOcean Spaces / Flask backend over a CF Tunnel), a reusable "how to spin up a
new one" recipe, deploy commands, and gotchas. **No secrets are committed** — every
credential is referenced by env-var name only.

---

## TL;DR of the product

- **Suppliers** upload an invoice PDF plus optional supporting attachments and see status:
  `Draft → Submitted → Under Review → Approved → Scheduled → Paid` (or `Rejected/On Hold`).
- **OCR/IDP** auto-extracts invoice fields from the uploaded PDF; **3‑way matching** (PO ↔ GRN ↔ Invoice) drives
  touchless processing.
- **AP team** handles only exceptions; everything else flows straight to the ERP.
- **Compliance-first** for KSA: ZATCA/Fatoora e‑invoicing, VAT, PDPL, Arabic RTL + English.

## Recommended stack (see ARCHITECTURE.md for rationale)

- **Frontend:** Next.js + TypeScript, Tailwind + shadcn/ui, TanStack Query, i18next (RTL)
- **Backend:** NestJS (TypeScript) modular monolith → services
- **Data:** PostgreSQL + Redis + OpenSearch + S3-compatible object storage
- **Async:** RabbitMQ/SQS for OCR, matching, ERP sync, notifications
- **Auth:** Keycloak / Azure AD B2C (OIDC + MFA)
- **Infra:** Docker + Kubernetes, Terraform, CI/CD

## Local development

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local services)

### Quick start

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis, RabbitMQ, MinIO)
docker compose -f infra/docker-compose.yml up -d

# Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Generate Prisma client, migrate, and seed dev suppliers
pnpm --filter @aljeel/api prisma:generate
pnpm --filter @aljeel/api prisma:migrate
pnpm --filter @aljeel/api prisma:seed

# Start all apps in dev mode
pnpm dev
```

- **Web:** http://localhost:3000
- **API:** http://localhost:3002/api/v1/health
- **Swagger:** http://localhost:3002/api/docs
- **RabbitMQ UI:** http://localhost:15672 (aljeel / aljeel)
- **MinIO Console:** http://localhost:9001 (aljeel / aljeelsecret)

### Verify

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Getting started (for agents)

1. Read [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md).
2. Open [`docs/ROADMAP.md`](docs/ROADMAP.md) and pick the next unblocked task.
3. Follow the Definition of Done and conventions before opening a PR.

## Open assumptions to confirm with stakeholders

1. Aljeel is a **KSA/GCC entity** → ZATCA + PDPL + Arabic RTL included.
2. An **ERP** is the financial system of record (which one? SAP / Oracle / Dynamics / Odoo).
3. Suppliers are **external organizations** requiring strict multi-tenant isolation.
