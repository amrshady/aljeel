#!/usr/bin/env python3
"""
Report Generator for J26-788 Deep Audit
Reads the audited findings from J26-788-audit-findings.json and generates
a comprehensive, highly professional Markdown report.
"""
import json
from pathlib import Path

WORKSPACE = Path("/home/clawdbot/.openclaw/workspace")
FINDINGS_PATH = WORKSPACE / "aljeel/qc/reports/J26-788-audit-findings.json"
REPORT_PATH = WORKSPACE / "aljeel/qc/reports/J26-788-deep-reasoning-audit.md"

def generate_report():
    with open(FINDINGS_PATH) as f:
        data = json.load(f)
        
    total = data["total_rows"]
    verified = data["verified_rows"]
    challenged = data["challenged_rows"]
    challenges = data["challenges"]
    
    # Analyze severity of challenges
    severity_counter = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0}
    type_counter = {}
    for c in challenges:
        for f in c["findings"]:
            t = f["type"]
            sev = f["severity"]
            severity_counter[sev] = severity_counter.get(sev, 0) + 1
            type_counter[t] = type_counter.get(t, 0) + 1
            
    # Start building the report
    md = []
    md.append("# AlJeel Medical Accounts Payable Audit Report - Jawwal J26-788 Batch")
    md.append("\n**Report Generated:** June 7, 2026")
    md.append("\n**Auditor:** Accounts Payable Deep Reasoning Auditing Subagent")
    md.append("\n**Audit Scope:** Jawwal Travel Invoice J26-788 (103 entries, total amount ~ SAR 385K)")
    md.append("\n**Target Spreadsheet:** `/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-788/output/Spreadsheet-J26-788-FILLED-v30_11.xlsx`")
    
    md.append("\n## 1. Executive Summary")
    md.append("\nA meticulous, file-by-file independent challenge and review of all **103 Accounts Payable (AP) entries** has been conducted against AlJeel's official Manpower roster (`Aljeel_Lookups-v2.xlsx`), raw email evidence (`.msg` files), and AI-driven fraud anomaly results. The audit has uncovered significant procedural issues, internal control gaps, name-matching mismatches, and data corruptions that must be addressed by human reviewers before batch posting.")
    
    md.append("\n### Key Audit Statistics")
    md.append("\n| Metric | Count | Percentage | Description |")
    md.append("| :--- | :---: | :---: | :--- |")
    md.append(f"| **Total AP Rows Audited** | **{total}** | **100.0%** | All rows processed in the Jawwal template |")
    md.append(f"| **Verified Rows (Clean)** | **{verified}** | **{verified/total*100:.1f}%** | Rows that fully matched master data and had valid approval |")
    md.append(f"| **Challenged Rows (Anomalies)** | **{challenged}** | **{challenged/total*100:.1f}%** | Rows flagged with one or more audit discrepancies |")
    
    md.append("\n### Findings by Severity")
    md.append("\n| Severity Level | Flags Count | Impact / Audit Verdict |")
    md.append("| :--- | :---: | :--- |")
    md.append(f"| 🟥 **CRITICAL** | **{severity_counter.get('CRITICAL', 0)}** | Hard stops: Self-approvals, corrupt emails, or wrong sponsorship routing |")
    md.append(f"| 🟧 **HIGH** | **{severity_counter.get('HIGH', 0)}** | Significant concerns: Name mismatches, missing emails, or missing employee IDs |")
    md.append(f"| 🟨 **MEDIUM** | **{severity_counter.get('MEDIUM', 0)}** | Process warning: Outdated manpower status or segment-code misalignments |")
    
    md.append("\n### Findings by Category")
    md.append("\n| Finding Category | Flags Count | Description |")
    md.append("| :--- | :---: | :--- |")
    md.append(f"| `SPONSORSHIP_CC_MISMATCH` | {type_counter.get('SPONSORSHIP_CC_MISMATCH', 0)} | Sponsorship rows mapped to incorrect cost centers / agencies |")
    md.append(f"| `PASSENGER_NAME_MISMATCH` | {type_counter.get('PASSENGER_NAME_MISMATCH', 0)} | Mismatch on name tokens between GDS and Master (>1 token mismatch) |")
    md.append(f"| `APPROVAL_EMAIL_MISSING` | {type_counter.get('APPROVAL_EMAIL_MISSING', 0)} | Supporting approval email is absent from the evidence folder |")
    md.append(f"| `APPROVAL_EMAIL_CORRUPT` | {type_counter.get('APPROVAL_EMAIL_CORRUPT', 0)} | Supporting email exists but is a 0-byte corrupt file |")
    md.append(f"| `SELF_APPROVAL` | {type_counter.get('SELF_APPROVAL', 0)} | Employee approved their own personal travel/hotel room |")
    md.append(f"| `MANPOWER_NEED_ALLOCATE` | {type_counter.get('MANPOWER_NEED_ALLOCATE', 0)} | Matched employee is flagged 'Need to allocate' by HR/Finance |")
    md.append(f"| `EMPLOYEE_NO_MISSING` | {type_counter.get('EMPLOYEE_NO_MISSING', 0)} | Employee row has no employee ID but uses standard travel account |")
    md.append(f"| `ACCOUNT_DIVISION_MISMATCH` | {type_counter.get('ACCOUNT_DIVISION_MISMATCH', 0)} | Wrong account used relative to employee division (G&A vs Business) |")
    md.append(f"| `AI_FRAUD_DUPLICATE_BILLING` | {type_counter.get('AI_FRAUD_DUPLICATE_BILLING', 0)} | AI detected duplicate billings on same passenger/route |")
    md.append(f"| `AI_FRAUD_APPROVAL_INVALID` | {type_counter.get('AI_FRAUD_APPROVAL_INVALID', 0)} | AI detected approval from unauthorized delegates or non-managers |")
    md.append(f"| `COST_CENTER_MISMATCH` | {type_counter.get('COST_CENTER_MISMATCH', 0)} | Row cost center differs from employee home cost center |")
    
    md.append("\n## 2. Key Systemic Discrepancies")
    
    md.append("\n### Systemic Finding 1: Stale Manpower Master Data & Delegate Approvals")
    md.append("Multiple rows show discrepancies between the line managers listed in `Aljeel_Lookups-v2.xlsx` and the actual approvers of Oracle workflow emails. For example, **Mbwana Hamisi Kondo (1000575)** is managed by *Laith Omar Jaradat* according to master lookups, but his Personal Contribution was approved via Oracle workflow by *Sanad F. Al Shammari*. Mohammed Labadi (AP Supervisor) has flagged these as stale master data issues. This confirms that the current local master data sheet has not been synchronized with Oracle Cloud's live manager hierarchies, leading to automated mismatch alerts.")
    
    md.append("\n### Systemic Finding 2: Tribal & Compound Name Truncation Bug in Matching Engine")
    md.append("The matching engine suffers from a compound-name matching bug. In `employee_resolver_v2.py`, article stripping (removing prefixes like `AL-` or `EL-`) runs *before* the transliteration mapping of tribal and GDS names. For example, the passenger name **ALANAZI/FARHAN MR** has the `AL-` prefix stripped first, becoming `ANAZI`, while the master name **Farhan Modhsher Ameq Alenazy** has `AL-` stripped to become `ENAZY`. Because `ANAZI` and `ENAZY` do not match, the system flags a false name mismatch. Similar issues occur for names like **ALHAJJ**, **ALFAR**, and **ALHATO**. The matching engine needs to apply transliteration mapping *prior* to article stripping to avoid compound-name mismatches.")
    
    md.append("\n### Systemic Finding 3: Self-Approvals and Lack of Manager Oversight")
    md.append("The audit detected several critical internal control violations. In the Barcelona hotel bookings (**Sultan Abu Doghmeh row 65/66**, and **Mostafa Amer row 62/63**), employees requested and self-approved their own bookings via Personal Contribution emails without any manager co-signature. Similarly, the **Saleh Family (rows 21-23)** bookings show Hussein Saleh approving his own family's ticket requests. AP should reject any personal contribution bookings that do not carry an explicit line manager or HR co-approval.")
    
    md.append("\n### Systemic Finding 4: 0-Byte Corrupt Approval Files")
    md.append("Multiple folders in the raw directories contain `.msg` files that are **0 bytes** in size (completely empty), such as **Mariam Saleh (row 21)**, **Mohammed Babakr (row 28)**, and **Abdel Hadi Alhato (row 61)**. Because the approval files are 0 bytes, the pipeline cannot parse them, causing them to fall back to general/incorrect employee assignments or fail validation. This points to a systemic failure in the file-download or OneDrive/Google Drive extraction pipeline, where files were created as placeholders but not transferred.")
    
    md.append("\n### Systemic Finding 5: Saleh Albasiri Sponsorship Mismatch (Row 8)")
    md.append("The passenger **Saleh Albasiri (ticket 6905428831)** was traveling under Electrophysiology Abbott contribution (`IEPC AF  EP-2026-16`). In pipeline versions `v26` through `v29`, he was correctly mapped to cost center `160014` (EP/Contribution/Abbott) and Division `170`. However, in `v30_11`, he reverted back to `160013` (Ansell/DMS) and Division `192`. This occurred because the `v30` pipeline uses cached LLM results by default, clobbering the `v26` Fix D code, and the `v26_nts_pc_overlay` was disabled. He must be manually corrected to Abbott/EP.")
    
    md.append("\n### Systemic Finding 6: Duplicate Billings on Najran Route")
    md.append("The passenger **Ibrahim Abu Abed (Employee 1000328)** has two separate tickets billed on the same invoice for the exact same route **JED-EAM-JED** (Jeddah to Najran) on consecutive days: **ticket 6905495665 (Row 47, May 4, SAR 1830)** and **ticket 690533283 (Row 58, May 5, SAR 1735.01)**. Both are personal contribution requests. Human reviewers must confirm if this is a double-pay error or an expected rebooking due to travel changes.")
    
    md.append("\n## 3. Row-by-Row Challenge Breakdown")
    md.append("\nBelow is the detailed list of every single challenged row in the spreadsheet. AP reviewers must action each recommendation before final template submission.")
    
    md.append("\n| Row | Passenger Name | Invoice Desc | Amount (SAR) | Current GL Code | Current Emp | Severity | Discrepancies & Findings | AP Action / Recommendation |")
    md.append("| :---: | :--- | :--- | :---: | :--- | :---: | :---: | :--- | :--- |")
    
    # Sort challenges by excel row number
    sorted_challenges = sorted(challenges, key=lambda x: x["excel_row"])
    
    for c in sorted_challenges:
        r_num = c["excel_row"]
        pax = c["passenger"]
        desc_short = (c["description"] or "")[:50]
        amount = c["amount"]
        acct = c["acct"]
        emp = c["emp_no"] if c["emp_no"] else "None"
        
        # Combine findings
        finding_strs = []
        highest_severity = "MEDIUM"
        for f in c["findings"]:
            finding_strs.append(f"{f['type']}: {f['detail']}")
            if f["severity"] == "CRITICAL":
                highest_severity = "CRITICAL"
            elif f["severity"] == "HIGH" and highest_severity != "CRITICAL":
                highest_severity = "HIGH"
                
        finding_bullets = "<br>• ".join(finding_strs)
        finding_bullets = "• " + finding_bullets
        
        # Dynamic Action/Recommendation based on types
        types = [f["type"] for f in c["findings"]]
        actions = []
        if "SPONSORSHIP_CC_MISMATCH" in types:
            actions.append("Manually change cost center to 160014, Division to 170, and Agency to 10072 (EP/Abbott).")
        if "PASSENGER_NAME_MISMATCH" in types:
            if "BABAKR" in pax.upper():
                actions.append("Correct Employee No to 1000735 (Mohammed Babiker Idris Babiker) and map to DIV 194 / CC 160012 / Agency 10153.")
            elif "ALANAZI" in pax.upper():
                actions.append("Verify matching employee 1000407 (Farhan Alenazy). False positive due to tribal name AL- prefix strip.")
            else:
                actions.append("Re-verify passenger identity against master list. Possible mis-assignment.")
        if "APPROVAL_EMAIL_MISSING" in types:
            actions.append("Request the traveler to provide their standard approved Oracle/Workday travel form.")
        if "APPROVAL_EMAIL_CORRUPT" in types:
            actions.append("The .msg file in raw directory is 0 KB. Ask the IT team/traveler for a fresh copy of the email.")
        if "SELF_APPROVAL" in types or "AI_FRAUD_APPROVAL_INVALID" in types:
            actions.append("Reject self-approved booking. Obtain co-signature or approval from authorized manager (e.g. Qasim or Laith).")
        if "MANPOWER_NEED_ALLOCATE" in types:
            actions.append("Employee marked 'Need to allocate' by HR. Confirm correct active Cost Center with HR/Finance before posting.")
        if "ACCOUNT_DIVISION_MISMATCH" in types:
            actions.append("Correct account code: G&A employee travel must be G&A 60301004; Business travel must be Business 60301003.")
        if "EMPLOYEE_NO_MISSING" in types:
            actions.append("Assign correct Employee No or reclassify to 60307021 (Sponsoring) if guest.")
        if "AI_FRAUD_DUPLICATE_BILLING" in types:
            actions.append("Investigate consecutive bookings on same route JED-EAM-JED. Confirm if one is cancelled or if both are valid.")
            
        if not actions:
            actions.append("Confirm details with traveler / line manager.")
            
        action_str = " ".join(actions)
        
        # Color coding for severity
        sev_icon = "🟥" if highest_severity == "CRITICAL" else ("🟧" if highest_severity == "HIGH" else "🟨")
        
        md.append(f"| {r_num} | {pax} | {desc_short} | {amount} | {acct} | {emp} | {sev_icon} **{highest_severity}** | {finding_bullets} | {action_str} |")
        
    md.append("\n## 4. Actionable Next Steps & Human Review Checklist")
    md.append("\nTo finalize this AP batch for posting into Oracle Fusion, the human AP team must complete the following actions:")
    md.append("\n- [ ] **Step 1: Albasiri Correction (Row 8)** - Manually edit row 8 to Abbott EP segments (`DIV 170 / CC 160014 / Agency 10072`) and assign Account `60307021`.")
    md.append("\n- [ ] **Step 2: Babakr Correction (Rows 28, 29, 70)** - Correct the Employee No to `1000735` (Mohammed Babiker Idris Babiker) instead of Ashraf Saad (`1000030`), and set CC to `160012` (IVD).")
    md.append("\n- [ ] **Step 3: G&A Account Corrections** - Check Kondo (Row 72) and other G&A employees. Ensure they are mapped to standard G&A travel `60301004` unless they are personal contribution.")
    md.append("\n- [ ] **Step 4: Resolve Self-Approvals** - Hold row 65/66 (Sultan Abu Doghmeh) and 62/63 (Mostafa Amer) until an email co-signature is provided by an authorized manager.")
    md.append("\n- [ ] **Step 5: Replace 0-Byte Corruptmsg files** - Obtain fresh, non-corrupt `.msg` files for Mariam Saleh (Row 21) and Husam Alhato (Row 61) to confirm approvals.")
    md.append("\n- [ ] **Step 6: Update HR Manpower Master List** - Request Qasim Mohammad to export a fresh Oracle Manpower file to resolve the 26 'Need to allocate' warnings.")
    
    # Save the report
    with open(REPORT_PATH, "w") as f:
        f.write("\n".join(md))
        
    print(f"[Deep AP Audit] Beautiful Markdown Report generated at {REPORT_PATH}", flush=True)

if __name__ == "__main__":
    generate_report()
