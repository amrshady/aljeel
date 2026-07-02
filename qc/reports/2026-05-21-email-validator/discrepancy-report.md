# Discrepancy Report — J26-788 Email Validator (2026-05-21)

Line-by-line comparison: Oracle Fusion form values vs Manpower-derived segments.

## Employee Number Mismatches (8)

| SL | Passenger | Manpower Emp | Form Emp | Form Name | Suggestion |
|----|-----------|-----------|---------|-----------|----|
| 21 | HADDAD/HAMZAH MR - RUH JED (6905478435) | 1000226 | 1000529 | Hamzeh Hosin Haddad | Update Manpower lookup or verify which emp_no is c |
| 68 | HADDAD/HAMZAH MR - JED RUH (6905533359) | 1000226 | 1000529 | Hamzeh Hosin Haddad | Update Manpower lookup or verify which emp_no is c |
| 72 | ALMADHUN/ABDULRAHMAN MR - JED ABT JED (6905569440) | 1000354 | 1000443 | Abdelrahman Z Almadhoun | Update Manpower lookup or verify which emp_no is c |
| 81 | SHAYEB/ABDALLAH MR - AHB RUH (6905569509) | 1000473 | 1002378 | Abdallah Tawfiq Alshayeb | Update Manpower lookup or verify which emp_no is c |
| 83 | KALTHOUM/ABDALLAH MR - JED RUH JED (6905569511) | 1000473 | 1001759 | Abdullah Hesham Kalthoum | Update Manpower lookup or verify which emp_no is c |
| 84 | SHAYEB/ABDALLAH MR - RUH GIZ (6905569512) | 1000473 | 1002378 | Abdallah Tawfiq Alshayeb | Update Manpower lookup or verify which emp_no is c |
| 85 | ABDULLATIF/SALEM MR - JED MED JED (6905569515) | 1000463 | 1002078 | Nabel Abduljalil Fadhel | Update Manpower lookup or verify which emp_no is c |
| 95 | ALJAMAL/MOHAMMED ABDULMAJEED MR - RUH AJF RUH (690 | 1000196 | 1000601 | Mhammed Abdalmajed Aljama | Update Manpower lookup or verify which emp_no is c |

## Trip Value Differences (54)

**Note:** Form value = Oracle Fusion trip allowance budget. Invoice amount = actual ticket price from Jawal. These differ by design.

| SL | Passenger | Invoice (SAR) | Form Value (SAR) | Diff |
|----|-----------|--------------|-----------------|------|
| 1 | ELZAIM/AHMAD MR - RUH AJF (6905428827) | 700.01 | 730.00 | 29.99 |
| 3 | ALANAZI/FARHAN MR - RUH TUU RUH (6905428829) | 2800.00 | 850.00 | -1950.00 |
| 4 | MAHMOUD/BELAL MR - JED RUH (6905428830) | 1700.00 | 1750.00 | 50.00 |
| 6 | AMOUDI/ABDALLAH MR - JED MED JED (6905428837) | 1200.00 | 290.00 | -910.00 |
| 8 | ALANAZI/YOUSEF MR - RUH TUU RUH (6905428852) | 2590.00 | 400.00 | -2190.00 |
| 9 | ALEM/AHMED MR - JED GIZ JED (6905428853) | 1490.00 | 1120.00 | -370.00 |
| 11 | BAHKALI/ARIEJ MS - JED DMM JED (6905478406) | 1790.00 | 680.00 | -1110.00 |
| 14 | ALJAROUD/MUSTAFA MR - DMM JED (6905478421) | 600.00 | 680.00 | 80.00 |
| 16 | ALANAZI/ABDULAZIZ MR - JED GIZ JED (6905478425) | 1250.00 | 625.00 | -625.00 |
| 21 | HADDAD/HAMZAH MR - RUH JED (6905478435) | 570.00 | 1710.00 | 1140.00 |
| 22 | ALGHAMDI/ABDULLAH MR - RUH YNB RUH (6905478438) | 1850.01 | 680.00 | -1170.01 |
| 23 | BIN MUDHIAN/FAISAL MR - RUH WAE RUH (6905478459) | 1270.00 | 680.00 | -590.00 |
| 24 | ISMAIEL/YASIN MR - RUH DMM RUH (6905478461) | 1640.00 | 800.00 | -840.00 |
| 31 | ALMUSAYFIR/ABDULLAH MR - RUH YNB RUH (6905495636) | 1960.00 | 1200.00 | -760.00 |
| 32 | ALEM/AHMED MR - JED EAM JED (6905495637) | 1770.00 | 680.00 | -1090.00 |
| 33 | ALFAR/BARA ENG - JED TUU (6905495639) | 460.00 | 400.00 | -60.00 |
| 35 | ABOUSEWILAM/AMR MR - RUH AJF (6905495641) | 1470.00 | 1560.00 | 90.00 |
| 38 | MOSA/MAHAMED MR - RUH JED RUH (6905495648) | 1065.00 | 1120.00 | 55.00 |
| 39 | ABO NOUFAL/OMAR MR - RUH DMM RUH (6905495649) | 917.00 | 290.00 | -627.00 |
| 40 | ALEM/AHMED MR - JED RUH (6905495650) | 560.00 | 800.00 | 240.00 |
| ... | (34 more rows) | | | |

## Approver vs Line Manager Differences (0)

No approver differences found.

## Summary Statistics

| Category | Count | Impact |
|----------|-------|--------|
| Employee number mismatches | 8 | HOLD — verify correct emp_no |
| Trip value differences | 54 | INFO — expected (allowance vs ticket price) |
| Approver/manager differences | 0 | INFO — may indicate delegation or matrix reporting |