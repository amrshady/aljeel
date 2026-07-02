1. **Q1 - `_build_output_tsv()` rows 60-66**
   - `_build_output_tsv()` emits `gl_account` from `_val(row, "account")` first, then falls back to `portal[row_num]["account"]`.
   - For rows 60-66, the output XLSX has `Account` populated, so the TSV uses the XLSX value, not the portal fallback.
   - Portal JSON is **1-based**, with `row_idx` 1-100.

   Portal JSON rows 60-66:

   | row_idx | account | emp_no | row_status | qc_catches |
   |---:|---|---|---|---|
   | 60 | 60307021 | 1002091 | RED | NO_APPROVAL(HIGH) |
   | 61 | 60307021 | 1002091 | RED | NO_APPROVAL(MEDIUM) |
   | 62 | 60307021 | 1000995 | RED | NO_APPROVAL(HIGH) |
   | 63 | 60307021 | 1000995 | RED | NO_APPROVAL(MEDIUM) |
   | 64 | 60301003 | 1002308 | YELLOW | NO_APPROVAL(MEDIUM) |
   | 65 | 60301003 | 1000666 | YELLOW | NO_APPROVAL(MEDIUM) |
   | 66 | 60301003 | 1000320 | RED | NO_APPROVAL(MEDIUM) |

   Output XLSX sheet rows 63-69, data rows 60-66:
   - GL account code column is **`Account`**, normalized by QA as `account`.
   - There is no `gl_account` column.
   - `GL` is a text label column, not the account code column.
   - Rows 60-63 have `Account = 60307021`, while `GL = Travel Tickets Expense`. That is internally inconsistent.

2. **Q2 - `_load_excel_rows()` output behavior**
   - `_find_header_row()` identifies **sheet row 3** as the header row.
   - `_load_excel_rows()` returns 100 rows.
   - Data row 1 maps to sheet row 4.
   - Relevant normalized columns found:
     - `employee_no` from `Employee No`
     - `account` from `Account`
     - `gl` from `GL`
     - `cost_center`
     - `div`
     - `agency`
     - `distribution_combination`
   - It does **not** find `gl_account`, `emp_no`, or `natural_account`.

3. **Q3 - Portal JSON row alignment**
   - Portal `row_idx` is **1-based**.
   - Rows mentioning MOSTAFA AMER / SULTAN ABU DOGHMEH / Barcelona are portal rows 60-63.
   - `_load_excel_rows()` gives those same rows `_row_num` 60-63.
   - Therefore `p = portal.get(row_num, {})` **does find** the correct portal rows.
   - There is **no off-by-one bug** here.

4. **Q4 - Exact TSV sent to Gemini**

```text
=== INPUT TSV rows 55-70 ===
row_num	emp_no	passenger_name	ticket_id	route	amount_sar	ref_no
55	1000328	ABU ABED/IBRAHIM MR	6905533283	JED EAM JED	1735.01	J26-788
56	1000490	ELHAG/ALI ENG	6905533324	JED MED JED	1080.00	J26-788
57	1000453	KHADER/OMAR MR	6905533338	RUH JED RUH	1100.00	J26-788
58	1000596	ALHATO/ABDULHADI MR	6905533340	JED GIZ	1400.00	J26-788
59	1000596	ALHATO/ABDULHADI MR	6905533341	GIZ JED	400.00	J26-788
60		MOSTAFA AMER	26-731	Kimpton Vividora Barcelona - 1 NTS.	6300.00	J26-788
61		MOSTAFA AMER	26-732	Kimpton Vividora Barcelona - 1 NTS.	2650.00	J26-788
62		SULTAN ABU DOGHMEH	26-733	Kimpton Vividora Barcelona - 1 NTS.	6300.00	J26-788
63		SULTAN ABU DOGHMEH	26-734	Kimpton Vividora Barcelona - 1 NTS.	2650.00	J26-788
64	1002308	YOUSEF AL DIGHRIR	26-737	TRAIN SERVICE	265.00	J26-788
65	1000666	AMR BUKHARI	C5Q64Y	JED EAM JED	1220.00	J26-788
66	1000320	AYED ZEIADH	CDF5FD	RUH JED RUH	1025.00	J26-788
67	1000735	BABAKR/MOHAMMED MR	6905533352	RUH JED RUH	1115.01	J26-788
68	1000529	HADDAD/HAMZAH MR	6905533359	JED RUH	520.00	J26-788
69	1000259	KONDO/MBWANA HAMISI MR	6905569429	RUH DXB MBA DXB RUH	3850.00	J26-788

=== OUTPUT TSV rows 55-70 ===
row_num	emp_no	passenger_name	gl_account	cost_center	division	agency	color	flags	ai_fraud_verdict	ai_fraud_category
55	1000328	ABU ABED/IBRAHIM MR	60301003	250010	120	10206	YELLOW	DUP_ROUTE_STRICT(HIGH)	RED	AMOUNT_MISMATCH_EMAIL
56	1000490	ELHAG/ALI ENG	60301003	250010	120	10206	GREEN		YELLOW	AMOUNT_MISMATCH_EMAIL
57	1000453	KHADER/OMAR MR	60301003	160011	196	10200	RED		YELLOW	AMOUNT_MISMATCH_EMAIL
58	1000596	ALHATO/ABDULHADI MR	60301003	160011	196	10052	RED		CLEAN	NONE
59	1000596	ALHATO/ABDULHADI MR	60301003	160011	196	10052	YELLOW	NO_APPROVAL(MEDIUM)	CLEAN	NONE
60	1002091	MOSTAFA AMER	60307021	160012	194	10200	RED	NO_APPROVAL(HIGH)	CLEAN	NONE
61	1002091	MOSTAFA AMER	60307021	160012	194	10200	RED	NO_APPROVAL(MEDIUM)	CLEAN	NONE
62	1000995	SULTAN ABU DOGHMEH	60307021	160012	194	10200	RED	NO_APPROVAL(HIGH)	CLEAN	NONE
63	1000995	SULTAN ABU DOGHMEH	60307021	160012	194	10200	RED	NO_APPROVAL(MEDIUM)	CLEAN	NONE
64	1002308	YOUSEF AL DIGHRIR	60301003	250010	120	10206	YELLOW	NO_APPROVAL(MEDIUM)	CLEAN	NONE
65	1000666	AMR BUKHARI	60301003	250010	120	10206	YELLOW	NO_APPROVAL(MEDIUM)	CLEAN	NONE
66	1000320	AYED ZEIADH	60301003	160011	196	10055	RED	NO_APPROVAL(MEDIUM)	CLEAN	NONE
67	1000735	BABAKR/MOHAMMED MR	60301003	160012	194	10153	RED		CLEAN	NONE
68	1000529	HADDAD/HAMZAH MR	60301003	160011	196	10055	RED		RED	AMOUNT_MISMATCH_EMAIL
69	1000575	KONDO/MBWANA HAMISI MR	21070229	130010	888	88888	RED		RED	AMOUNT_MISMATCH_EMAIL
```

5. **Q5 - Root Cause Summary**
   - `_build_output_tsv()` does **not** leave `gl_account` blank for rows 60-66.
   - Rows 60-63 are sent to Gemini with `gl_account = 60307021` and resolved employee numbers.
   - This is not caused by off-by-one indexing, missing portal rows, or wrong QA column lookup.
   - Actual GL account code according to both the output XLSX `Account` column and portal JSON `account` is:
     - rows 60-63: `60307021`
     - rows 64-66: `60301003`
   - The confusing part is that rows 60-63 also have `GL = Travel Tickets Expense` and `GL Description = Travel Tickets Expense ...`, while the natural account code is `60307021`, which the QA rules define as Sponsoring Expenses.

**Verdict:** QA report findings for rows 60-63 are **valid / not hallucinated** because Gemini was explicitly given `gl_account = 60307021` with resolved employee numbers for those rows. The audit did not invent that from blank data; it came directly from the output TSV.

[status: done rc=0]
