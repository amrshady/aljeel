**Read-Only Report**

No files were edited or deployed.

**Verdict Counts**
`LABADI_CORRECT`: 58  
`WE_CORRECT`: 2  
`AMBIGUOUS`: 1

**Evidence Legend**
`E1`: Omar Abu Noufal PC email + ticket PDF, `16jun/6906462485`, tickets `6906462485/486`, emp `1002345`, Hail business trip.  
`E2`: Baassiri/Khadouj contamination: Khadouj family evidence belongs to Saleem Khadouj Awada `1000378`, not Baassiri `1000820`.  
`E3`: Lama Aljundi annual leave email + ticket PDF, `17jun/6906462559`; master says `120010/888/88888`.  
`E4`: Iyad Mowafi PC annual-ticket email + ticket PDF, `17jun/6906462571`; master says `130010/888/88888`.  
`E5`: `OPEX-SIS-15-2026-J-2026-122.pdf`: Agency `ERBE`, DIV `SIS`, Solution `GI`, salesmen `1001422/1002169/1001530`.  
`E6`: `OPEX-SIS-14-2026-J-2026-123.pdf`: Agency `Fujifilm`, same three salesmen.  
`E7`: `OPEX-CRM-2026-39-J-2026-121.pdf`: ABBOTT, Contribution, CRM, salesmen `1002317/1001959/1002119`, includes ticket/hotel/transport.  
`E8`: `OPEX-LAB-16-2026J-2026-126.pdf` OCR: Bio-Rad QC Workshop, attendees, allocation to `1000862/1002144/1001059/1000414/1001256`, agency Bio-Rad.  
`E9`: Ebaa/Omar Qassim PC approvals + shared ticket PDF, `21jun/4860132108-09`.  
`E10`: Ahmed Alem ticket PDF + PC approval, `22jun/593-4860132149`; no training/OPEX evidence found.  
`E11`: Saleem Khadouj Awada family PC email + PDF, `22jun/4860132173 family`; Annual Ticket Request, `Employee Included Yes`, tickets `4860132173-2176`, master `160011/196/10081`.  
`E12`: Muhanad Sdek family PC email + PDF, `23jun/4860165152 family`; Annual Ticket Request, tickets `4860165152-5159`, master `160013/192/10202`.  
`E13`: EP-2026-17 Abha email chain says approved supplier-led OPEX, but the folder lacks the OPEX PDF; exact combo not independently confirmable.

**Adjudication Table**

| Rows | Tickets / Description | Verdict | Evidence / Segment Decision |
|---:|---|---|---|
| 0 | `6906462486` Abo Noufal/Omar | LABADI_CORRECT | E1 supports business travel `60301003` and master segments `160012/194/10126`; our split/no-match is wrong. |
| 1 | `6906462532` Baassiri/Mohamad | LABADI_CORRECT | E2 supports Labadi’s reversal to business/event travel; our `21070229` came from a phantom Khadouj CHD match. |
| 2 | `6906462559` Lama Aljundi | LABADI_CORRECT | E3 supports `21070229` with employee home segments; our annual-ticket zeroing lost CC/DIV/agency. |
| 3 | `6906462571` Iyad Mowafi | LABADI_CORRECT | E4 supports `21070229` with home segments; our zeroing is wrong. |
| 4-15 | `6906495717/5718/5724/5725`, SIS-15 doctors | LABADI_CORRECT | E5 says agency ERBE `10043`; our split re-derived salesman home agencies `10041/10156`. |
| 16-21 | CRM-39 Rania ancillary pickup/dropoff/hotel | LABADI_CORRECT | E7 includes transportation/hotel under CRM-39 sponsorship; our missing-evidence/no-match blanking is wrong. |
| 22-23 | LAB-16 Albunayan/Albandar | LABADI_CORRECT | E8 says Bio-Rad agency `10111`; our agency `10126/88888` is wrong. |
| 24-28 | LAB-16 Rahaf/Yaser/Hashim/Hana tickets | LABADI_CORRECT | E8 supports LAB-16 allocation rows and Bio-Rad agency; our no-match is wrong. |
| 29-31 | `4860132100/2102/2104` SIS-14 Alqifari | LABADI_CORRECT | E6 says Fujifilm `10041`; our `1002169` split row used NUBOMED `10156`. |
| 32-33 | `4860132108/2109` Ebaa/Omar | LABADI_CORRECT | E9 supports business travel with Steris segments `160011/196/10055`; our diff no-match is wrong. |
| 34-36 | CRM-39 Mustafa hotel | LABADI_CORRECT | E7 includes hotel under CRM-39 sponsorship; our no-match is wrong. |
| 37-38 | `4860132149/2150` Ahmed Alem | WE_CORRECT | E10 supports PC/business travel `60301003`; I found no training evidence for Labadi’s `60308009`. This is a Labadi over-correction. |
| 39-42 | `4860132173-2176` Khadouj family | LABADI_CORRECT | E11 supports annual-ticket family rows on Saleem `1000378`, segments `160011/196/10081`; our rows were zeroed or contaminated by unrelated emp IDs. |
| 43-50 | `4860165152-5159` Sdek family | LABADI_CORRECT | E12 supports annual-ticket family rows on Muhanad `1001105`, segments `160013/192/10202`; our zeroing/888 segments are wrong. |
| 51 | `4860165204` EP-2026-17 Bandar Alghamdi | AMBIGUOUS | E13 proves an approved EP-2026-17 OPEX email chain, but the actual OPEX PDF is missing, so exact Labadi combo cannot be source-verified. Our no-match is also not acceptable. |
| 52 | `4860165223` Nawaf Almutairi SIS-14 | LABADI_CORRECT | E6 supports Fujifilm `10041`; our `1002169` row carried NUBOMED `10156`. |
| 53-55 | `4860165225` Nawaf Almutairi SIS-15/SIS-14 | LABADI_CORRECT | Description and E5 support SIS-15/ERBE `10043` allocation for these legs; our split stage re-derived home agencies. |
| 56-60 | LAB-16 combined ancillary rows | LABADI_CORRECT | E8 supports Bio-Rad allocation rows; our missing-evidence/no-match blanking is wrong. |

**Root Causes And Structural Fix Plan**

1. **CHD/Family Emp Contamination**
File/function: [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2154) `collect_family_annual_rows`, plus bundled/shared evidence mapping around [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1705).  
Mechanism: CHD rows can inherit an unrelated emp_no through shared PDF/OPEX folder matching, then `chd_empno_group:<emp>` flips unrelated adults to `21070229`.  
Structural fix: CHD-to-employee grouping must require same booking PNR or same family folder and surname-compatible family tokens before emp grouping is allowed.  
Validation: Khadouj children stay with Saleem `1000378`; Baassiri remains `60301003`.

2. **Annual-Ticket Segment Zeroing**
File/function: [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:2201) `apply_family_annual_account_rule`.  
Mechanism: `21070229` rows with verified emp locks or missing allocation state can keep `000000/000/88888` instead of home segments.  
Structural fix: every `21070229` row with a verified owner emp must stamp owner home cost center, DIV, and agency; only solution stays annual/general per accounting policy.  
Validation: Lama, Mowafi, Khadouj, Sdek all retain home CC/DIV/agency.

3. **Sponsorship Split Re-Derives From Manpower**
File/function: [scripts/split_multi_emp.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/split_multi_emp.py:239).  
Mechanism: split rows always re-derive location/CC/DIV/solution/agency from each employee’s manpower record, clobbering OPEX event agency such as ERBE, Fujifilm, Bio-Rad.  
Structural fix: for sponsorship/OPEX rows, split amount by listed salesmen but preserve form/event segments unless the form segment is absent.  
Validation: SIS-15 all split rows agency `10043`; SIS-14 `10041`; LAB-16 `10111`.

4. **Ancillary / Ground Transport Missing-Evidence Gate**
File/function: [scripts/process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:1819), [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:671).  
Mechanism: no-ticket hotel/transport rows fail folder matching and are left `<no-match>` even when serial text links them to an OPEX form.  
Structural fix: build a per-batch event allocation index keyed by OPEX serial, folder, attendees, and expense types; ancillary rows inherit account/segments by serial and attendee/event link.  
Validation: CRM-39 and LAB-16 hotel/transport rows resolve from their OPEX serials.

5. **Training Over-Correction Risk**
File/function: trip override enforcement at [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:3440).  
Mechanism: training account can be asserted without strong event/form evidence.  
Structural fix: require explicit training evidence in the row’s own approval/OPEX/form context before `60308009`; PC business trip emails should remain `60301003`.  
Validation: Ahmed Alem `4860132149/2150` stays `60301003`.

6. **OPEX Evidence Completeness**
File/function: event folder resolution [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:671).  
Mechanism: email-only OPEX references can imply sponsorship but cannot verify exact event segments if the OPEX PDF is absent.  
Structural fix: introduce a confidence state: `OPEX_EMAIL_ONLY` may classify likely sponsorship, but exact segment stamping requires parsed OPEX PDF or a structured approved attachment.  
Validation: EP-2026-17 is flagged human-review unless its OPEX form is present.

**Hardcoding Statement**

None of these proposals use hardcoded ticket numbers, employee IDs, names, allowlists, per-row overrides, or magic constants. Each fix is a general structural rule driven by source evidence relationships: OPEX form fields, approval emails, ticket PDFs, booking/folder linkage, and manpower master records.
