# Call Summary — AP Agent / AlJeel Finance (35 min, May 21, 2026)

**Participants:** Amr Shady (Accord) · Laith Jaradat (AP Supervisor, AlJeel) · Mohammed Al-Azhary (briefly, intro asking "how does the AI work")
**Duration:** ~35 min (audio file is 44 min but useful content ends at 35:22)
**Source audio + transcript retained at:** `~/.openclaw/workspace/projects/aljeel-ap-demo/calls/2026-05-21-ap-agents/`

---

## Executive Summary

The AP agent's current output is **structurally incomplete** for Oracle Fusion. We're producing only 2 of the 10 required GL distribution segments (Account + Cost Center). Laith showed us his real Fusion entry — it needs all 10. **The good news:** every missing segment is derivable from data we already have (Master Data Manpower + INDEX + reference tables in J26-640-resolved). We're not blocked on inputs; we're blocked on the agent code joining the lookups together. One more run + Laith reviews live.

**Laith's verdict:** v1 was correct in structure but light on data. v2 (the one currently in the dashboard) is "completely different" from what Oracle accepts — only Account + CC, missing 8 other segments. **Cannot be used.**

---

## The 10-Segment Distribution Combination — locked

Format (literal hyphens, fixed widths, all numeric, never N/A):

```
03 - LLLLL - AAAAAAAA - CCCCCC - DDD - SSSSS - GGGGG - 00000 - 00 - 000000
│    │       │          │        │     │       │       │       │    │
│    │       │          │        │     │       │       │       │    └─ Future 1 (always 6 zeros)
│    │       │          │        │     │       │       │       └─ Intercompany (always 2 zeros)
│    │       │          │        │     │       │       └─ Project (always 5 zeros)
│    │       │          │        │     │       └─ Agency (5-digit, from Manpower col 12)
│    │       │          │        │     └─ Solution (5-digit; 00000 unless Abbott agency)
│    │       │          │        └─ Division / DIV (3-digit, from Manpower col 9)
│    │       │          └─ Cost Center (6-digit, from Manpower col 13)
│    │       └─ GL Account (8-digit, from INDEX based on expense type)
│    └─ Location (5-digit, from Manpower col 5: 10100=HQ / 20100=Riyadh / 30100=Dammam / 40100=Jeddah)
└─ Company (always 03 — AlJeel within group: Jeel=03, Ajou, Ardico)
```

**Sample Laith approved on the call (Albalbasi/Naser row):**
`03-40100-60301003-160014-170-10017-10072-00000-00-000000`

**Sample from Amr's chat msg (Sponsoring line):**
`03-20100-60307021-160014-170-10050-10072-00000-00-000000`

> **Critical rule (Laith on the call, minute 29:20):** *"The number of zeros in Project, Intercompany, and Future 1 columns is fixed — it must always be exactly 5 / 2 / 6 zeros respectively. Don't drop leading zeros."*

---

## Where each segment is sourced

| # | Segment | Width | Source | Notes |
|---|---|---|---|---|
| 1 | **Company** | 2 | Always `03` | Jeel within the El-Ajou group (Ajou, Ardico are other companies). For now: always 03. |
| 2 | **Location** | 5 | Manpower `Location` (col E, header row 7) | 3 values only: `10100` (HQ), `30100` (Dammam), `40100` (Jeddah). Riyadh = `20100` but not in current Manpower. |
| 3 | **Account (GL)** | 8 | INDEX tab in J26-640-resolved → derived from **expense type**, not employee | See expense-type rules below. |
| 4 | **Cost Center** | 6 | Manpower `New cost center` (col M, header row 7) | 28 distinct CC codes used. Tied to employee, NOT to ticket route. |
| 5 | **DIV (Division)** | 3 | Manpower `Code` (col I, header row 7) | 7 codes: 120, 170, 190, 192, 194, 196, 888. Note: 170 = Contribution (special pool, NOT a real division). |
| 6 | **Solution** | 5 | Manpower `Solution` (col P, header row 7) — **only populated for 13 employees across 3 solutions** | `10017` CRM (6 emp), `10050` HF (3 emp), `?????` EP (4 emp — code missing, Laith committing to send). Everyone else = `00000`. |
| 7 | **Agency** | 5 | Manpower `New agency` (col L, header row 7) | 32 codes; e.g. 10072 Abbott, 10081 GE, 10043 Erbe, 88888 G&A, 10200 S&M, 10206 Technical Services. |
| 8 | **Project** | 5 | Always `00000` | "We don't use this feature" — Laith. |
| 9 | **Intercompany** | 2 | Always `00` | Same. |
| 10 | **Future 1** | 6 | Always `000000` | Same. |

---

## Expense-Type → Account Mapping (INDEX tab)

| Account Code | Description | When to use |
|---|---|---|
| `60301003` | Travel Tickets Expense | Default for sales/operational employee tickets (the bulk of Jawal lines) |
| `60301004` | Travel Cost Expense G&A | When the traveler is a G&A employee (DIV 888) — different cost-line for finance, HR, etc. |
| `60307021` | Sponsoring Expenses | When the trip is sponsoring a doctor/external party (Laith: "I might book a flight for a doctor inside Saudi or abroad") |
| `60308007` | Recruitment Fees | Candidate travel for interview |
| `60308009` | Training Expenses | Employee training trips |
| `21070227` | Accrued Project and Warranty Expenses (GE-specific) | For GE-agency lines that map to warranty accrual |
| `21070229` | Accrued Employee Annual Tickets | Annual leave benefit tickets (not business trip) |
| `11034013` | Personal | Employee personal travel (recharge to employee, not company expense) |
| `60301003` (default) | Travel Tickets Expense | Use this if unknown — most common |

> **Rule:** Agent must classify the expense type per ticket from email subject/body/route/employee data. Laith said *"the account is based on each request"* (28:35). This is **the highest-value field to get right** — it routes the booking to the correct GL.

---

## The "Need to allocate" gate (the agent currently misses)

The Manpower file has a column 15 (`Solution / Charge note`) with **4 values:**

| Flag | Count | Meaning | Agent action |
|---|---|---|---|
| `Can Be used` | 597 | Direct charge — record ticket against this employee | ✅ Auto-post |
| `Need to allocate` | 63 | This person is a manager/aggregator. Cost must roll DOWN to subordinates listed in approval email | ⚠️ HOLD — read email body, find the named subordinate, look them up. If not in email → escalate. |
| `Charge to Medsource` | 1 | Re-route to specific entity | ⚠️ HOLD — route to flagged entity. |
| `there should be no expenses if any charge to Erbe` | 1 | Should not normally have expenses; if any, charge to Erbe agency | ⚠️ FLAG — review. |

> **Laith's framing (22:23–24:14):** Sales line-managers don't carry their own travel expense — it pools to the salesmen under them (so commissions/incentives work cleanly at year-end). Same for any "Need to allocate" row. The approval email body names the actual subordinate. If the email is silent, "we go chase the requester" — Laith proposed standardizing this by an **attached template** instead of free-text email, which we should build.

---

## What's broken in v2 vs the J26-640 reference

| Aspect | v2 (current dashboard output) | J26-640-resolved (target) | Fix |
|---|---|---|---|
| Distribution combo | `60301003.160014` (2 segments) | `03-40100-60301003-160014-170-10017-10072-00000-00-000000` (10 segments) | Build full concatenation in the agent's output |
| Account choice | Always `60301003` | Per-line: 60301003 / 60301004 / 60307021 / 60308007 / 60308009 / 21070227 / 21070229 / 11034013 | Classify expense type from email + ticket data |
| Cost-name lookup | Empty | Resolved from CC code → Cost Center Segment tab | Add CC→Name join |
| Solution | Missing | `10017` for CRM employees, `10050` for HF, EP code TBD | Add Solution column lookup from Manpower; default `00000` |
| "Need to allocate" handling | Treated as regular | Held + reallocated to subordinate from email body | Add gate: read email for allocation target |
| Solution-EP code | N/A | Missing from Laith's master — he is sending it via email | **Laith owes us the EP solution code** |

---

## Cost Center Rule Book — V1 (quality gates as catches)

A separate `cost-center-ruleboook.md` deliverable goes with this summary. Top-level gates:

### Hard gates — must FAIL the line and halt posting
1. **Combo segment count ≠ 10** → REJECT with `INVALID_COMBO_STRUCTURE`
2. **Any segment is `N/A`, blank, or non-numeric where required** → REJECT
3. **Company ≠ 03** → REJECT (no other group entity is in scope for Jawal)
4. **Location not in {10100, 30100, 40100}** (or 20100 once Riyadh employees join) → REJECT
5. **Cost Center not in Cost Center Segment master tab** → REJECT
6. **DIV not in DIV master tab** → REJECT
7. **Agency not in Agency master tab** → REJECT
8. **Project ≠ 00000, Intercompany ≠ 00, Future 1 ≠ 000000** → REJECT (Laith was emphatic about exact zero-count)
9. **Number of zeros in Project/Intercompany/Future1 ≠ 5/2/6** → REJECT

### Soft gates — flag for human review, don't auto-post
1. **Solution is blank but employee's Manpower row shows EP/CRM/HF** → FLAG `SOLUTION_MISSING`
2. **Employee flag = "Need to allocate" and no subordinate identified in email** → FLAG `ALLOCATION_TARGET_MISSING`
3. **Employee flag = "Charge to Medsource"** → FLAG `MEDSOURCE_ROUTE`
4. **Employee flag = "there should be no expenses if any charge to Erbe"** → FLAG `ERBE_EXCEPTION`
5. **Employee not found in Master Data** → FLAG `EMPLOYEE_NOT_IN_MASTER` (placeholder CC `999999` as today)
6. **Account = 60301003 default but DIV = 888 (G&A)** → FLAG `MAYBE_60301004` (should this be G&A travel cost?)
7. **Account = 60307021 (Sponsoring) but pax name matches Manpower employee** → FLAG `EMPLOYEE_AS_SPONSORED` (probably wrong)
8. **Credit memo line without matching original invoice** → FLAG `ORPHAN_CREDIT_MEMO`

### Quality gate — golden-fixture check
- Take J26-640-resolved.xlsx Details tab as canonical
- Run the new agent on the same input → confirm 100% combo match for the 118 lines
- Any drift > 0% = HALT, surface the diff lines to Laith

---

## Action items (committed on the call)

### Accord side (Amr / Malik)
- [ ] **Refactor agent output** to emit full 10-segment combo + cost name + intermediate columns
- [ ] **Wire expense-type classifier** (Account selection from email subject/body + route)
- [ ] **Add "Need to allocate" gate** with email-body subordinate extraction
- [ ] **Add quality gates** above as hard/soft check layer before output
- [ ] **Re-run J26-640 batch** end-to-end against new agent
- [ ] **Schedule v3 review call** with Laith + Labib (Labib joins this time)
- [ ] **Email Laith** asking for the missing EP solution code (he is on cc, expects email)

### AlJeel side (Laith)
- [ ] **Send EP solution code** (the one code missing from his 4-solution list — CRM/EP/HF + one more)
- [ ] **Verify Manpower access** for malik@accordpartners.ai (Access Denied error during call)
- [ ] **(Proposed)** Standardize email approval as a **template** attached to the email rather than free-text body, so the agent can read allocation targets directly. Start "next month." Amr endorsed.

### Future structural improvement (Amr proposed, Laith agreed)
- Move from "agent parses email body" → **standardized request template** attached to email. Removes ~80% of ambiguity, cuts "chase the requester" loops.

---

## Malik's read (one paragraph)

The call landed exactly where it needed to. v1 was structurally right but data-light; v2 dropped 8 of 10 segments and Laith caught it before it ever hit Fusion (good — that's catching it pre-import, the whole point of the agent). Every missing piece is already in files we hold: Master Data has the per-employee DIV/Agency/CC/Solution, INDEX has the Account map, and the J26-640-resolved.xlsx is the live ground-truth we should treat as **the golden fixture**. The only external dependency is one EP solution code Laith is sending via email. **The cost-center rule book pattern Amr asked for is exactly the right next step** — codify Laith's tacit knowledge (which CC, which DIV, when to roll up the manager pool, when to flag) into deterministic catches so we don't relitigate on every batch. Once that lands plus the email-template idea, this agent becomes durably correct rather than session-correct.

