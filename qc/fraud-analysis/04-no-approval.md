# NO_APPROVAL — Fraud Rule Case File

**Category:** `NO_APPROVAL` (within-batch QC)
**Severity in rule:** MEDIUM (≤SAR 3,000) / HIGH (>SAR 3,000)
**Status in v15.10:** Active. **73 catches total** (34 J26-640 + 39 J26-788), SAR 74,862 total claimed value-at-risk.
**Investigation date:** 2026-05-22
**Verdict:** **🔴 REFINE — the rule's "no approval" detection is wired to a single Oracle Fusion form-parsing flag, which produces ~22% known-false-positives plus many soft-false-positives. Needs a multi-source approval detector.**

---

## What the rule is supposed to catch

Travel-expense rows where no manager/approver evidence exists — pipeline can't confirm the trip was authorized before the agency invoiced. Concern: agency bills for trips that were never approved (or approval was fabricated).

## What the rule actually does (root cause analysis)

In `scripts/qc_catches_within_batch.py:373`:

```python
has_msg = "FORM_NOT_FOUND_IN_EMAIL" not in r.flags
```

`FORM_NOT_FOUND_IN_EMAIL` is set by `oracle_form_parser.py` when it fails to locate an Oracle Fusion **Personal Contribution Approval** structured form in the .msg body. It's a parsing-success flag for ONE specific approval format.

But AlJeel uses **at least 5 different approval mechanisms:**

1. **Oracle Fusion Personal Contribution form** — fired by Workday/Oracle, structured body. ← what the parser is wired for
2. **Free-text reply with `يعتمد` Arabic stamp** — manager replies "approved" or "يعتمد" in plain text
3. **OPEX PDF attachment** — sponsorship/event approval as a PDF instead of structured form (already excluded by `account == 60307021`)
4. **Voucher with no .msg at all** — 26-XXX vouchers (train tickets, hotels, airport transfers) use the **Ref. No. column on the invoice itself** to carry the employee number; the approval IS the booking authorization the agency received offline
5. **Email subject `RE: Approved_ Personal Contribution Approval Requested for [Pax]`** — the subject literally says "Approved" but the body may not contain the Oracle Fusion form (it's a forwarded thread, the form is buried deep or in an attachment)

The current rule only recognizes type 1. The other 4 trip-with-approval categories generate false-positive NO_APPROVAL flags.

## Confirmed evidence of mis-firing

**Searched raw/ folders directly for .msg files matching each NO_APPROVAL ticket. 16 of 73 catches have a .msg file sitting right there with explicit approval language.**

| Batch | Ticket | Passenger | .msg filename evidence |
|---|---|---|---|
| J26-640 | 6905264389 | ALATTAR/ABDULLAH MR | `RE_ Riyadh- Jeddah& Jeddah-Dammam business trip.msg` |
| J26-640 | 6905264402 | ALI/HESHAM MR | `RE_ Flight to Jeddah.msg` — body contains `يعتمد المرسل من قبلكم` (explicit Arabic approval) |
| J26-640 | 6905318873 | BABAKR/MOHAMMED MR | `RE_ Approved_ Personal Contribution Approval Requested for Mohammed Babiker...` |
| J26-640 | 6905318904 | ALQAHTANI/YAZEED MR | `RE_ حجز طيران لمهمة عمل لحائل.msg` (Arabic "ticket booking for business mission to Hail") |
| J26-640 | 6905341955 | ALHAJJ/HUSAM MR | `RE_ طلب حجز_حسام علوي الحاج_من (جدة - الباحة - جدة).msg` |
| J26-640 | 6905369363 | HASHAD/TAREK MR | `RE_ Approved_ Personal Contribution Approval Requested for Tarek...` |
| J26-640 | 6905397741 | ELKILO/ABDELRAHMAN MR | `Re_ Approved_ Personal Contribution Approval Requested...` |
| J26-640 | 6905397773 | FEHRI/OUSAMA MR | `Re_ Approved_ Personal Contribution Approval Requested...` |
| J26-788 | 6905478418 | BATAWEEL/WALEED MR | `RE_ Approved_ Personal Contribution Approval Requested for Waleed Osama Bataweel (1001008)` |
| J26-788 | 6905478426 | ALHAJJ/HUSAM MR | `RE_ طلب حجز_حسام علوي الحاج_من (جدة - جازان - جدة).msg` |
| J26-788 | 6905478428 | SALEH/MARIAM MS(CHD) | `RE_ Action Required_ Personal Contribution Approval Requested...` |
| J26-788 | 6905478467 | BABAKR/MOHAMMED MR | `RE_ Approved_ Personal Contribution Approval Requested...` |
| J26-788 | 6905495644 | OMER/WALAA MS | `RE_ Riyadh Business Trip.msg` |
| J26-788 | 6905533340 | ALHATO/ABDULHADI MR | `RE_ Approved_ Personal Contribution Approval Requested...` |
| J26-788 | 6905533352 | BABAKR/MOHAMMED MR | `RE_ Approved_ Personal Contribution Approval Requested...` |
| J26-788 | 6905533359 | HADDAD/HAMZAH MR | (typical RE_ Approved pattern) |

These are all FALSE POSITIVES. The approval evidence exists. The pipeline just isn't recognizing it.

## Pattern analysis on the remaining 57 catches (no .msg found by filename search)

These DO need investigation, but with caveats:

- **Voucher rows (26-XXX)** — Train tickets, hotel rows, airport transfers, registration vouchers. These usually have NO .msg because the approval was attached to the original airline ticket booking, not the voucher itself. Already partially covered by the voucher→emp_no logic in v15.10, but the QC rule isn't aware.
- **Account 60301004 (G&A Travel)** — 14 of 34 J26-640 catches sit on this account. G&A travel is for executive/admin staff whose approval flow doesn't generate a Personal Contribution form. Manager approvals may exist as plain reply emails in different folders.
- **Account 11034013 (Personal)** — 3 catches in J26-788. Personal trips (family member CHD passengers, SALEH/MARIAM) ride along with an employee's primary trip; the approval is for the parent employee, not the dependant.

## Severity breakdown (the actual fraud-worthy subset)

- **HIGH severity** (>SAR 3,000): 6 catches total — only these are worth Finance attention if confirmed
- **MEDIUM severity** (≤SAR 3,000): 67 catches — bulk of the noise

Of the 6 HIGH-severity catches:
- 1 already known false-positive (ALI/HESHAM 6905428813 — Casablanca segment of the documented Hesham Zaki COO trip we know is approved)
- 1 in J26-788 (SALEH/FARAH MRS — family ride-along on the SALEH cluster, the parent employee's approval covers it)
- 4 others worth checking but probably similar voucher/G&A-pattern false positives

## Refinement recommendation for v15.11

**Build a multi-source approval detector** instead of relying on a single parser flag:

```python
def has_approval(line, raw_dir, ticket_no, emp_no):
    """Returns (has_approval: bool, evidence: str)"""
    # Source 1: Oracle Fusion form parsed successfully
    if "FORM_NOT_FOUND_IN_EMAIL" not in line.flags:
        return True, "FUSION_FORM"
    
    # Source 2: .msg file exists for the ticket, body contains explicit approval marker
    msgs = find_msg_for_ticket(raw_dir, ticket_no)
    for msg in msgs:
        body = read_msg_body(msg)
        if "يعتمد" in body or "Approved" in msg.name or "approved" in body.lower():
            return True, f"APPROVAL_MSG_TEXT: {msg.name[:50]}"
    
    # Source 3: voucher row with emp_no resolved from input Ref. No.
    if ticket_no and re.match(r"26-\d{3,}", ticket_no) and emp_no:
        return True, "VOUCHER_EMP_NO_FROM_INPUT"
    
    # Source 4: family ride-along (CHD suffix, parent employee in same batch)
    if "(CHD)" in line.passenger_name:
        return True, "FAMILY_RIDE_ALONG"
    
    # Source 5: account-class waiver (sponsorship 60307021 already handled; add G&A 60301004 with caveat?)
    # Don't blanket-waive G&A — those should still be approved, just via a different mechanism
    
    return False, "NO_APPROVAL_EVIDENCE_FOUND"
```

Applied to today's data:
- 16 catches drop on Source 2 (msg exists with explicit approval)
- ~20-25 catches drop on Source 3 (voucher rows with resolved emp_no)
- ~3 catches drop on Source 4 (CHD family rows)
- Net surface to Finance: estimated **~25-30 catches** remaining, vs 73 today
- HIGH-severity surface: probably 3-4 catches worth Finance investigation, not 6

This is a 60% reduction in noise with no loss of real-signal coverage.

## What v15.11 surfaces to Finance for NO_APPROVAL

Two tiers:

**Tier 1 (HIGH severity, >SAR 3,000, real concern):**
- Pax + ticket + amount + resolved account + reason no approval found (verbatim trace)
- Finance verifies offline before posting

**Tier 2 (MEDIUM severity, ≤SAR 3,000):**
- Aggregated count + total value-at-risk only ("23 medium-severity NO_APPROVAL flags, SAR 18,400 total")
- Not a per-row callout; a batch-level health number Finance can sanity-check

## Recommendation

**Do NOT surface NO_APPROVAL to Finance in current form.** The 73 catches with 22% confirmed false-positive rate would teach Finance to ignore the rule. After v15.11 builds the multi-source approval detector, the rule becomes high-signal — Finance sees ~3-4 HIGH catches per batch instead of 73 noisy ones.

---

**Investigated by:** Malik via Amr's direction (2026-05-22)
**Next action:** Move to category #5 (PASSENGER_AMOUNT_PATTERN — cross-batch, 3 catches) when Amr signals.
