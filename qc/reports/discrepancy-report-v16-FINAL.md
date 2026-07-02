# AlJeel AP v16 — Discrepancy Report

**Generated:** 2026-05-27  |  **Pipeline:** v16 (final locked)  |  **Batches:** J26-550 / J26-589 / J26-593 / J26-640

## Score Summary

| Batch | Period | Rows | All-5 Exact | Account% | CC% | Agency% |
|---|---|---|---|---|---|---|
| **J26-550** | Apr 1-7 2026 | 72 | **61/72 (84.7%)** | 94% | 93% | 93% |
| **J26-589** | Apr 8-15 2026 | 129 | **98/129 (76.0%)** | 91% | 95% | 91% |
| **J26-593** | Apr 16-23 2026 | 160 | **130/160 (81.2%)** | 96% | 86% | 82% |
| **J26-640** | Apr 24-30 2026 | 117 | **117/117 (100.0%)** | 100% | 100% | 100% |
| **Total** | | **478** | **406/478 (84.9%)** | | | |

---

## J26-550 — Apr 1-7 2026

**Score:** 61/72 = 84.7% all-5 exact  |  Account 68/72  CC 67/72  Agency 67/72

### 6904732429 — HUSSEIN/TALIA MS(CHD)
- **Route:** RUH JED HBE RUH
- **Issue:** 🟠 PERSONAL CONTRIBUTION — account mismatch

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `21070229` Personal Contribution | — |
  > **Root cause:** Personal contribution ticket. Account fixed where cascade was not_resolved; CC/Agency still stale in master (needs Fix A).

### 6904732430 — HUSSEIN/YOUSSEF MR
- **Route:** RUH JED HBE RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10206` Technical Services | `10239` J&J | — |
  | CC | `250010` Technical Services HO | `160014` Contribution new | — |
  | DIV | `120` Technical Services | `170` Contribution | — |
  > **Root cause:** Stale master — emp `1000160` (Yasir Mohamed Ibrahim Hussein) master CC=`250010` vs AlJeel `160014`. Likely department transfer.

### 6904732431 — SALEM/EFFAT MRS
- **Route:** RUH JED HBE RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10206` Technical Services | `10239` J&J | — |
  | CC | `250010` Technical Services HO | `160014` Contribution new | — |
  | DIV | `120` Technical Services | `170` Contribution | — |
  > **Root cause:** Stale master — emp `1000463` (Salem Mohamed Salem Abdullatif) master CC=`250010` vs AlJeel `160014`. Likely department transfer.

### 6904732451 — KHADER/OMAR MR
- **Route:** RUH JED RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10200` S&M | `10055` Steris | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6904763668 — ALEJO/JOE MARIE MR
- **Route:** DMM MNL
- **OPEX/Note:** خروج نهائي
- **Issue:** 🟠 PERSONAL CONTRIBUTION — account mismatch

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301004` G&A Travel | `21070229` Personal Contribution | — |
  | Agency | `88888` G&A | `10206` Technical Services | — |
  | CC | `150020` Admin | `250010` Technical Services HO | — |
  | DIV | `888` G&A | `120` Technical Services | — |
  > **Root cause:** Personal contribution ticket. Account fixed where cascade was not_resolved; CC/Agency still stale in master (needs Fix A).

### 6904823462 — ALTAIR/MOHAMMED MR
- **Route:** RUH DOH PVG DOH RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301004` G&A Travel | `60301003` Travel Tickets | — |
  > **Root cause:** G&A rule fired (DIV=888 in master) but AlJeel uses standard travel. Master div may be stale.

### 6904823513 — ELAZHARY/MOHAMED MR
- **Route:** CAI RUH
- **OPEX/Note:** new employee
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | CC | `150020` Admin | `170020` Strategy | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6904856041 — BIN MUDHIAN/FAISAL MR
- **Route:** RUH IST LYS IST RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `60308009` Other Expenses | — |
  > **Root cause:** Account 60308009 (Other) not in pipeline ruleset — needs AlJeel definition.

### 26-530 — MAYSAN ALMEGBEL
- **Route:** EHRA 2026 REGISTRATION - 4 NTS.
- **OPEX/Note:** CRM-2026-19/J-2026-63/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 26-550 — HAITHAM  ELKHATEEB
- **Route:** TRAIN TICKET
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | CC | `250010` Technical Services HO | `250020` Maintenance | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 26-555 — ABDALLAH  AMOUDI + WASEEM  MUSTAFA
- **Route:** TRAIN TICKETS
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10041` Fujifilm | `10156` NUBOMED | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

---

## J26-589 — Apr 8-15 2026

**Score:** 98/129 = 76.0% all-5 exact  |  Account 117/129  CC 122/129  Agency 118/129

### 6904856106 — TAGRA/REYNAND JESUS MR
- **Route:** RUH MNL RUH
- **Issue:** 🟠 PERSONAL CONTRIBUTION — account mismatch

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `21070229` Personal Contribution | — |
  > **Root cause:** Personal contribution ticket. Account fixed where cascade was not_resolved; CC/Agency still stale in master (needs Fix A).

### 6904900821 — ABUIRSHEID/DANA MRS
- **Route:** RUH AMM RUH
- **Issue:** 🟠 PERSONAL CONTRIBUTION — account mismatch

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `21070229` Personal Contribution | — |
  > **Root cause:** Personal contribution ticket. Account fixed where cascade was not_resolved; CC/Agency still stale in master (needs Fix A).

### 6904900822 — ALMALAKH/MARITTA MS(CHD)
- **Route:** RUH AMM RUH
- **Issue:** 🟠 PERSONAL CONTRIBUTION — account mismatch

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `21070229` Personal Contribution | — |
  > **Root cause:** Personal contribution ticket. Account fixed where cascade was not_resolved; CC/Agency still stale in master (needs Fix A).

### 6904900823 — ALMALAKH/MILA MS(CHD)
- **Route:** RUH AMM RUH
- **Issue:** 🟠 PERSONAL CONTRIBUTION — account mismatch

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `21070229` Personal Contribution | — |
  > **Root cause:** Personal contribution ticket. Account fixed where cascade was not_resolved; CC/Agency still stale in master (needs Fix A).

### 6904900847 — ALANAZI/FARHAN MR
- **Route:** RUH TUU RUH
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301004` G&A Travel | `60301003` Travel Tickets | — |
  > **Root cause:** G&A rule fired (DIV=888 in master) but AlJeel uses standard travel. Master div may be stale.

### 6904900849 — HADO/HUSSIEN MR
- **Route:** RUH CDG RUH
- **OPEX/Note:** CRM-2026-23/J-2026-67/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6904934035 — DAR/MEHBOOB ALI MR
- **Route:** DEL CDG
- **OPEX/Note:** CRM-2026-21/J-2026-68/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6904934036 — DAR/MEHBOOB ALI MR
- **Route:** CDG JED
- **OPEX/Note:** CRM-2026-21/J-2026-68/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6904934037 — DAR/MEHBOOB ALI MR
- **Route:** JED ELQ
- **OPEX/Note:** CRM-2026-21/J-2026-68/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6904934038 — ALSHEHRI/MOHAMMED MR
- **Route:** RUH CDG RUH
- **OPEX/Note:** CRM-2026-25/J-2026-69/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6904934067 — HADO/HUSSIEN MR
- **Route:** CDG RUH
- **OPEX/Note:** CRM-2026-23/J-2026-67/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6904982191 — ALMUTAIRI/MAJED MR
- **Route:** JED JFK JED
- **OPEX/Note:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10200` S&M | `10100` Getinge | — |
  | CC | `140040` Warehouse | `160011`  | — |
  | DIV | `150` PCS | `196`  | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6904982192 — ALUTHMAN/UTHMAN MR
- **Route:** JED JFK JED
- **OPEX/Note:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟠 SPONSORSHIP MISSED — no OPEX evidence found

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `60307021` Sponsoring Expenses | — |
  | Agency | `10156` NUBOMED | `10100` Getinge | — |
  > **Root cause:** Sponsorship with no OPEX in evidence folder, or attendee name absent from OPEX PDF.

### 6904982219 — ALMUTAIRI/MAJED MR
- **Route:** JFK ORD JFK
- **OPEX/Note:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10200` S&M | `10100` Getinge | — |
  | CC | `140040` Warehouse | `160011`  | — |
  | DIV | `150` PCS | `196`  | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6904982220 — ALUTHMAN/UTHMAN MR
- **Route:** JFK ORD JFK
- **OPEX/Note:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟠 SPONSORSHIP MISSED — no OPEX evidence found

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `60307021` Sponsoring Expenses | — |
  | Agency | `10156` NUBOMED | `10100` Getinge | — |
  > **Root cause:** Sponsorship with no OPEX in evidence folder, or attendee name absent from OPEX PDF.

### 6904982257 — ALATTAR/ABDULLAH MR
- **Route:** RUH DMM RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10202` Solventum | `10132` Illumina | — |
  | CC | `160013`  | `160012`  | — |
  | DIV | `192`  | `194`  | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6905012408 — MADKHALI/MAJED MR
- **Route:** GIZ JED GIZ
- **OPEX/Note:** OPEX-PCS-14-2026/J-2026-74
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10202` Solventum | `10081` GE | — |
  | CC | `160013`  | `160011`  | — |
  | DIV | `192`  | `196`  | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6905012409 — MADKHALI/MAJED MR
- **Route:** JED CMN JED
- **OPEX/Note:** OPEX-PCS-14-2026/J-2026-74
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10202` Solventum | `10081` GE | — |
  | CC | `160013`  | `160011`  | — |
  | DIV | `192`  | `196`  | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6905012442 — KHAIR/QAIS MR
- **Route:** RUH AMM RUH
- **Issue:** 🟠 PERSONAL CONTRIBUTION — account mismatch

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `21070229` Personal Contribution | — |
  > **Root cause:** Personal contribution ticket. Account fixed where cascade was not_resolved; CC/Agency still stale in master (needs Fix A).

### 6905012446 — ALANAZI/ABDULAZIZ MR
- **Route:** GIZ JED
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `88888` G&A | `10200` S&M | — |
  | CC | `150020` Admin | `140020` Operation | — |
  | DIV | `888` G&A | `190` S&M | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 6905055883 — KHADER/OMAR MR
- **Route:** RUH JED RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10200` S&M | `10055` Steris | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 26-582 — HUSSIEN HADO
- **Route:** EHRA 2026 REGISTRATION - 4 NTS.
- **OPEX/Note:** CRM-2026-23/J-2026-67/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 26-583 — MOHAMED ALSHEHRI
- **Route:** EHRA 2026 REGISTRATION - 4 NTS.
- **OPEX/Note:** CRM-2026-25/J-2026-69/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 26-588 — MOHAMMED ALSHEHRI
- **Route:** Le Meridien Etoile - 5 NTS.
- **OPEX/Note:** CRM-2026-25/J-2026-69/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 26-590 — MAJED ALMUTAIRI +1
- **Route:** Hyatt Regency Chicago - 4 NTS.
- **OPEX/Note:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10156` NUBOMED | `10100` Getinge | — |
  | DIV | `150` PCS | `196`  | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 26-594 — MOHAMMED DAWOD
- **Route:** GERMANY VISA - 2 NTS.
- **Issue:** 🟠 WRONG ACCOUNT

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60307021` Sponsoring Expenses | `60301003` Travel Tickets | — |
  | Agency | `10072` Abbott | `10156` NUBOMED | — |
  | CC | `160014` Contribution new | `160011`  | — |
  | DIV | `170` Contribution | `196`  | — |
  | Solution | `10094`  | `0`  | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 26-597 — ABDULHAKIM NOMAN
- **Route:** Novotel Paris 17 - 4 NTS.
- **OPEX/Note:** CRM-2026-18/EHRA 2026 - CRM-2026-18
- **Issue:** 🟠 SPONSORSHIP MISSED — no OPEX evidence found

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `60307021` Sponsoring Expenses | — |
  > **Root cause:** Sponsorship with no OPEX in evidence folder, or attendee name absent from OPEX PDF.

### 26-602 — MAYSAN MOHAMMED ALMEGBEL
- **Route:** La Clef Champs-Elysees Paris by The
- **OPEX/Note:** CRM-2026-19/J-2026-63/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 26-606 — ABDULHAKIM NOMAN
- **Route:** AIRPORT RETURN TRANSFER
- **OPEX/Note:** CRM-2026-18/EHRA 2026 - CRM-2026-18
- **Issue:** 🟠 SPONSORSHIP MISSED — no OPEX evidence found

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `60307021` Sponsoring Expenses | — |
  > **Root cause:** Sponsorship with no OPEX in evidence folder, or attendee name absent from OPEX PDF.

### 26-609 — MAYSAN ALMEGBEL
- **Route:** AIRPORT TO HOTEL TRANSFER
- **OPEX/Note:** CRM-2026-19/J-2026-63/EHRA 2026 Congress
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `10094`  | `10017` CRM | — |
  > **Root cause:** Master CC/Agency mismatch — updated Manpower export needed.

### 26-612 — ABDUL WAHEED
- **Route:** FLY JINNAH AIRLINE TICKET
- **Issue:** 🟠 PERSONAL CONTRIBUTION — account mismatch

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301004` G&A Travel | `21070229` Personal Contribution | — |
  > **Root cause:** Personal contribution ticket. Account fixed where cascade was not_resolved; CC/Agency still stale in master (needs Fix A).

---

## J26-593 — Apr 16-23 2026

**Score:** 130/160 = 81.2% all-5 exact  |  Account 154/160  CC 137/160  Agency 132/160

### 6905084597 — ALSOMALI/NADIYA MS
- **Route:** RUH IST BCN IST RUH
- **OPEX/Note:** HF-2026-15/J-2026-82/Heart Failure Association 2026
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10206` Technical Services | `10072` Abbott | — |
  | CC | `250010` Technical Services HO | `160014` Contribution new | — |
  | DIV | `120` Technical Services | `170` Contribution | — |
  | Solution | `0`  | `10050` HF | — |
  > **Root cause:** Stale master — emp `1000313` (Abdulrazaq Hassan M Alsomali) master CC=`250010` vs AlJeel `160014`. Likely department transfer.

### 6905084601 — ALANAZI/ABDULAZIZ MR
- **Route:** TUU JED
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `88888` G&A | `10200` S&M | — |
  | CC | `150020` Admin | `140020` Operation | — |
  | DIV | `888` G&A | `190` S&M | — |
  > **Root cause:** Stale master — emp `1000511` (Ahmed Radhi Abeer Alanazi) master CC=`150020` vs AlJeel `140020`. Likely department transfer.

### 6905084613 — ALHUSSEIN/MOSAAD MR
- **Route:** RUH JED BCN JED RUH
- **OPEX/Note:** HF-2026-14/J-2026-81/Heart Failure Association 2026
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10038` Fluke | `10072` Abbott | — |
  | CC | `160011`  | `160014` Contribution new | — |
  | DIV | `196`  | `170` Contribution | — |
  | Solution | `0`  | `10050` HF | — |
  > **Root cause:** Stale master — emp `1000587` (Hussein Osama Hussein Abu Omeir) master CC=`160011` vs AlJeel `160014`. Likely department transfer.

### 6905084636 — ALQARNI/MOHAMMED MR
- **Route:** JED DOH MUC
- **OPEX/Note:** 20-DMS-2026/J-2026-77
- **Issue:** 🔴 NOT IN MASTER

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `60307021` Sponsoring Expenses | — |
  | Agency | `0`  | `10005` Kavo | — |
  | CC | `999999`  | `160013`  | — |
  | DIV | `0`  | `192`  | — |
  > **Root cause:** Employee absent from `master-data-003.xlsx`. Confirm CC with Laith → add to overrides.

### 6905084638 — ALQARNI/MOHAMMED MR
- **Route:** MUC JED
- **OPEX/Note:** 20-DMS-2026/J-2026-77
- **Issue:** 🔴 NOT IN MASTER

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `60307021` Sponsoring Expenses | — |
  | Agency | `0`  | `10005` Kavo | — |
  | CC | `999999`  | `160013`  | — |
  | DIV | `0`  | `192`  | — |
  > **Root cause:** Employee absent from `master-data-003.xlsx`. Confirm CC with Laith → add to overrides.

### 6905084640 — HALAWANI/RAGHEB MR
- **Route:** JED MUC JED
- **OPEX/Note:** 20-DMS-2026/J-2026-77
- **Issue:** 🔴 NOT IN MASTER

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `60307021` Sponsoring Expenses | — |
  | Agency | `0`  | `10005` Kavo | — |
  | CC | `999999`  | `160013`  | — |
  | DIV | `0`  | `192`  | — |
  > **Root cause:** Employee absent from `master-data-003.xlsx`. Confirm CC with Laith → add to overrides.

### 6905084673 — ALATTAR/ABDULLAH MR
- **Route:** RUH TIF RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10202` Solventum | `10132` Illumina | — |
  | CC | `160013`  | `160012`  | — |
  | DIV | `192`  | `194`  | — |
  > **Root cause:** Stale master — emp `1002019` (Mohammed Wasim Rafiq Alattar) master CC=`160013` vs AlJeel `160012`. Likely department transfer.

### 6905129222 — SHAIK/IMTIAZ AHMED MR
- **Route:** DMM AUH MUC AUH DMM
- **OPEX/Note:** 20-DMS-2026/J-2026-77
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10200` S&M | `10005` Kavo | — |
  | CC | `140040` Warehouse | `160013`  | — |
  | DIV | `190` S&M | `192`  | — |
  > **Root cause:** Stale master — emp `1001064` (Shakeer Ahmed Shaik) master CC=`140040` vs AlJeel `160013`. Likely department transfer.

### 6905129223 — ALRESHIDAN/MOHAMMED MR
- **Route:** RUH JED YYZ JED RUH
- **OPEX/Note:** HF-2025-49/J-2025-191/OPEX HF# 49 ISHLT - KFMC
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `88888` G&A | `10072` Abbott | — |
  | CC | `130010` Finance | `160014` Contribution new | — |
  | DIV | `888` G&A | `170` Contribution | — |
  | Solution | `0`  | `10050` HF | — |
  > **Root cause:** Stale master — emp `1001848` (Mohammad  Zaidan) master CC=`130010` vs AlJeel `160014`. Likely department transfer.

### 6905173588 — ALSHAMMARI/ABD ALMAJID MR
- **Route:** AHB RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10200` S&M | `10153` BMX | — |
  | CC | `140020` Operation | `160012`  | — |
  | DIV | `190` S&M | `194`  | — |
  > **Root cause:** Stale master — emp `1000237` (Ahmad Khlaif Salman Alshammari) master CC=`140020` vs AlJeel `160012`. Likely department transfer.

### 6905173589 — ALSHAMMARI/ABD ALMAJID MR
- **Route:** RUH AHB
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10200` S&M | `10153` BMX | — |
  | CC | `140020` Operation | `160012`  | — |
  | DIV | `190` S&M | `194`  | — |
  > **Root cause:** Stale master — emp `1000237` (Ahmad Khlaif Salman Alshammari) master CC=`140020` vs AlJeel `160012`. Likely department transfer.

### 6905173604 — ALANAZI/YOUSEF MR
- **Route:** HAS RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `88888` G&A | `10083` Physio Control | — |
  | CC | `150020` Admin | `160011`  | — |
  | DIV | `888` G&A | `196`  | — |
  > **Root cause:** Stale master — emp `1000511` (Ahmed Radhi Abeer Alanazi) master CC=`150020` vs AlJeel `160011`. Likely department transfer.

### 6905173612 — AHMED/AHMED MOHAMED MR
- **Route:** CAI CDG ORD CDG CAI
- **OPEX/Note:** OPEX-CRM-2026-27-J-2026-83/Heart Rhythm 26
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10206` Technical Services | `10072` Abbott | — |
  | CC | `250010` Technical Services HO | `160014` Contribution new | — |
  | DIV | `120` Technical Services | `170` Contribution | — |
  | Solution | `0`  | `10017` CRM | — |
  > **Root cause:** Stale master — emp `1000087` (Waseem Mohammad Ahmad Ahmad) master CC=`250010` vs AlJeel `160014`. Likely department transfer.

### 6905173622 — ALHUSSEIN/MOSAAD MR
- **Route:** RUH CDG BCN JED RUH
- **OPEX/Note:** HF-2026-14/J-2026-81/Heart Failure Association 2026
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10038` Fluke | `10072` Abbott | — |
  | CC | `160011`  | `160014` Contribution new | — |
  | DIV | `196`  | `170` Contribution | — |
  | Solution | `0`  | `10050` HF | — |
  > **Root cause:** Stale master — emp `1000587` (Hussein Osama Hussein Abu Omeir) master CC=`160011` vs AlJeel `160014`. Likely department transfer.

### 6905202178 — ZUBAIR/UMMARA MRS
- **Route:** RUH LHE RUH
- **Issue:** 🟠 PERSONAL CONTRIBUTION — account mismatch

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `21070229` Personal Contribution | — |
  > **Root cause:** Personal contribution ticket. Account fixed where cascade was not_resolved; CC/Agency still stale in master (needs Fix A).

### 6905202179 — FATIMA/MISHAEL MS(CHD)
- **Route:** RUH LHE RUH
- **Issue:** 🟠 PERSONAL CONTRIBUTION — account mismatch

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `21070229` Personal Contribution | — |
  > **Root cause:** Personal contribution ticket. Account fixed where cascade was not_resolved; CC/Agency still stale in master (needs Fix A).

### 6905202186 — ALGHAMDI/SALEH MR
- **Route:** RUH VIE RUH
- **OPEX/Note:** EP-2026-14/J-2026-86/Prague Rhythm 2026
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `88888` G&A | `10072` Abbott | — |
  | CC | `130020` Collection | `160014` Contribution new | — |
  | DIV | `888` G&A | `170` Contribution | — |
  | Solution | `0`  | `10064` EP | — |
  > **Root cause:** Stale master — emp `1000119` (Adel Saeed Alghamdi) master CC=`130020` vs AlJeel `160014`. Likely department transfer.

### 6905202187 — DAGRIRI/KHALID MR
- **Route:** RUH VIE RUH
- **OPEX/Note:** EP-2026-14/J-2026-86/Prague Rhythm 2026
- **Issue:** 🔴 NOT IN MASTER

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Account | `60301003` Travel Tickets | `60307021` Sponsoring Expenses | — |
  | Agency | `0`  | `10072` Abbott | — |
  | CC | `999999`  | `160014` Contribution new | — |
  | DIV | `0`  | `170` Contribution | — |
  | Solution | `0`  | `10064` EP | — |
  > **Root cause:** Employee absent from `master-data-003.xlsx`. Confirm CC with Laith → add to overrides.

### 6905202199 — ALANAZI/ABDULAZIZ MR
- **Route:** GIZ JED
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `88888` G&A | `10200` S&M | — |
  | CC | `150020` Admin | `140020` Operation | — |
  | DIV | `888` G&A | `190` S&M | — |
  > **Root cause:** Stale master — emp `1000511` (Ahmed Radhi Abeer Alanazi) master CC=`150020` vs AlJeel `140020`. Likely department transfer.

### 6905202222 — ALGHAMDI/ABDULLAH MR
- **Route:** RUH ELQ RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `88888` G&A | `10206` Technical Services | — |
  | CC | `130020` Collection | `250010` Technical Services HO | — |
  | DIV | `888` G&A | `120` Technical Services | — |
  > **Root cause:** Stale master — emp `1000119` (Adel Saeed Alghamdi) master CC=`130020` vs AlJeel `250010`. Likely department transfer.

### 6905234779 — ALOTAIBI/FAISAL
- **Route:** GIZ JED
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10206` Technical Services | `88888` G&A | — |
  | CC | `250010` Technical Services HO | `130020` Collection | — |
  | DIV | `120` Technical Services | `888` G&A | — |
  > **Root cause:** Stale master — emp `1001126` (Yasir Eid M Alotaibi) master CC=`250010` vs AlJeel `130020`. Likely department transfer.

### 6905234786 — ALENAZI/ABDULAZIZ MR
- **Route:** GIZ JED
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `88888` G&A | `10200` S&M | — |
  | CC | `130020` Collection | `140020` Operation | — |
  | DIV | `888` G&A | `190` S&M | — |
  > **Root cause:** Stale master — emp `1002009` (Abdulaziz Owaid N Alanazi) master CC=`130020` vs AlJeel `140020`. Likely department transfer.

### 6905234799 — ABDELAZIZ/MOHAMED MR
- **Route:** GIZ JED
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10206` Technical Services | `88888` G&A | — |
  | CC | `250010` Technical Services HO | `130020` Collection | — |
  | DIV | `120` Technical Services | `888` G&A | — |
  > **Root cause:** Stale master — emp `1000129` (Magdy Abdelaziz Mohamed Hassan) master CC=`250010` vs AlJeel `130020`. Likely department transfer.

### 6905234833 — DAWOD/MOHAMED MR
- **Route:** RUH IST STR IST RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10156` NUBOMED | `10052` KLS Martin | — |
  > **Root cause:** Stale master — emp `1002167` (Mohamed  Abdelrazig Sabir Dawod) master CC=`160011` vs AlJeel `160011`. Likely department transfer.

### 6905234849 — KHADER/OMAR MR
- **Route:** RUH JED
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10200` S&M | `10156` NUBOMED | — |
  > **Root cause:** Stale master — emp `1000453` (Omar Mahmoud Khader) master CC=`160011` vs AlJeel `160011`. Likely department transfer.

### 6905234850 — KHADER/OMAR MR
- **Route:** JED RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10200` S&M | `10156` NUBOMED | — |
  > **Root cause:** Stale master — emp `1000453` (Omar Mahmoud Khader) master CC=`160011` vs AlJeel `160011`. Likely department transfer.

### 6905264359 — ALANAZI/YOUSEF MR
- **Route:** AJF RUH
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `88888` G&A | `10083` Physio Control | — |
  | CC | `150020` Admin | `160011`  | — |
  | DIV | `888` G&A | `196`  | — |
  > **Root cause:** Stale master — emp `1000511` (Ahmed Radhi Abeer Alanazi) master CC=`150020` vs AlJeel `160011`. Likely department transfer.

### 26-616 — UTHMAN ALUTHMAN
- **Route:** AATS 106th Annual Meeting - 3 NTS.
- **OPEX/Note:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10156` NUBOMED | `10100` Getinge | — |
  > **Root cause:** Stale master — emp `1001986` (Mohamed Mahmmuod Alsharif Gaseem) master CC=`160011` vs AlJeel `160011`. Likely department transfer.

### 26-617 — MAJED ALMUTAIRI
- **Route:** AATS 106th Annual Meeting - 3 NTS.
- **OPEX/Note:** OPEX-PCS-12-2026-J-2026-70
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10156` NUBOMED | `10100` Getinge | — |
  > **Root cause:** Stale master — emp `1001986` (Mohamed Mahmmuod Alsharif Gaseem) master CC=`160011` vs AlJeel `160011`. Likely department transfer.

### 26-639 — MOHAMMAD  MAHMOUD
- **Route:** TRAIN TICKET
- **Issue:** 🟡 STALE MASTER — CC/Agency

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Agency | `10072` Abbott | `10153` BMX | — |
  | CC | `160014` Contribution new | `160012`  | — |
  | DIV | `170` Contribution | `194`  | — |
  | Solution | `10050` HF | `0`  | — |
  > **Root cause:** Stale master — emp `1001288` (Mohammad Saad Abdelfattah Mahmoud) master CC=`160012` vs AlJeel `160012`. Likely department transfer.

---

## J26-640 — Apr 24-30 2026

**Score:** 117/117 = 100.0% all-5 exact  |  Account 117/117  CC 117/117  Agency 117/117

✅ **Perfect — no discrepancies.**

---

## Fix Priority

| Priority | Root cause | Rows affected | Action |
|---|---|---|---|
| 🔴 1 | Stale master CC/Agency (10 employees recurring across batches) | ~40 rows | **Updated Oracle Manpower export from Qasim** |
| 🔴 2 | NOT IN MASTER (ALQARNI, HALAWANI, DAGRIRI, ABDELMAQSOUD) | ~6 rows | **Add 4 employees to LineManagerOverrides.xlsx** |
| 🟠 3 | Sponsorship missed — OPEX in evidence but attendee absent | ~4 rows | Evidence gap; ask Laith to upload missing OPEX docs |
| 🟠 4 | Account 60308009 (Other) unhandled | 1 row | Ask AlJeel: when does 60308009 apply? |
| 🟡 5 | G&A override (60301004 vs 60301003) | ~3 rows | Ask AlJeel: do G&A-division staff always use 60301004? |

---
*Generated: 2026-05-27 | v16 locked | J26-640 = 100% | Combined: 406/478 = 85.0%*