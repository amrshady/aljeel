I now have everything needed. The data is unambiguous across all sources. Here are the findings.

---

# READ-ONLY AUDIT FINDINGS — QA Agent Input Investigation (J26-788)

## Q1 — What `_build_output_tsv()` emits for rows 60-66

The output xlsx **`Spreadsheet-J26-788-FILLED-v30.xlsx`** (the file `_output_spreadsheet_path` actually selected) populates the GL columns. Raw values from `_load_excel_rows()`:

| _row_num | excel_row | `account` (natural acct) | `gl` (text label) | `employee_no` | description |
|---|---|---|---|---|---|
| 60 | 63 | **60307021** | Travel Tickets Expense | 1002091 | MOSTAFA AMER – Kimpton Vividora Barcelona – 1 NTS |
| 61 | 64 | **60307021** | Travel Tickets Expense | 1002091 | MOSTAFA AMER – Kimpton Vividora Barcelona – 1 NTS |
| 62 | 65 | **60307021** | Travel Tickets Expense | 1000995 | SULTAN ABU DOGHMEH – Kimpton Vividora Barcelona |
| 63 | 66 | **60307021** | Travel Tickets Expense | 1000995 | SULTAN ABU DOGHMEH – Kimpton Vividora Barcelona |
| 64-66 | 67-69 | 60301003 | Travel Tickets Expense | 1002308 / 1000666 / 1000320 | (normal flights) |

1. The GL account column is named **`Account`** (raw) → normalized **`account`**. There is a separate `GL` column that holds a *text label* ("Travel Tickets Expense"), not a number.
2. `_val(row, "account")` resolves the **`account`** column as its **primary** source — the portal lookup is only a fallback. So GL is taken straight from the xlsx.
3. Columns are **populated, not blank**. Rows 60-63 genuinely carry `account = 60307021`.
4. Portal JSON `row_idx` is **1-based** (keys run 1…100, exactly matching `_row_num`).

## Q2 — What `_load_excel_rows()` returns for the OUTPUT file

1. `_find_header_row()` identifies **row 3** (1-based) as the header — correct.
2. It extracts all 69 columns. Relevant normalized names present: **`account`**, **`gl`**, **`employee_no`**, `cost_center`, `div`, `agency`, `row_status`, `qc_catches`.
3. The Oracle raw headers (`*Natural Account`-style) normalize cleanly: `Account`→`account`, `Employee No`→`employee_no`, `Cost Center`→`cost_center`, `DIV`→`div`. **No column-name mismatch.** `_val(row,"account")` and `_val(row,"employee_no","emp_no")` both hit real columns.

## Q3 — Portal JSON row-index alignment

1. `row_idx` for the flagged rows: MOSTAFA AMER = **60, 61**; SULTAN ABU DOGHMEH = **62, 63** (Barcelona/Kimpton).
2. `row_idx` is **1-based**, and `_load_excel_rows()` `_row_num` is also **1-based**. They align perfectly.
3. `p = portal.get(row_num, {})` **does find** these rows — no off-by-one, `p` is **not** `{}`. Portal for row_idx 60-63 independently reports `account = 60307021`, `emp_no = 1002091 / 1000995`, `row_status = RED`, `qc_catches = NO_APPROVAL`.

**Both independent sources (output xlsx `account` column AND portal JSON `account`) agree on 60307021.** Even if the portal fallback never fired, the xlsx primary already supplies 60307021.

## Q4 — Exact TSV Gemini received (rows 55-70)

**INPUT TSV** (note rows 60-63 have **blank emp_no** and route = Barcelona hotel, amounts 6300/2650):
```
row_num	emp_no	passenger_name	ticket_id	route	amount_sar	ref_no
60		MOSTAFA AMER	26-731	Kimpton Vividora Barcelona - 1 NTS.	6300.00	J26-788
61		MOSTAFA AMER	26-732	Kimpton Vividora Barcelona - 1 NTS.	2650.00	J26-788
62		SULTAN ABU DOGHMEH	26-733	Kimpton Vividora Barcelona - 1 NTS.	6300.00	J26-788
63		SULTAN ABU DOGHMEH	26-734	Kimpton Vividora Barcelona - 1 NTS.	2650.00	J26-788
```

**OUTPUT TSV** (the `gl_account` column **is populated** with 60307021 and emp_no is resolved):
```
row_num	emp_no	passenger_name	gl_account	cost_center	division	agency	color	flags	ai_fraud_verdict	ai_fraud_category
58	1000596	ALHATO/ABDULHADI MR	60301003	160011	196	10052	RED		CLEAN	NONE
59	1000596	ALHATO/ABDULHADI MR	60301003	160011	196	10052	YELLOW	NO_APPROVAL(MEDIUM)	CLEAN	NONE
60	1002091	MOSTAFA AMER	60307021	160012	194	10200	RED	NO_APPROVAL(HIGH)	CLEAN	NONE
61	1002091	MOSTAFA AMER	60307021	160012	194	10200	RED	NO_APPROVAL(MEDIUM)	CLEAN	NONE
62	1000995	SULTAN ABU DOGHMEH	60307021	160012	194	10200	RED	NO_APPROVAL(HIGH)	CLEAN	NONE
63	1000995	SULTAN ABU DOGHMEH	60307021	160012	194	10200	RED	NO_APPROVAL(MEDIUM)	CLEAN	NONE
64	1002308	YOUSEF AL DIGHRIR	60301003	250010	120	10206	YELLOW	NO_APPROVAL(MEDIUM)	CLEAN	NONE
```

## Q5 — Root cause summary

1. **`_build_output_tsv()` correctly populates `gl_account` for rows 60-66.** For rows 60-63 it emits **60307021**; for 64-66 it emits 60301003. **Not blank.**
2. **There is no data-assembly bug.** No off-by-one (row_idx and _row_num are both 1-based and aligned), no wrong column name (`account`/`employee_no` resolve), portal JSON contains those rows. The hypothesized failure modes are all disproven.
3. Gemini **did** receive real GL data for those rows. The "60307021 with resolved employee numbers" claim is **read directly from the assembled TSV**, not inferred or hallucinated.
4. **Actual GL for rows 60-66 per both the output xlsx `account` column and the portal JSON:** rows 60-63 = **60307021**; rows 64-66 = **60301003**.

---

## VERDICT

**QA report findings for rows 60-63 are VALID (data-grounded), not hallucinated — because the assembled OUTPUT TSV that Gemini received explicitly contains `gl_account = 60307021` with resolved `emp_no` 1002091/1000995 for those rows, sourced directly and correctly from the output xlsx `account` column (and independently corroborated by the portal JSON at the correctly-aligned 1-based `row_idx`). There is no off-by-one, no wrong-column, and no blank-GL data-assembly bug.**

### Important nuance the audit should not miss
The user's belief that "the output file has the correct allocations (travel ticket expense, right GL)" appears to come from reading the **`GL` text-label column**, which literally says *"Travel Tickets Expense"* on all these rows. But the **actual posting account number (`Account` column) is 60307021**, which per `GL_RULES` is **"Sponsoring Expenses (external parties, emp_no must be blank)"** — not 60301003 (Travel Tickets). So the output file is **internally inconsistent on rows 60-63**:

- `account = 60307021` (Sponsoring) **vs.** `gl` label = "Travel Tickets Expense"
- 60307021 rule requires **blank emp_no**, yet emp_no is **resolved** (1002091, 1000995)
- Input rows 60-63 are **hotel stays** (Kimpton Vividora Barcelona, "1 NTS"), with **blank emp_no in the input** — i.e. genuinely ambiguous source data

So the QA agent flagged a **real discrepancy that exists in the output file**, not a phantom one. The disagreement between the QA report and the user is a genuine substantive question about whether 60307021 is the right account for these Barcelona hotel rows — it is **not** explained away by a data-feeding bug. If anyone changes the pipeline based on "the report is wrong because of bad input data," that premise is false.

(No files were edited.)

[status: done rc=0]
