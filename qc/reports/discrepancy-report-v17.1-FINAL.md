# AlJeel AP — Discrepancy Report v17.1

**Generated:** 2026-05-27  
**Pipeline:** v16 → v17.1 (canonical clean run, no manual sheet fixes)  
**Batches scored:** J26-550 / J26-593 / J26-640 (truth files available)  
**Batches without truth:** J26-589 / J26-788  

---

## Score Summary

| Batch | Period | Rows | All-5 Exact | Account% | CC% | Agency% | Notes |
|---|---|---|---|---|---|---|---|
| **J26-550** | Apr 1-7 2026 | 72 | **61/72 (84.7%)** | 91.7% | 95.8% | 95.8% | +5 family rows fixed by v17.1 |
| **J26-589** | Apr 8-15 2026 | 129 | *(no truth)* | — | — | — | 0 changes vs v16 |
| **J26-593** | Apr 16-23 2026 | 160 | **130/160 (81.2%)** | 96.2% | 85.6% | 82.5% | 0 changes vs v16 |
| **J26-640** | Apr 24-30 2026 | 117 | **117/117 (100.0%)** ✅ | 100% | 100% | 100% | Golden — zero regression |
| **J26-788** | May 1-7 2026 | 103 | *(no truth)* | — | — | — | 0 changes vs v15.11.2 |
| **Total (scored)** | | **349** | **308/349 (88.3%)** | | | | |

---

## v17.1 Changes vs v16

### J26-550 — 6 rows patched
| Ticket | Passenger | Fix |
|---|---|---|
| 6904732429 | HUSSEIN/TALIA MS(CHD) | Breakdown columns (Q-AF) synced to combo: CC=160014, Loc=10100 |
| 6904732430 | HUSSEIN/YOUSSEF MR | Combo + all columns → emp=1002466, CC=160014, Agency=10239 |
| 6904732431 | SALEM/EFFAT MRS | Combo + all columns → emp=1002466, CC=160014, Agency=10239 |
| 6904763646 | ADHRI/OUMAIMA MRS | Propagated from BENSALEM/FATHI anchor → CC=160012, Agency=10109 |
| 6904763647 | BENSALEM/ADAM (INF) | Propagated → CC=160012, Agency=10109 |
| 6904763648 | BENSALEM/ELINE MS(CHD) | Propagated → CC=160012, Agency=10109 |
| 6904763649 | BENSALEM/YASSMINE MS(CHD) | Propagated → CC=160012, Agency=10109 |

> Note: ADHRI/OUMAIMA MRS (Bensalem family) and all three children were 999999 in v16. v17.1 anchored them to BENSALEM/FATHI MR. ✅

### J26-589 / J26-593 / J26-640 / J26-788 — 0 changes
All family groups in these batches were either already consistent, fully unresolved (no anchor), or correctly classified as colleagues (skipped).

---

## Remaining Discrepancies — Root Cause Analysis

### Category 1 — Stale Oracle Manpower Export (largest gap, ~30 rows across J26-593)

The Oracle Manpower master (003) has employees whose CC/Division/Agency has changed since the export. Pipeline resolves correctly against the master we have, but the master itself is outdated.

**J26-593 examples:**
| Ticket | Employee | Master CC | Truth CC | Gap |
|---|---|---|---|---|
| 6905084597 | ALSOMALI/NADIYA MS (1000313) | 250010 | 160014 | Dept transfer |
| 6905084613 | ALHUSSEIN/MOSAAD MR (1000587) | 160011 | 160014 | Dept transfer |
| 6905173612 | AHMED/AHMED MOHAMED MR (1000087) | 250010 | 160014 | Dept transfer |
| 6905173622 | ALHUSSEIN/MOSAAD MR (1000587) | 160011 | 160014 | Dept transfer |

**Action required:** Qasim to provide updated Oracle Manpower export. Estimated impact: ~15–20 rows fixed in J26-593, similar in other batches.

---

### Category 2 — Employees Not In Master (4 confirmed, ~6 rows in J26-593)

Four employees appear in tickets but have no record in Master Data (003):

| Employee | Ticket(s) | Batch | Status |
|---|---|---|---|
| ALQARNI/MOHAMMED MR | 6905084636, 6905084638 | J26-593 | 999999 — NOT IN MASTER |
| HALAWANI/RAGHEB MR | 6905084640 | J26-593 | 999999 — NOT IN MASTER |
| DAGRIRI/KHALID MR | 6905202187 | J26-593 | 999999 — NOT IN MASTER |
| ABDELMAQSOUD (various) | multiple | J26-593 | 999999 — NOT IN MASTER |

**Action required:** Laith to confirm CC/Agency for these 4 employees. Once known, they can be added to a master override file and the pipeline can re-resolve them without a full rerun.

---

### Category 3 — Wrong Account (6 rows in J26-550, 6 rows in J26-593)

Pipeline assigned travel account (`60301003`) where truth is personal contribution (`21070229`), or vice versa.

**J26-550:**
| Ticket | Passenger | Pipe Account | Truth Account |
|---|---|---|---|
| 6904732429 | HUSSEIN/TALIA MS(CHD) | 60301003 | 21070229 |
| + ~5 others | — | 60301003 | 21070229 |

> Root cause: personal contribution emails are in .msg files with corrupt bodies. v16 classifies from subject line; when subject is ambiguous or missing, account defaults to travel. v17.1 does not change account assignment — only GL combo propagation within booking groups.

---

### Category 4 — CC/Agency from Wrong Employee (cascade noise, ~8 rows across batches)

Pipeline matched an employee correctly by name but picked a stale or wrong master record.

**J26-550:**
| Ticket | Passenger | Pipe CC | Truth CC | Note |
|---|---|---|---|---|
| 6904763668 | ALEJO/JOE MARIE MR | 150020 | 250010 | Cascade picked wrong loc bucket |
| 6904823513 | ELAZHARY/MOHAMED MR | 150020 | 170020 | Stale master |
| 26-550 | HAITHAM ELKHATEEB | 250010 | 250020 | CC code close but wrong |

**J26-593 (sample):**
| Ticket | Passenger | Pipe CC | Truth CC |
|---|---|---|---|
| 6905084601 | ALANAZI/ABDULAZIZ MR | 150020 | 140020 |
| 6905084673 | ALATTAR/ABDULLAH MR | 160013 | 160012 |
| 6905129222 | SHAIK/IMTIAZ AHMED MR | 140040 | 160013 |

> Root cause: Multiple employees with similar names in master; cascade uses email name matching which can hit the wrong record when names are common (ALANAZI, ALATTAR, etc.).

---

### Category 5 — Emp_no Mismatch (all CCs correct)

These rows have **correct CC/Account/Agency/DIV/Solution** (all-5 pass) but emp_no differs from truth. Not a scoring gap — the GL allocation is correct for Oracle Fusion submission.

- J26-550: 13 rows (emp_no mismatch, CC all correct)
- J26-593: 127 rows (emp_no mismatch, CC all correct)
- J26-640: 104 rows (emp_no mismatch, CC all correct — entirely sponsorship rows where truth has blank emp)

These are cosmetic for now. Sponsorship rows in AlJeel truth have emp_no=blank (not employee-attributed), but pipeline writes the requesting employee's emp_no. This is a display convention difference, not a GL error.

---

## Open Actions

| # | Action | Owner | Impact |
|---|---|---|---|
| 1 | Export updated Oracle Manpower | Qasim | ~15-20 rows in J26-593 |
| 2 | Confirm CC/Agency for ALQARNI, HALAWANI, DAGRIRI, ABDELMAQSOUD | Laith | 4-6 rows in J26-593 |
| 3 | Clarify account 60308009 definition | AlJeel | Unknown |
| 4 | Confirm missing OPEX docs for NOMAN sponsorship rows | Laith | J26-593 sponsorship |

---

## Pipeline Versions Summary

| Version | What it does |
|---|---|
| v15.11.2 | Cascade (deterministic rule-based) |
| v15.12 | Hybrid: cascade + LLM for unresolved/sponsorship rows |
| v16 | Two-call architecture (classify + resolve); emp-first logic |
| **v17.1** | Booking group detection: family members + breakdown column sync |

**v17.1 is the canonical output version.** Run command per batch:
```
python3 scripts/run_v17.py J26-XXX --input-suffix v16
python3 scripts/run_v17.py J26-788 --input-suffix v15.11.2
```
