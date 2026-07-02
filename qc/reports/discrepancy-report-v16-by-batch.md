# AlJeel AP v16 — Discrepancy Report by Batch

**Generated:** 2026-05-27  |  **Pipeline:** v16  |  **Scope:** J26-550 / J26-589 / J26-593 / J26-640

## Score Summary

| Batch | Period | Rows | All-5 Exact | Remaining gaps |
|---|---|---|---|---|
| **J26-550** | Apr 1-7 2026 | 72 | **61/72 (84.7%)** | 20 field mismatches |
| **J26-589** | Apr 8-15 2026 | 129 | **98/129 (76.0%)** | 50 field mismatches |
| **J26-593** | Apr 16-23 2026 | 160 | **130/160 (81.2%)** | 85 field mismatches |
| **J26-640** | Apr 24-30 2026 | 117 | **117/117 (100.0%)** | 0 field mismatches |

---

## J26-550 — Apr 1-7 2026

**Score:** 61/72 = 84.7% all-5 exact

### 6904732429 — HUSSEIN/TALIA MS(CHD)
- **Route/Description:** RUH JED HBE RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `21070229` — Personal Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6904732430 — HUSSEIN/YOUSSEF MR
- **Route/Description:** RUH JED HBE RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `21070229` — Personal Contribution |
  | Agency | `10206` — Technical Services | `10239` — J&J |
  | Cost Center | `250010` — Technical Services HO | `160014` — Contribution new |
  | DIV | `120` — Technical Services | `170` — Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6904732431 — SALEM/EFFAT MRS
- **Route/Description:** RUH JED HBE RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `21070229` — Personal Contribution |
  | Agency | `10206` — Technical Services | `10239` — J&J |
  | Cost Center | `250010` — Technical Services HO | `160014` — Contribution new |
  | DIV | `120` — Technical Services | `170` — Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6904732451 — KHADER/OMAR MR
- **Route/Description:** RUH JED RUH
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10200` — S&M | `10055` — Steris |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6904763668 — ALEJO/JOE MARIE MR
- **Route/Description:** DMM MNL
- **OPEX ref:** خروج نهائي
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301004` — G&A Travel | `21070229` — Personal Contribution |
  | Agency | `88888` — G&A | `10206` — Technical Services |
  | Cost Center | `150020` — Admin | `250010` — Technical Services HO |
  | DIV | `888` — G&A | `120` — Technical Services |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6904823462 — ALTAIR/MOHAMMED MR
- **Route/Description:** RUH DOH PVG DOH RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301004` — G&A Travel | `60301003` — Travel Tickets |
  > **Root cause:** Account classification mismatch.

### 6904823513 — ELAZHARY/MOHAMED MR
- **Route/Description:** CAI RUH
- **OPEX ref:** new employee
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Cost Center | `150020` — Admin | `170020` — Strategy |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6904856041 — BIN MUDHIAN/FAISAL MR
- **Route/Description:** RUH IST LYS IST RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `60308009` — Other |
  > **Root cause:** Account classification mismatch.

### 26-530 — MAYSAN ALMEGBEL
- **Route/Description:** EHRA 2026 REGISTRATION - 4 NTS
- **OPEX ref:** CRM-2026-19/J-2026-63/EHRA 2026 Congress
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `60307021` — Sponsoring Expenses |
  > **Root cause:** Cascade classified as employee travel; AlJeel treats as sponsorship. No OPEX document found in evidence folder.

### 26-550 — HAITHAM  ELKHATEEB
- **Route/Description:** TRAIN TICKET
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Cost Center | `250010` — Technical Services HO | `250020` — Maintenance |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 26-555 — ABDALLAH  AMOUDI + WASEEM  MUSTAFA
- **Route/Description:** TRAIN TICKETS
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10041` — Fujifilm | `10156` — NUBOMED |
  > **Root cause:** Master data mismatch — updated Manpower export needed.


---

## J26-589 — Apr 8-15 2026

**Score:** 98/129 = 76.0% all-5 exact

### 6904856106 — TAGRA/REYNAND JESUS MR
- **Route/Description:** RUH MNL RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `21070229` — Personal Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6904900821 — ABUIRSHEID/DANA MRS
- **Route/Description:** RUH AMM RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `21070229` — Personal Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6904900822 — ALMALAKH/MARITTA MS(CHD)
- **Route/Description:** RUH AMM RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `21070229` — Personal Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6904900823 — ALMALAKH/MILA MS(CHD)
- **Route/Description:** RUH AMM RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `21070229` — Personal Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6904900847 — ALANAZI/FARHAN MR
- **Route/Description:** RUH TUU RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301004` — G&A Travel | `60301003` — Travel Tickets |
  > **Root cause:** Account classification mismatch.

### 6904900849 — HADO/HUSSIEN MR
- **Route/Description:** RUH CDG RUH
- **OPEX ref:** CRM-2026-23/J-2026-67/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6904934035 — DAR/MEHBOOB ALI MR
- **Route/Description:** DEL CDG
- **OPEX ref:** CRM-2026-21/J-2026-68/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6904934036 — DAR/MEHBOOB ALI MR
- **Route/Description:** CDG JED
- **OPEX ref:** CRM-2026-21/J-2026-68/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6904934037 — DAR/MEHBOOB ALI MR
- **Route/Description:** JED ELQ
- **OPEX ref:** CRM-2026-21/J-2026-68/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6904934038 — ALSHEHRI/MOHAMMED MR
- **Route/Description:** RUH CDG RUH
- **OPEX ref:** CRM-2026-25/J-2026-69/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6904934067 — HADO/HUSSIEN MR
- **Route/Description:** CDG RUH
- **OPEX ref:** CRM-2026-23/J-2026-67/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6904982191 — ALMUTAIRI/MAJED MR
- **Route/Description:** JED JFK JED
- **OPEX ref:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10200` — S&M | `10100` — Getinge |
  | Cost Center | `140040` — Warehouse | `160011` —  |
  | DIV | `150` — PCS | `196` —  |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6904982192 — ALUTHMAN/UTHMAN MR
- **Route/Description:** JED JFK JED
- **OPEX ref:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `60307021` — Sponsoring Expenses |
  | Agency | `10156` — NUBOMED | `10100` — Getinge |
  > **Root cause:** Cascade classified as employee travel; AlJeel treats as sponsorship. No OPEX document found in evidence folder.

### 6904982219 — ALMUTAIRI/MAJED MR
- **Route/Description:** JFK ORD JFK
- **OPEX ref:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10200` — S&M | `10100` — Getinge |
  | Cost Center | `140040` — Warehouse | `160011` —  |
  | DIV | `150` — PCS | `196` —  |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6904982220 — ALUTHMAN/UTHMAN MR
- **Route/Description:** JFK ORD JFK
- **OPEX ref:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `60307021` — Sponsoring Expenses |
  | Agency | `10156` — NUBOMED | `10100` — Getinge |
  > **Root cause:** Cascade classified as employee travel; AlJeel treats as sponsorship. No OPEX document found in evidence folder.

### 6904982257 — ALATTAR/ABDULLAH MR
- **Route/Description:** RUH DMM RUH
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10202` — Solventum | `10132` — Illumina |
  | Cost Center | `160013` —  | `160012` —  |
  | DIV | `192` —  | `194` —  |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6905012408 — MADKHALI/MAJED MR
- **Route/Description:** GIZ JED GIZ
- **OPEX ref:** OPEX-PCS-14-2026/J-2026-74
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10202` — Solventum | `10081` — GE |
  | Cost Center | `160013` —  | `160011` —  |
  | DIV | `192` —  | `196` —  |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6905012409 — MADKHALI/MAJED MR
- **Route/Description:** JED CMN JED
- **OPEX ref:** OPEX-PCS-14-2026/J-2026-74
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10202` — Solventum | `10081` — GE |
  | Cost Center | `160013` —  | `160011` —  |
  | DIV | `192` —  | `196` —  |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6905012442 — KHAIR/QAIS MR
- **Route/Description:** RUH AMM RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `21070229` — Personal Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6905012446 — ALANAZI/ABDULAZIZ MR
- **Route/Description:** GIZ JED
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `88888` — G&A | `10200` — S&M |
  | Cost Center | `150020` — Admin | `140020` — Operation |
  | DIV | `888` — G&A | `190` — S&M |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6905055883 — KHADER/OMAR MR
- **Route/Description:** RUH JED RUH
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10200` — S&M | `10055` — Steris |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 26-582 — HUSSIEN HADO
- **Route/Description:** EHRA 2026 REGISTRATION - 4 NTS
- **OPEX ref:** CRM-2026-23/J-2026-67/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 26-583 — MOHAMED ALSHEHRI
- **Route/Description:** EHRA 2026 REGISTRATION - 4 NTS
- **OPEX ref:** CRM-2026-25/J-2026-69/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 26-588 — MOHAMMED ALSHEHRI
- **Route/Description:** Le Meridien Etoile - 5 NTS.
- **OPEX ref:** CRM-2026-25/J-2026-69/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 26-590 — MAJED ALMUTAIRI +1
- **Route/Description:** Hyatt Regency Chicago - 4 NTS.
- **OPEX ref:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10156` — NUBOMED | `10100` — Getinge |
  | DIV | `150` — PCS | `196` —  |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 26-594 — MOHAMMED DAWOD
- **Route/Description:** GERMANY VISA - 2 NTS.
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60307021` — Sponsoring Expenses | `60301003` — Travel Tickets |
  | Agency | `10072` — Abbott | `10156` — NUBOMED |
  | Cost Center | `160014` — Contribution new | `160011` —  |
  | DIV | `170` — Contribution | `196` —  |
  | Solution | `10094` —  | `0` —  |
  > **Root cause:** Account classification mismatch.

### 26-597 — ABDULHAKIM NOMAN
- **Route/Description:** Novotel Paris 17 - 4 NTS.
- **OPEX ref:** CRM-2026-18/EHRA 2026 - CRM-2026-18
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `60307021` — Sponsoring Expenses |
  > **Root cause:** Cascade classified as employee travel; AlJeel treats as sponsorship. No OPEX document found in evidence folder.

### 26-602 — MAYSAN MOHAMMED ALMEGBEL
- **Route/Description:** La Clef Champs-Elysees Paris b
- **OPEX ref:** CRM-2026-19/J-2026-63/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 26-606 — ABDULHAKIM NOMAN
- **Route/Description:** AIRPORT RETURN TRANSFER
- **OPEX ref:** CRM-2026-18/EHRA 2026 - CRM-2026-18
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `60307021` — Sponsoring Expenses |
  > **Root cause:** Cascade classified as employee travel; AlJeel treats as sponsorship. No OPEX document found in evidence folder.

### 26-609 — MAYSAN ALMEGBEL
- **Route/Description:** AIRPORT TO HOTEL TRANSFER
- **OPEX ref:** CRM-2026-19/J-2026-63/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `10094` —  | `10017` — CRM |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 26-612 — ABDUL WAHEED
- **Route/Description:** FLY JINNAH AIRLINE TICKET
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301004` — G&A Travel | `21070229` — Personal Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.


---

## J26-593 — Apr 16-23 2026

**Score:** 130/160 = 81.2% all-5 exact

### 6905084597 — ALSOMALI/NADIYA MS
- **Route/Description:** RUH IST BCN IST RUH
- **OPEX ref:** HF-2026-15/J-2026-82/Heart Failure Association 202
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10206` — Technical Services | `10072` — Abbott |
  | Cost Center | `250010` — Technical Services HO | `160014` — Contribution new |
  | DIV | `120` — Technical Services | `170` — Contribution |
  | Solution | `0` —  | `10050` — HF |
  > **Root cause:** Stale master — emp `1000313` (Abdulrazaq Hassan M Alsomali) master CC=`250010` but AlJeel uses `160014`. Department transfer not reflected in master export.

### 6905084601 — ALANAZI/ABDULAZIZ MR
- **Route/Description:** TUU JED
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `88888` — G&A | `10200` — S&M |
  | Cost Center | `150020` — Admin | `140020` — Operation |
  | DIV | `888` — G&A | `190` — S&M |
  > **Root cause:** Stale master — emp `1000511` (Ahmed Radhi Abeer Alanazi) master CC=`150020` but AlJeel uses `140020`. Department transfer not reflected in master export.

### 6905084613 — ALHUSSEIN/MOSAAD MR
- **Route/Description:** RUH JED BCN JED RUH
- **OPEX ref:** HF-2026-14/J-2026-81/Heart Failure Association 202
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10038` — Fluke | `10072` — Abbott |
  | Cost Center | `160011` —  | `160014` — Contribution new |
  | DIV | `196` —  | `170` — Contribution |
  | Solution | `0` —  | `10050` — HF |
  > **Root cause:** Stale master — emp `1000587` (Hussein Osama Hussein Abu Omeir) master CC=`160011` but AlJeel uses `160014`. Department transfer not reflected in master export.

### 6905084636 — ALQARNI/MOHAMMED MR
- **Route/Description:** JED DOH MUC
- **OPEX ref:** 20-DMS-2026/J-2026-77
- **Issue:** 🔴 NOT IN MASTER

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `60307021` — Sponsoring Expenses |
  | Agency | `0` —  | `10005` — Kavo |
  | Cost Center | `999999` —  | `160013` —  |
  | DIV | `0` —  | `192` —  |
  > **Root cause:** Employee not in `master-data-003.xlsx`. Need CC confirmation from Laith.

### 6905084638 — ALQARNI/MOHAMMED MR
- **Route/Description:** MUC JED
- **OPEX ref:** 20-DMS-2026/J-2026-77
- **Issue:** 🔴 NOT IN MASTER

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `60307021` — Sponsoring Expenses |
  | Agency | `0` —  | `10005` — Kavo |
  | Cost Center | `999999` —  | `160013` —  |
  | DIV | `0` —  | `192` —  |
  > **Root cause:** Employee not in `master-data-003.xlsx`. Need CC confirmation from Laith.

### 6905084640 — HALAWANI/RAGHEB MR
- **Route/Description:** JED MUC JED
- **OPEX ref:** 20-DMS-2026/J-2026-77
- **Issue:** 🔴 NOT IN MASTER

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `60307021` — Sponsoring Expenses |
  | Agency | `0` —  | `10005` — Kavo |
  | Cost Center | `999999` —  | `160013` —  |
  | DIV | `0` —  | `192` —  |
  > **Root cause:** Employee not in `master-data-003.xlsx`. Need CC confirmation from Laith.

### 6905084673 — ALATTAR/ABDULLAH MR
- **Route/Description:** RUH TIF RUH
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10202` — Solventum | `10132` — Illumina |
  | Cost Center | `160013` —  | `160012` —  |
  | DIV | `192` —  | `194` —  |
  > **Root cause:** Stale master — emp `1002019` (Mohammed Wasim Rafiq Alattar) master CC=`160013` but AlJeel uses `160012`. Department transfer not reflected in master export.

### 6905129222 — SHAIK/IMTIAZ AHMED MR
- **Route/Description:** DMM AUH MUC AUH DMM
- **OPEX ref:** 20-DMS-2026/J-2026-77
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10200` — S&M | `10005` — Kavo |
  | Cost Center | `140040` — Warehouse | `160013` —  |
  | DIV | `190` — S&M | `192` —  |
  > **Root cause:** Stale master — emp `1001064` (Shakeer Ahmed Shaik) master CC=`140040` but AlJeel uses `160013`. Department transfer not reflected in master export.

### 6905129223 — ALRESHIDAN/MOHAMMED MR
- **Route/Description:** RUH JED YYZ JED RUH
- **OPEX ref:** HF-2025-49/J-2025-191/OPEX HF# 49 ISHLT - KFMC
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `88888` — G&A | `10072` — Abbott |
  | Cost Center | `130010` — Finance | `160014` — Contribution new |
  | DIV | `888` — G&A | `170` — Contribution |
  | Solution | `0` —  | `10050` — HF |
  > **Root cause:** Stale master — emp `1001848` (Mohammad  Zaidan) master CC=`130010` but AlJeel uses `160014`. Department transfer not reflected in master export.

### 6905173588 — ALSHAMMARI/ABD ALMAJID MR
- **Route/Description:** AHB RUH
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10200` — S&M | `10153` — BMX |
  | Cost Center | `140020` — Operation | `160012` —  |
  | DIV | `190` — S&M | `194` —  |
  > **Root cause:** Stale master — emp `1000237` (Ahmad Khlaif Salman Alshammari) master CC=`140020` but AlJeel uses `160012`. Department transfer not reflected in master export.

### 6905173589 — ALSHAMMARI/ABD ALMAJID MR
- **Route/Description:** RUH AHB
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10200` — S&M | `10153` — BMX |
  | Cost Center | `140020` — Operation | `160012` —  |
  | DIV | `190` — S&M | `194` —  |
  > **Root cause:** Stale master — emp `1000237` (Ahmad Khlaif Salman Alshammari) master CC=`140020` but AlJeel uses `160012`. Department transfer not reflected in master export.

### 6905173604 — ALANAZI/YOUSEF MR
- **Route/Description:** HAS RUH
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `88888` — G&A | `10083` — Physio Control |
  | Cost Center | `150020` — Admin | `160011` —  |
  | DIV | `888` — G&A | `196` —  |
  > **Root cause:** Stale master — emp `1000511` (Ahmed Radhi Abeer Alanazi) master CC=`150020` but AlJeel uses `160011`. Department transfer not reflected in master export.

### 6905173612 — AHMED/AHMED MOHAMED MR
- **Route/Description:** CAI CDG ORD CDG CAI
- **OPEX ref:** OPEX-CRM-2026-27-J-2026-83/Heart Rhythm 26
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10206` — Technical Services | `10072` — Abbott |
  | Cost Center | `250010` — Technical Services HO | `160014` — Contribution new |
  | DIV | `120` — Technical Services | `170` — Contribution |
  | Solution | `0` —  | `10017` — CRM |
  > **Root cause:** Stale master — emp `1000087` (Waseem Mohammad Ahmad Ahmad) master CC=`250010` but AlJeel uses `160014`. Department transfer not reflected in master export.

### 6905173622 — ALHUSSEIN/MOSAAD MR
- **Route/Description:** RUH CDG BCN JED RUH
- **OPEX ref:** HF-2026-14/J-2026-81/Heart Failure Association 202
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10038` — Fluke | `10072` — Abbott |
  | Cost Center | `160011` —  | `160014` — Contribution new |
  | DIV | `196` —  | `170` — Contribution |
  | Solution | `0` —  | `10050` — HF |
  > **Root cause:** Stale master — emp `1000587` (Hussein Osama Hussein Abu Omeir) master CC=`160011` but AlJeel uses `160014`. Department transfer not reflected in master export.

### 6905173655 — BINMANEEA/WALEED MR
- **Route/Description:** RUH IST ORD IST RUH
- **OPEX ref:** OPEX-EP-2026-15-J-2026-87
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Solution | `EP` —  | `10064` — EP |
  > **Root cause:** Master data mismatch — updated Manpower export needed.

### 6905202178 — ZUBAIR/UMMARA MRS
- **Route/Description:** RUH LHE RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `21070229` — Personal Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6905202179 — FATIMA/MISHAEL MS(CHD)
- **Route/Description:** RUH LHE RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `21070229` — Personal Contribution |
  > **Root cause:** Personal contribution ticket — pipeline defaulted to standard travel account. Personal contribution form may not have been in evidence.

### 6905202186 — ALGHAMDI/SALEH MR
- **Route/Description:** RUH VIE RUH
- **OPEX ref:** EP-2026-14/J-2026-86/Prague Rhythm 2026
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `88888` — G&A | `10072` — Abbott |
  | Cost Center | `130020` — Collection | `160014` — Contribution new |
  | DIV | `888` — G&A | `170` — Contribution |
  | Solution | `0` —  | `10064` — EP |
  > **Root cause:** Stale master — emp `1000119` (Adel Saeed Alghamdi) master CC=`130020` but AlJeel uses `160014`. Department transfer not reflected in master export.

### 6905202187 — DAGRIRI/KHALID MR
- **Route/Description:** RUH VIE RUH
- **OPEX ref:** EP-2026-14/J-2026-86/Prague Rhythm 2026
- **Issue:** 🔴 NOT IN MASTER

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Account | `60301003` — Travel Tickets | `60307021` — Sponsoring Expenses |
  | Agency | `0` —  | `10072` — Abbott |
  | Cost Center | `999999` —  | `160014` — Contribution new |
  | DIV | `0` —  | `170` — Contribution |
  | Solution | `0` —  | `10064` — EP |
  > **Root cause:** Employee not in `master-data-003.xlsx`. Need CC confirmation from Laith.

### 6905202199 — ALANAZI/ABDULAZIZ MR
- **Route/Description:** GIZ JED
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `88888` — G&A | `10200` — S&M |
  | Cost Center | `150020` — Admin | `140020` — Operation |
  | DIV | `888` — G&A | `190` — S&M |
  > **Root cause:** Stale master — emp `1000511` (Ahmed Radhi Abeer Alanazi) master CC=`150020` but AlJeel uses `140020`. Department transfer not reflected in master export.

### 6905202222 — ALGHAMDI/ABDULLAH MR
- **Route/Description:** RUH ELQ RUH
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `88888` — G&A | `10206` — Technical Services |
  | Cost Center | `130020` — Collection | `250010` — Technical Services HO |
  | DIV | `888` — G&A | `120` — Technical Services |
  > **Root cause:** Stale master — emp `1000119` (Adel Saeed Alghamdi) master CC=`130020` but AlJeel uses `250010`. Department transfer not reflected in master export.

### 6905234779 — ALOTAIBI/FAISAL
- **Route/Description:** GIZ JED
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10206` — Technical Services | `88888` — G&A |
  | Cost Center | `250010` — Technical Services HO | `130020` — Collection |
  | DIV | `120` — Technical Services | `888` — G&A |
  > **Root cause:** Stale master — emp `1001126` (Yasir Eid M Alotaibi) master CC=`250010` but AlJeel uses `130020`. Department transfer not reflected in master export.

### 6905234786 — ALENAZI/ABDULAZIZ MR
- **Route/Description:** GIZ JED
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `88888` — G&A | `10200` — S&M |
  | Cost Center | `130020` — Collection | `140020` — Operation |
  | DIV | `888` — G&A | `190` — S&M |
  > **Root cause:** Stale master — emp `1002009` (Abdulaziz Owaid N Alanazi) master CC=`130020` but AlJeel uses `140020`. Department transfer not reflected in master export.

### 6905234799 — ABDELAZIZ/MOHAMED MR
- **Route/Description:** GIZ JED
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10206` — Technical Services | `88888` — G&A |
  | Cost Center | `250010` — Technical Services HO | `130020` — Collection |
  | DIV | `120` — Technical Services | `888` — G&A |
  > **Root cause:** Stale master — emp `1000129` (Magdy Abdelaziz Mohamed Hassan) master CC=`250010` but AlJeel uses `130020`. Department transfer not reflected in master export.

### 6905234833 — DAWOD/MOHAMED MR
- **Route/Description:** RUH IST STR IST RUH
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10156` — NUBOMED | `10052` — KLS Martin |
  > **Root cause:** Stale master — emp `1002167` (Mohamed  Abdelrazig Sabir Dawod) master CC=`160011` but AlJeel uses `160011`. Department transfer not reflected in master export.

### 6905234849 — KHADER/OMAR MR
- **Route/Description:** RUH JED
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10200` — S&M | `10156` — NUBOMED |
  > **Root cause:** Stale master — emp `1000453` (Omar Mahmoud Khader) master CC=`160011` but AlJeel uses `160011`. Department transfer not reflected in master export.

### 6905234850 — KHADER/OMAR MR
- **Route/Description:** JED RUH
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10200` — S&M | `10156` — NUBOMED |
  > **Root cause:** Stale master — emp `1000453` (Omar Mahmoud Khader) master CC=`160011` but AlJeel uses `160011`. Department transfer not reflected in master export.

### 6905264359 — ALANAZI/YOUSEF MR
- **Route/Description:** AJF RUH
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `88888` — G&A | `10083` — Physio Control |
  | Cost Center | `150020` — Admin | `160011` —  |
  | DIV | `888` — G&A | `196` —  |
  > **Root cause:** Stale master — emp `1000511` (Ahmed Radhi Abeer Alanazi) master CC=`150020` but AlJeel uses `160011`. Department transfer not reflected in master export.

### 26-616 — UTHMAN ALUTHMAN
- **Route/Description:** AATS 106th Annual Meeting - 3 
- **OPEX ref:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10156` — NUBOMED | `10100` — Getinge |
  > **Root cause:** Stale master — emp `1001986` (Mohamed Mahmmuod Alsharif Gaseem) master CC=`160011` but AlJeel uses `160011`. Department transfer not reflected in master export.

### 26-617 — MAJED ALMUTAIRI
- **Route/Description:** AATS 106th Annual Meeting - 3 
- **OPEX ref:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟡 STALE MASTER CC/AGENCY

  | Field | Our output | AlJeel Truth |
  |---|---|---|
  | Agency | `10156` — NUBOMED | `10100` — Getinge |
  > **Root cause:** Stale master — emp `1001986` (Mohamed Mahmmuod Alsharif Gaseem) master CC=`160011` but AlJeel uses `160011`. Department transfer not reflected in master export.


---

## J26-640 — Apr 24-30 2026

**Score:** 117/117 = 100.0% all-5 exact

✅ **No discrepancies — 100% match.**
