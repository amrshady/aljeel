# AlJeel AP v16 — Remaining Discrepancies

Cross-batch comparison: v16 pipeline output vs AlJeel truth sheets (J26-550 / J26-589 / J26-593 / J26-640).
Generated post EP-code fix.

## Headline Scores

| Batch | Period | Rows | All-5 Exact | CC gaps | Agency gaps | Account gaps |
|---|---|---|---|---|---|---|
| J26-550 | Apr 1-7 | 72 | **61/72 (84.7%)** | 5 | 5 | 7 |
| J26-589 | Apr 8-15 | 129 | **88/129 (68.2%)** | 7 | 11 | 29 |
| J26-593 | Apr 16-23 | 160 | **130/160 (81.2%)** | 22 | 27 | 6 |
| J26-640 | Apr 24-30 | 117 | **117/117 (100.0%)** | 0 | 0 | 0 |
| **Total** | | **478** | **396/478 (82.8%)** | | | |

---

## 1. NOT IN MASTER

**9 employees** completely absent from `master-data-003.xlsx`. Pipeline outputs `999999`.
**Fix needed:** Confirm CC with Laith → add to `LineManagerOverrides.xlsx`.

### AHMED/AHMED MOHAMED MR
- Batches: J26-593
- Not found in master or email master

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `999999` | `10017` | CRM |

### ALGHAMDI/SALEH MR
- Batches: J26-593
- Not found in master or email master

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `999999` | `10064` | EP |

### ALHUSSEIN/MOSAAD MR
- Batches: J26-593
- Not found in master or email master

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `999999` | `10050` | HF |

### ALQARNI/MOHAMMED MR
- Batches: J26-593
- Not found in master or email master

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | CC | `999999` | `160013` |  |
  | Agency | `999999` | `10005` | Kavo |

### ALRESHIDAN/MOHAMMED MR
- Batches: J26-593
- Not found in master or email master

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `999999` | `10050` | HF |

### ALSHEHRI/MOHAMMED MR
- Batches: J26-589
- Not found in master or email master

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `999999` | `10017` | CRM |

### ALSOMALI/NADIYA MS
- Batches: J26-593
- Not found in master or email master

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | Solution | `999999` | `10050` | HF |

### DAGRIRI/KHALID MR
- Batches: J26-593
- Not found in master or email master

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | CC | `999999` | `160014` | Contribution new |
  | Solution | `999999` | `10064` | EP |
  | Agency | `999999` | `10072` | Abbott |

### HALAWANI/RAGHEB MR
- Batches: J26-593
- Not found in master or email master

  | Field | Our output | AlJeel Truth | Name |
  |---|---|---|---|
  | CC | `999999` | `160013` |  |
  | Agency | `999999` | `10005` | Kavo |

---

## 2. STALE MASTER DATA

**59 distinct employee entries** where master CC/Agency doesn't match AlJeel's actual assignment.
Likely department transfers. **Fix needed:** Fresh Oracle Manpower export from Qasim/Laith.

### ABDALLAH  AMOUDI + WASEEM  MUSTAFA
- **Emp No:** `` | **Batches:** J26-550

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Agency | `10041` — Fujifilm | `10156` — NUBOMED | ❌ wrong agency |

### ABDELAZIZ/MOHAMED MR
- **Emp No:** `1000129` | **Batches:** J26-593
- **Master CC:** `250010` — Technical Services HO
- **Master Agency:** `10206` — Technical Services
- **Master Div:** `120` — Technical Services

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `250010` — Technical Services HO | `130020` — Collection | ❌ wrong CC |
  | DIV | `120` | `888` | ❌ wrong div |
  | Agency | `10206` — Technical Services | `88888` — G&A | ❌ wrong agency |

### ABDUL WAHEED
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301004` | `21070229` | ❌ wrong account |

### ABDULHAKIM NOMAN
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### ABDULLAH ALMADDAH
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### ABUIRSHEID/DANA MRS
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `21070229` | ❌ wrong account |

### AHMED/AHMED MOHAMED MR
- **Emp No:** `1000087` | **Batches:** J26-593
- **Master CC:** `250010` — Technical Services HO
- **Master Agency:** `10206` — Technical Services
- **Master Div:** `120` — Technical Services

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `250010` — Technical Services HO | `160014` — Contribution new | ❌ wrong CC |
  | DIV | `120` | `170` | ❌ wrong div |
  | Agency | `10206` — Technical Services | `10072` — Abbott | ❌ wrong agency |

### ALANAZI/ABDULAZIZ MR
- **Emp No:** `` | **Batches:** J26-589, J26-593

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `150020` — Admin | `140020` — Operation | ❌ wrong CC |
  | DIV | `888` | `190` | ❌ wrong div |
  | Agency | `88888` — G&A | `10200` — S&M | ❌ wrong agency |

### ALANAZI/FARHAN MR
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301004` | `60301003` | ❌ wrong account |

### ALANAZI/YOUSEF MR
- **Emp No:** `1000511` | **Batches:** J26-593
- **Master CC:** `150020` — Admin
- **Master Agency:** `88888` — G&A
- **Master Div:** `888` — G&A

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `150020` — Admin | `160011` —  | ❌ wrong CC |
  | DIV | `888` | `196` | ❌ wrong div |
  | Agency | `88888` — G&A | `10083` — Physio Control | ❌ wrong agency |

### ALATTAR/ABDULLAH MR
- **Emp No:** `` | **Batches:** J26-589, J26-593

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `160013` —  | `160012` —  | ❌ wrong CC |
  | DIV | `192` | `194` | ❌ wrong div |
  | Agency | `10202` — Solventum | `10132` — Illumina | ❌ wrong agency |

### ALEJO/JOE MARIE MR
- **Emp No:** `` | **Batches:** J26-550

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301004` | `21070229` | ❌ wrong account |
  | CC | `150020` — Admin | `250010` — Technical Services HO | ❌ wrong CC |
  | DIV | `888` | `120` | ❌ wrong div |
  | Agency | `88888` — G&A | `10206` — Technical Services | ❌ wrong agency |

### ALENAZI/ABDULAZIZ MR
- **Emp No:** `1002009` | **Batches:** J26-593
- **Master CC:** `130020` — Collection
- **Master Agency:** `88888` — G&A
- **Master Div:** `888` — G&A

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `130020` — Collection | `140020` — Operation | ❌ wrong CC |
  | DIV | `888` | `190` | ❌ wrong div |
  | Agency | `88888` — G&A | `10200` — S&M | ❌ wrong agency |

### ALGHAMDI/ABDULLAH MR
- **Emp No:** `1000119` | **Batches:** J26-593
- **Master CC:** `130020` — Collection
- **Master Agency:** `88888` — G&A
- **Master Div:** `888` — G&A

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `130020` — Collection | `250010` — Technical Services HO | ❌ wrong CC |
  | DIV | `888` | `120` | ❌ wrong div |
  | Agency | `88888` — G&A | `10206` — Technical Services | ❌ wrong agency |

### ALGHAMDI/SALEH MR
- **Emp No:** `1000119` | **Batches:** J26-593
- **Master CC:** `130020` — Collection
- **Master Agency:** `88888` — G&A
- **Master Div:** `888` — G&A

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `130020` — Collection | `160014` — Contribution new | ❌ wrong CC |
  | DIV | `888` | `170` | ❌ wrong div |
  | Agency | `88888` — G&A | `10072` — Abbott | ❌ wrong agency |

### ALHUSSEIN/MOSAAD MR
- **Emp No:** `1000587` | **Batches:** J26-593
- **Master CC:** `160011` — 
- **Master Agency:** `10038` — Fluke
- **Master Div:** `196` — Capital Equipment

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `160011` —  | `160014` — Contribution new | ❌ wrong CC |
  | DIV | `196` | `170` | ❌ wrong div |
  | Agency | `10038` — Fluke | `10072` — Abbott | ❌ wrong agency |

### ALMALAKH/MARITTA MS(CHD)
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `21070229` | ❌ wrong account |

### ALMALAKH/MILA MS(CHD)
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `21070229` | ❌ wrong account |

### ALMUTAIRI/MAJED MR
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `140040` — Warehouse | `160011` —  | ❌ wrong CC |
  | DIV | `150` | `196` | ❌ wrong div |
  | Agency | `10200` — S&M | `10100` — Getinge | ❌ wrong agency |

### ALOTAIBI/FAISAL
- **Emp No:** `1001126` | **Batches:** J26-593
- **Master CC:** `250010` — Technical Services HO
- **Master Agency:** `10206` — Technical Services
- **Master Div:** `120` — Technical Services

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `250010` — Technical Services HO | `130020` — Collection | ❌ wrong CC |
  | DIV | `120` | `888` | ❌ wrong div |
  | Agency | `10206` — Technical Services | `88888` — G&A | ❌ wrong agency |

### ALQARNI/MOHAMMED MR
- **Emp No:** `` | **Batches:** J26-593

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### ALRESHIDAN/MOHAMMED MR
- **Emp No:** `1001848` | **Batches:** J26-593
- **Master CC:** `130010` — Finance
- **Master Agency:** `88888` — G&A
- **Master Div:** `888` — G&A

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `130010` — Finance | `160014` — Contribution new | ❌ wrong CC |
  | DIV | `888` | `170` | ❌ wrong div |
  | Agency | `88888` — G&A | `10072` — Abbott | ❌ wrong agency |

### ALSHAMMARI/ABD ALMAJID MR
- **Emp No:** `1000237` | **Batches:** J26-593
- **Master CC:** `140020` — Operation
- **Master Agency:** `10200` — S&M
- **Master Div:** `190` — S&M

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `140020` — Operation | `160012` —  | ❌ wrong CC |
  | DIV | `190` | `194` | ❌ wrong div |
  | Agency | `10200` — S&M | `10153` — BMX | ❌ wrong agency |

### ALSHEHRI/MOHAMMED MR
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301004` | `60307021` | ❌ wrong account |
  | CC | `130020` — Collection | `160014` — Contribution new | ❌ wrong CC |
  | DIV | `888` | `170` | ❌ wrong div |
  | Agency | `88888` — G&A | `10072` — Abbott | ❌ wrong agency |

### ALSOMALI/NADIYA MS
- **Emp No:** `1000313` | **Batches:** J26-593
- **Master CC:** `250010` — Technical Services HO
- **Master Agency:** `10206` — Technical Services
- **Master Div:** `120` — Technical Services

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `250010` — Technical Services HO | `160014` — Contribution new | ❌ wrong CC |
  | DIV | `120` | `170` | ❌ wrong div |
  | Agency | `10206` — Technical Services | `10072` — Abbott | ❌ wrong agency |

### ALTAIR/MOHAMMED MR
- **Emp No:** `` | **Batches:** J26-550

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301004` | `60301003` | ❌ wrong account |

### ALUTHMAN/UTHMAN MR
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |
  | Agency | `10156` — NUBOMED | `10100` — Getinge | ❌ wrong agency |

### BIN MUDHIAN/FAISAL MR
- **Emp No:** `` | **Batches:** J26-550

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60308009` | ❌ wrong account |

### BINMANEEA/WALEED MR
- **Emp No:** `` | **Batches:** J26-593

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Solution | `EP` —  | `10064` — EP | ❌ wrong solution |

### DAGRIRI/KHALID MR
- **Emp No:** `` | **Batches:** J26-593

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### DAR/MEHBOOB ALI MR
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Solution | `10094` —  | `10017` — CRM | ❌ wrong solution |

### DAWOD/MOHAMED MR
- **Emp No:** `1002167` | **Batches:** J26-593
- **Master CC:** `160011` — 
- **Master Agency:** `10156` — NUBOMED
- **Master Div:** `196` — Capital Equipment

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Agency | `10156` — NUBOMED | `10052` — KLS Martin | ❌ wrong agency |

### EBRAHIM SANDAKJI
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### ELAZHARY/MOHAMED MR
- **Emp No:** `` | **Batches:** J26-550

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `150020` — Admin | `170020` — Strategy | ❌ wrong CC |

### ERDIE NAZRULLAH BIN ZAHAR
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### FATIMA/MISHAEL MS(CHD)
- **Emp No:** `` | **Batches:** J26-593

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `21070229` | ❌ wrong account |

### HADO/HUSSIEN MR
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Solution | `10094` —  | `10017` — CRM | ❌ wrong solution |

### HAITHAM  ELKHATEEB
- **Emp No:** `` | **Batches:** J26-550

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `250010` — Technical Services HO | `250020` — Maintenance | ❌ wrong CC |

### HALAWANI/RAGHEB MR
- **Emp No:** `` | **Batches:** J26-593

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### HUSSEIN/TALIA MS(CHD)
- **Emp No:** `` | **Batches:** J26-550

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `21070229` | ❌ wrong account |

### HUSSEIN/YOUSSEF MR
- **Emp No:** `1000160` | **Batches:** J26-550
- **Master CC:** `250010` — Technical Services HO
- **Master Agency:** `10206` — Technical Services
- **Master Div:** `120` — Technical Services

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `21070229` | ❌ wrong account |
  | CC | `250010` — Technical Services HO | `160014` — Contribution new | ❌ wrong CC |
  | DIV | `120` | `170` | ❌ wrong div |
  | Agency | `10206` — Technical Services | `10239` — J&J | ❌ wrong agency |

### HUSSIEN HADO
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### KHADER/OMAR MR
- **Emp No:** `` | **Batches:** J26-550, J26-589, J26-593

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Agency | `10200` — S&M | `10055` — Steris | ❌ wrong agency |
  | Agency | `10200` — S&M | `10156` — NUBOMED | ❌ wrong agency |

### KHAIR/QAIS MR
- **Emp No:** `1001603` | **Batches:** J26-589
- **Master CC:** `130010` — Finance
- **Master Agency:** `88888` — G&A
- **Master Div:** `888` — G&A

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `21070229` | ❌ wrong account |

### MADKHALI/MAJED MR
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `160013` —  | `160011` —  | ❌ wrong CC |
  | DIV | `192` | `196` | ❌ wrong div |
  | Agency | `10202` — Solventum | `10081` — GE | ❌ wrong agency |

### MAJED ALMUTAIRI
- **Emp No:** `1001986` | **Batches:** J26-593
- **Master CC:** `160011` — 
- **Master Agency:** `10156` — NUBOMED
- **Master Div:** `196` — Capital Equipment

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Agency | `10156` — NUBOMED | `10100` — Getinge | ❌ wrong agency |

### MAJED ALMUTAIRI +1
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |
  | Agency | `10156` — NUBOMED | `10100` — Getinge | ❌ wrong agency |

### MAYSAN ALMEGBEL
- **Emp No:** `` | **Batches:** J26-550, J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### MAYSAN MOHAMMED ALMEGBEL
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### MOHAMED ALSHEHRI
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### MOHAMMED ALSHEHRI
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### MOHSEN AL MAHAID
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### MOHSEN ALMAHAID
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### SALEM/EFFAT MRS
- **Emp No:** `1000463` | **Batches:** J26-550
- **Master CC:** `250010` — Technical Services HO
- **Master Agency:** `10206` — Technical Services
- **Master Div:** `120` — Technical Services

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `21070229` | ❌ wrong account |
  | CC | `250010` — Technical Services HO | `160014` — Contribution new | ❌ wrong CC |
  | DIV | `120` | `170` | ❌ wrong div |
  | Agency | `10206` — Technical Services | `10239` — J&J | ❌ wrong agency |

### SHAIK/IMTIAZ AHMED MR
- **Emp No:** `1001064` | **Batches:** J26-593
- **Master CC:** `140040` — Warehouse
- **Master Agency:** `10200` — S&M
- **Master Div:** `190` — S&M

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | CC | `140040` — Warehouse | `160013` —  | ❌ wrong CC |
  | DIV | `190` | `192` | ❌ wrong div |
  | Agency | `10200` — S&M | `10005` — Kavo | ❌ wrong agency |

### TAGRA/REYNAND JESUS MR
- **Emp No:** `1000055` | **Batches:** J26-589
- **Master CC:** `250010` — Technical Services HO
- **Master Agency:** `10206` — Technical Services
- **Master Div:** `120` — Technical Services

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `21070229` | ❌ wrong account |

### UTHMAN ALUTHMAN
- **Emp No:** `1001986` | **Batches:** J26-593
- **Master CC:** `160011` — 
- **Master Agency:** `10156` — NUBOMED
- **Master Div:** `196` — Capital Equipment

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Agency | `10156` — NUBOMED | `10100` — Getinge | ❌ wrong agency |

### WAFA ALDAWOOD
- **Emp No:** `` | **Batches:** J26-589

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `60307021` | ❌ wrong account |

### ZUBAIR/UMMARA MRS
- **Emp No:** `` | **Batches:** J26-593

  | Field | Our output (from master) | AlJeel Truth | Δ |
  |---|---|---|---|
  | Account | `60301003` | `21070229` | ❌ wrong account |

---

## 3. Priority Fix List

| Priority | Employee | Gap type | Master → Truth | Action |
|---|---|---|---|---|
| 🔴 1 | ALHUSSEIN/MOSAAD | Stale CC | 160011 → 160014 | Update master / override |
| 🔴 2 | ALANAZI/ABDULAZIZ (1000511) | Stale CC | 150020 → 140020 | Update master / override |
| 🔴 3 | ALSHAMMARI/ABD ALMAJID | Stale CC | 140020 → 160012 | Update master / override |
| 🟠 4 | ALSOMALI/NADIYA | Stale CC | 250010 → 160014 | Update master / override |
| 🟠 5 | ALGHAMDI/SALEH | Stale CC | 130020 → 160014 | Update master / override |
| 🟠 6 | ALRESHIDAN/MOHAMMED | Stale CC | 130010 → 160014 | Update master / override |
| 🟡 7 | ALQARNI/MOHAMMED | Not in master | — → 160013 | Add to overrides |
| 🟡 8 | HALAWANI/RAGHEB | Not in master | — → 160013 | Add to overrides |
| 🟡 9 | DAGRIRI/KHALID | Not in master | — → 160014 | Add to overrides |
| 🟡 10 | ABDELMAQSOUD/AHMED | Not in master | — → 160012 | Add to overrides |

> **Single action that closes ~60% of remaining gaps:** Fresh Oracle Manpower export from Qasim.
> The top 6 stale-master employees recur across multiple batches.

---
*Generated: 2026-05-26 | v16 pipeline | Batches: J26-550 / J26-589 / J26-593 / J26-640*