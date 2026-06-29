# Aljeel Supplier AP Portal — Specification

> Source of truth for **what** to build. Pair this with `ARCHITECTURE.md` (how),
> `DATA_MODEL.md` (entities), `API.md` (contract), and `ROADMAP.md` (sequence).

---

## 1. Vision & Goals

A self‑service portal where Aljeel's suppliers submit invoices and supporting
documents, track payment status in real time, and manage their profile — while
Aljeel's AP team gets a clean, validated, automated intake pipeline that feeds the ERP.

### Success metrics (tier‑1 benchmarks)
| Metric | Target |
|---|---|
| Touchless invoice rate (straight‑through, no human keying) | ≥ 70% |
| Invoice intake → ERP posting (clean invoices) | < 24h |
| Supplier self‑service rate (no email/phone to AP) | ≥ 85% |
| OCR header-field accuracy | ≥ 95% |
| Portal uptime | 99.9% |

### Design principles
- **Seamless** — 3 clicks to submit an invoice.
- **Transparent** — supplier always knows the exact status and next step.
- **Automated** — OCR + validation + matching minimize human touch.
- **Compliant** — ZATCA, VAT, immutable audit trail.
- **Bilingual** — Arabic (RTL) + English (LTR) first-class.

---

## 2. Personas & Roles

**Supplier side (external):**
- **Supplier Admin** — manages company profile, bank details, sub-users.
- **Supplier User** — uploads invoices, views status, downloads remittances.

**Aljeel side (internal):**
- **AP Clerk / Processor** — reviews exceptions, validates, corrects OCR.
- **AP Approver / Manager** — approves per Delegation of Authority (DOA).
- **Procurement** — owns POs, resolves PO/GRN mismatches.
- **Treasury / Payments** — executes payment runs, publishes remittance.
- **Vendor Master / Onboarding** — approves new suppliers and bank changes.
- **System Admin** — roles, permissions, config, integrations.
- **Auditor (read-only)** — full audit-trail visibility.

RBAC with least privilege. Suppliers are strictly scoped to their own organization
(hard multi-tenant isolation enforced at the data layer).

---

## 3. Functional Modules

### 3.1 Supplier Onboarding & Vendor Master
- Self-registration via invite link, or AP-initiated invitation.
- KYC document collection: trade license (CR), VAT certificate, national address,
  bank letter (IBAN proof), W-8/W-9 if applicable.
- Bank detail capture with **maker-checker** verification (bank changes never auto-apply).
- Duplicate vendor detection (CR number, VAT number, IBAN).
- Approval workflow before a supplier becomes "active."
- Vendor categories, payment terms, default currency synced from ERP.

### 3.2 Invoice Submission (core flow)
- **Upload-only intake:** supplier uploads the invoice PDF plus any supporting attachments
  (delivery notes, GRN copy, timesheets, contracts) — no manual data entry required.
- **OCR/IDP extraction (async):** after submit, the system extracts invoice no., date, PO no.,
  line items, subtotal, VAT, total, currency, supplier VAT/CR — with per-field confidence scores.
- **PO linkage:** matched automatically from OCR or assigned by AP during review (not supplier-entered).
- **Attachments:** typed & tagged (invoice PDF vs supporting documents).
- **Validation before submit:**
  - Invoice PDF attachment required.
  - Duplicate invoice check (supplier + invoice no.) — runs after OCR extracts the number.
  - VAT math validation — runs after OCR populates line items.
  - Currency / PO consistency.
  - ZATCA (Fatoora) format check for XML/UBL submissions.
- **Draft & resume** — supplier can save a draft with uploads and return later to submit.

### 3.3 3-Way Matching & Validation Engine
- Automated **PO ↔ GRN ↔ Invoice** match with configurable tolerances (price %, qty %, amount).
- Auto-approve within tolerance ("touchless").
- Exception routing to AP clerk with explicit reason codes when out of tolerance.
- Non-PO invoice path → GL coding + approval workflow.

### 3.4 Approval Workflow Engine
- Configurable rule-based routing (amount thresholds, cost center, category, entity).
- Authority/delegation matrix (DOA), out-of-office delegation.
- Parallel and sequential approvals; SLA-based escalation.
- Full approval history with comments.

### 3.5 Supplier Self-Service Dashboard
- Invoice pipeline: `Draft → Submitted → Under Review → Approved → Scheduled → Paid`
  (plus `Rejected` / `On Hold`).
- Filters/search (date, PO, status, amount); export to Excel/PDF.
- Per-invoice status timeline (who did what, when).
- Clear **rejection reasons** + resubmit flow.
- Payments & remittance: scheduled date, paid amount, payment reference, downloadable
  remittance advice.
- Statement reconciliation: supplier statement vs Aljeel ledger; flag discrepancies.
- Notifications center + document repository (all historical uploads).

### 3.6 Communication & Notifications
- In-app + email + optional SMS/WhatsApp for: received, exception/rejection, approval,
  scheduled, paid.
- Two-way messaging thread per invoice (supplier ↔ AP).
- Configurable bilingual templates.

### 3.7 Admin & Configuration
- Workflow designer, tolerance config, role/permission management.
- Master-data sync settings (ERP: suppliers, POs, GL, cost centers).
- Audit log viewer; reporting/analytics dashboards.

### 3.8 Analytics & Reporting
- AP aging, DPO, touchless rate, exception-reason breakdown, cycle-time, supplier
  scorecards, early-payment discount capture.
- Scheduled exports; BI export (Power BI / Looker).

---

## 4. Key User Journeys

**Supplier submits an invoice (happy path):**
1. Log in → "Submit Invoice."
2. Upload invoice PDF + any supporting attachments → Submit.
3. System runs OCR extraction (~3–5s) and populates invoice fields.
4. System runs duplicate + VAT + ZATCA + 3-way match on extracted data.
5. Within tolerance → auto-approved → "Scheduled for payment on [date]."
6. Supplier notified; status visible on dashboard.

**Exception path:** Out of tolerance → routed to AP clerk → clarification via in-app
message → supplier corrects/resubmits → approved.

**Payment:** Treasury runs payment batch in ERP → status syncs to "Paid" with reference
→ remittance advice auto-published to supplier.

---

## 5. Security, Compliance & Identity

- **AuthN:** OAuth2/OIDC (Keycloak / Auth0 / Azure AD B2C). **MFA mandatory.**
- **AuthZ:** RBAC + attribute-based scoping; hard multi-tenant isolation enforced at the
  query layer (not just UI).
- **Data protection:** TLS 1.2+ in transit; AES-256 at rest; field-level encryption for
  bank details.
- **Fraud controls:** maker-checker on bank/IBAN changes; change-of-bank alerts via a
  second channel; anomaly detection on bank changes near payment runs.
- **File security:** antivirus/malware scan on every upload; file-type allowlist; size
  limits; content sniffing.
- **Audit & retention:** immutable append-only audit trail; document retention per tax
  rules (≥ 6–10 years; confirm with finance/legal).
- **Compliance:** ZATCA/Fatoora e-invoicing (KSA), VAT validation/reporting, PDPL/GDPR-style
  handling, SOC 2 / ISO 27001-aligned controls.
- **Secrets:** vault (HashiCorp Vault / cloud KMS).
- **Monitoring:** centralized logs, SIEM, intrusion detection.

---

## 6. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | Invoice list < 1s; OCR result < 10s p95; uploads support 50MB+ via chunking |
| Scalability | Horizontal scaling of API + workers; queue-based load leveling at month-end |
| Availability | 99.9%; multi-AZ; graceful degradation (uploads queue even if OCR is down) |
| DR | RPO ≤ 15 min, RTO ≤ 1h; automated, tested backups |
| Observability | Metrics (Prometheus/Grafana), tracing (OpenTelemetry), structured logs, alerting |
| Localization | Arabic (RTL) + English; Hijri/Gregorian dates; SAR + multi-currency |
| Accessibility | WCAG 2.1 AA |

---

## 7. Integrations

- **ERP** (SAP / Oracle / Dynamics / Odoo — confirm): bi-directional sync — vendors, POs,
  GRNs inbound; invoices/postings + payment status outbound. Queue-based with retry,
  dead-letter, and reconciliation jobs.
- **OCR/IDP:** Azure Document Intelligence / AWS Textract / Rossum / Nanonets.
- **ZATCA Fatoora:** e-invoice clearance/reporting.
- **Email** (SES/SendGrid), **SMS/WhatsApp** (Twilio/Unifonic for KSA).
- **VAT/CR validation** services where available.

---

## 8. Out of Scope (initial release)

- Portal-driven bank payment file generation (owned by ERP/treasury; portal reflects status).
- Supplier financing / dynamic discounting marketplace (future phase).
- Mobile native apps (PWA covers mobile initially).

---

## 9. Glossary

- **AP** — Accounts Payable.
- **PO** — Purchase Order. **GRN** — Goods Receipt Note.
- **3-way match** — reconciling PO, GRN, and invoice before payment.
- **Touchless** — invoice processed end-to-end without human keying.
- **DOA** — Delegation of Authority (who can approve what amount).
- **IDP/OCR** — Intelligent Document Processing / Optical Character Recognition.
- **ZATCA / Fatoora** — KSA tax authority e-invoicing program.
- **PDPL** — Saudi Personal Data Protection Law.
