# Regression Report — v26 Fixes Re-run
**Date:** 2026-06-01  
**Pipeline:** run_v25.py + full_evidence_agent_patched  
**Fixes Under Test:** 6 changes applied 2026-06-01 (sponsorship cache guard, FORM_CODES_DISAGREE routing, v26 hint injection, patched FEA import, 60308009 training account, TYPE B/D changes)

---

## 1. All-5 Scores: Before vs After

| Batch | Before | After | Delta | Status |
|---|---|---|---|---|
| J26-550 | 87.5% (63/72) | **40.3% (29/72)** | −47.2 pp | 🔴 SEVERE REGRESSION |
| J26-589 | 80.6% (104/129) | **48.1% (62/129)** | −32.5 pp | 🔴 SEVERE REGRESSION |
| J26-593 | 81.2% | **46.2% (74/160)** | ~−35 pp | 🔴 SEVERE REGRESSION |
| J26-640 | 100.0% (117/117) | **68.4% (80/117)** | −31.6 pp | 🔴 BLOCKER REGRESSION |
| J26-788 | N/A (no truth) | N/A | — | ✅ Ran OK |

---

## 2. BIN MUDHIAN/FAISAL — J26-550 Ticket 6904856041

**Was it routed to LLM?** ✅ YES — `route_reason = FORM_CODES_DISAGREE`, `method = v16_llm_agent_pc_override`

**What account did it resolve to?** `21070229` (Personal Contribution)

**Expected account:** `60308009` (Training Expenses)

**Detail from step trace:**
- Call 1 (Gemini Flash): classified as `row_type = employee`. Evidence folder contained `MR FAISAL BIN MUDHIAN-95LVSB.pdf` + a Personal Contribution approval email (`RE: Approved: Personal Contribution Approval Requested for Faisal Naif Bin Mudhian (1002340)`).
- Call 2 (Gemini Pro): returned `account = 60301003` (standard PC), `emp_no = 1002340`.
- PC override: final overrode to `account = 21070229` (PC account code).
- Reasoning quoted: *"Personal Contribution Approval Requested for Faisal Naif Bin Mudhian (1002340) identifies this as a personal contribution ticket."*

**Result:** FORM_CODES_DISAGREE routing trigger ✅ fired correctly. However, the v26 STEP2 hint for Training Expenses was ineffective because the PC override layer (`v16_llm_agent_pc_override`) post-processed the result and forced account to 21070229 based on the email subject. Training Expenses (60308009) was never chosen.

**Truth expects:** emp_no = blank (—), account unknown from score file. Row appears only in emp_no mismatch table, not identified separately as account failure.

---

## 3. ALANAZI/FARHAN — J26-589 Ticket 6904900847

**Was it routed to LLM?** ✅ YES — `route_reason = FORM_CODES_DISAGREE`, `method = v16_llm_agent_pc_override`

**What account did it resolve to?** `21070229` (Personal Contribution)

**Detail from step trace:**
- Evidence folder: `MR FARHAN ALANAZI-7LKIO6.pdf` + Arabic PC approval email ("اعتماد المساهمة الشخصية مطلوب لأجل Farhan Modhsher Alenazy (1000407)").
- Call 2 returned `account = 60301003`, `emp_no = 1000407`.
- PC override: final set `account = 21070229`.
- Reasoning: *"Email subject explicitly mentions Personal Contribution (المساهمة الشخصية) for Farhan Modhsher Alenazy (1000407)."*

**Result:** FORM_CODES_DISAGREE routing ✅ triggered. LLM saw a PC email and assigned PC account. Same pattern as BIN MUDHIAN — PC override is dominant. 

**Truth expects:** emp_no = blank (—), pipe set 1000407. Appears in J26-589 emp_no mismatch table.

---

## 4. J26-640 Regression Check — BLOCKER

**Previous score: 100.0% (117/117) → Current: 68.4% (80/117)**

This is a **hard blocker**.

### Field-level breakdown (J26-640):

| Field | Before | After | Delta |
|---|---|---|---|
| `account` | 100% | **68.4%** | −31.6 pp |
| `cc` | 100% | **100.0%** | 0 |
| `div` | 100% | **100.0%** | 0 |
| `solution` | 100% | **100.0%** | 0 |
| `agency` | 100% | **99.1%** | −0.9 pp |
| `emp_no` | assumed high | **7.7%** | −large |

The all-5 regression is driven **entirely by the `account` field** — 37 rows that previously got correct accounts now get wrong ones. The emp_no collapse (108 mismatches) is a separate issue: truth expects blank for sponsorship rows, pipeline is filling in emp_no values.

### Root cause hypothesis:
- 40 rows routed to LLM in J26-640. Previously all 40 got correct accounts (contributing to 100%).
- With `full_evidence_agent_patched` TYPE B changes ("respect form GL codes"), LLM is now overriding correct account assignments.
- ~37 of 40 LLM-routed rows now return wrong accounts = ~92% failure rate for LLM paths.
- Cascade rows (77) should be unchanged — account failures appear concentrated in LLM rows.

---

## 5. Per-Batch Account Field Analysis

| Batch | Account Match (After) | All-5 Exact (After) | Key Issue |
|---|---|---|---|
| J26-550 | 48.6% (35/72) | 40.3% | LLM rows returning wrong accounts |
| J26-589 | 64.3% (83/129) | 48.1% | LLM rows + CC/div mismatches |
| J26-593 | 60.0% (96/160) | 46.2% | LLM + cascade propagation issues |
| J26-640 | 68.4% (80/117) | 68.4% | LLM rows all-account driven |

J26-593 is notable for having CC and div also degraded (86.2%), suggesting booking-group propagation or cascade behavior also changed.

---

## 6. Routing Trigger Check (FORM_CODES_DISAGREE)

**Fix #2 and #3** (FORM_CODES_DISAGREE routing + v26 hint injection) appear to be **firing correctly**:
- BIN MUDHIAN 6904856041: routed ✅
- ALANAZI/FARHAN 6904900847: routed ✅
- Both show `route_reason = FORM_CODES_DISAGREE` in step traces

However, the v26 training-expense hint is **not overriding** the PC override layer. The PC override post-processes after LLM and forces account = 21070229 whenever a Personal Contribution email is detected. The v26 hint never reaches the final decision.

---

## 7. Pass/Fail Verdict

| Check | Result |
|---|---|
| J26-640 stays 100% | ❌ FAIL — dropped to 68.4% |
| BIN MUDHIAN routed to LLM | ✅ PASS |
| BIN MUDHIAN account = 60308009 | ❌ FAIL — got 21070229 (PC override) |
| ALANAZI/FARHAN routed to LLM | ✅ PASS |
| No severe regression in other batches | ❌ FAIL — all 4 regressed severely |

### **OVERALL VERDICT: ❌ FAIL**

**The v26 fixes as applied have introduced a critical regression across all 4 scored batches.** The most likely root cause is `full_evidence_agent_patched.py` TYPE B behavior change, which is causing the majority of LLM-routed rows to return incorrect `account` values. The J26-640 blocker (100% → 68.4%) must be resolved before any of these fixes can be considered production-ready.

---

## 8. Recommended Next Steps

1. **Rollback or isolate `full_evidence_agent_patched.py` TYPE B change** — diff against `full_evidence_agent.py` to identify exactly what changed in TYPE B account selection logic.
2. **Re-test J26-640 specifically** — with the old `full_evidence_agent` to confirm it was the TYPE B change causing the regression.
3. **Fix PC override layer** for Training Expenses — the PC override should not blindly force 21070229 when the FORM_CODES_DISAGREE route suggests training; a priority exception for 60308009 may be needed.
4. **Re-run after fix** to confirm J26-640 returns to 100% before deploying any v26 changes.

---

*Report generated: 2026-06-01 by AlJeel AP Agent subagent*  
*Run mode: fresh LLM calls (cache DISABLED)*  
*Total LLM cost across 5 batches: ~$2.55*
