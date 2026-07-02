# Allocation Resolution Report - J26-788
## Generated: 2026-05-21

## Summary

| Outcome | Count |
|---------|-------|
| Resolved (single target) | 2 |
| Multi-candidate (review) | 10 |
| Still missing | 14 |
| **Total NTA lines** | **26** |

## Critical Finding: .msg Files Lack Allocation Language

All 84 .msg files in the J26-788 batch contain only generic approval stamps:
- Arabic: `يعتمد` / `يعتمد المرسل من قبلكم` (approved / approved by you)
- English: `Approved` / `Approved.`

**None contain subordinate allocation language** (e.g., 'charge to [Name]').
Tier 1 (deterministic) and Tier 2 (LLM) produce zero results on this batch.
All resolution comes from Tier 3 (hierarchy-based fallback using Manpower org tree).

### Blocker for Amr/Laith

Laith described the intended workflow as managers naming subordinates in the approval
email body. In practice, AlJeel's current approval emails are generic stamps.
Resolution requires either:
1. AlJeel updating their approval workflow to include allocation targets in email text
2. A separate allocation mapping file from Laith (manager to subordinate)
3. Accepting the hierarchy-based approach with manual review for multi-candidate cases

## Resolved Lines (Hierarchy - Single Target)

### Line 29: AAMIR ABDELLATIF SHARIF - TRAIN SERVICE (26-729)
- **Employee:** Aamir Abdellatif Sharif (1000615)
- **Amount:** SAR 160.00
- **Ticket:** N/A | .msg files: 0
- **Allocated to:** Abdel Hadi Mustafa Helmi Al Hato (1000596)
- **Method:** hierarchy_single (confidence: 0.70)
- **Reasoning:** Single usable subordinate with same Agency (10052): Abdel Hadi Mustafa Helmi Al Hato (1000596)

### Line 30: AAMIR ABDELLATIF SHARIF - TRAIN SERVICE (26-730)
- **Employee:** Aamir Abdellatif Sharif (1000615)
- **Amount:** SAR 120.00
- **Ticket:** N/A | .msg files: 0
- **Allocated to:** Abdel Hadi Mustafa Helmi Al Hato (1000596)
- **Method:** hierarchy_single (confidence: 0.70)
- **Reasoning:** Single usable subordinate with same Agency (10052): Abdel Hadi Mustafa Helmi Al Hato (1000596)

## Multi-Candidate Lines (Need Human Review)

### Line 4: MAHMOUD/BELAL MR - JED RUH (6905428830)
- **Employee:** Belal Issa Mahmoud (1000450)
- **Amount:** SAR 1,700.00
- **Ticket:** 6905428830 | .msg files: 1
- **Candidates:**
  - Bashar Rasheed Jalal Omar (1002343) Agency: 10081
  - Hala Nader A Aljishi (1002391) Agency: 10081
  - Yousef  Abdelrazek Younes (1002427) Agency: 10081
- **Reasoning:** Multiple usable subordinates with same Agency (10081): ['Bashar Rasheed Jalal Omar', 'Hala Nader A Aljishi', 'Yousef  Abdelrazek Younes']

### Line 7: MAHMOUD/BELAL MR - JED RUH (1936046286)
- **Employee:** Belal Issa Mahmoud (1000450)
- **Amount:** SAR 138.00
- **Ticket:** 1936046286 | .msg files: 0
- **Candidates:**
  - Bashar Rasheed Jalal Omar (1002343) Agency: 10081
  - Hala Nader A Aljishi (1002391) Agency: 10081
  - Yousef  Abdelrazek Younes (1002427) Agency: 10081
- **Reasoning:** Multiple usable subordinates with same Agency (10081): ['Bashar Rasheed Jalal Omar', 'Hala Nader A Aljishi', 'Yousef  Abdelrazek Younes']

### Line 49: WADI/MAHMOUD MR - JED RUH JED (6905495703)
- **Employee:** Mahmoud  Ahmad  Wadi (1001011)
- **Amount:** SAR 1,115.01
- **Ticket:** 6905495703 | .msg files: 1
- **Candidates:**
  - Somar Ahmad Alaksah (1000404) Agency: 10005
  - Moayyad M R Shihab (1000502) Agency: 10005
  - Abdulrahman Aljawish (1001058) Agency: 10005
- **Reasoning:** Multiple usable subordinates with same Agency (10005): ['Somar Ahmad Alaksah', 'Moayyad M R Shihab', 'Abdulrahman Aljawish']

### Line 51: ELKAHLOUT/NABEL MR - RUH AHB RUH (6905495712)
- **Employee:** Nabel Ahmed Mousa Elkahlout (1000182)
- **Amount:** SAR 1,180.00
- **Ticket:** 6905495712 | .msg files: 1
- **Candidates:**
  - Ibrahim Wesam Ibrahim Lello (1001957) Agency: 10126
  - Omar Iehab Ahmed Abu Noufal (1002345) Agency: 10126
- **Reasoning:** Multiple usable subordinates with same Agency (10126): ['Ibrahim Wesam Ibrahim Lello', 'Omar Iehab Ahmed Abu Noufal']

### Line 60: MOSTAFA AMER - Kimpton Vividora Barcelona - 1 NTS. (26-731)
- **Employee:** Mostafa Mahmoud Mohamed Amer (1002091)
- **Amount:** SAR 6,300.00
- **Ticket:** N/A | .msg files: 0
- **Candidates:**
  - Yousef Saleh S Alnasyan (1000826) Agency: 10153
  - Wejdan Ishaq M Bukhari (1001255) Agency: 10153
  - Maymunah Raed M Albukhari (1001935) Agency: 10153
- **Reasoning:** Multiple usable direct subordinates: ['Yousef Saleh S Alnasyan', 'Wejdan Ishaq M Bukhari', 'Maymunah Raed M Albukhari']

### Line 61: MOSTAFA AMER - Kimpton Vividora Barcelona - 1 NTS. (26-732)
- **Employee:** Mostafa Mahmoud Mohamed Amer (1002091)
- **Amount:** SAR 2,650.00
- **Ticket:** N/A | .msg files: 0
- **Candidates:**
  - Yousef Saleh S Alnasyan (1000826) Agency: 10153
  - Wejdan Ishaq M Bukhari (1001255) Agency: 10153
  - Maymunah Raed M Albukhari (1001935) Agency: 10153
- **Reasoning:** Multiple usable direct subordinates: ['Yousef Saleh S Alnasyan', 'Wejdan Ishaq M Bukhari', 'Maymunah Raed M Albukhari']

### Line 62: SULTAN ABU DOGHMEH - Kimpton Vividora Barcelona - 1 NTS. (26
- **Employee:** Sultan Mohammad Abu Doghmeh (1000995)
- **Amount:** SAR 6,300.00
- **Ticket:** N/A | .msg files: 0
- **Candidates:**
  - Mohamed Ahmed Diab Daloul (1000606) Agency: 10109
  - Waleed  Hassan A Alasiri (1001906) Agency: 10153
  - Jawdat  Ammar  Jawdat  Shorab (1002057) Agency: 10153
  - Said Ali Said Ali (1000414) Agency: 10153
  - Mohamed  Abdelsalam Abdelsalam Elgamal (1001256) Agency: 10155
- **Reasoning:** Multiple usable indirect subordinates: ['Mohamed Ahmed Diab Daloul', 'Waleed  Hassan A Alasiri', 'Jawdat  Ammar  Jawdat  Shorab', 'Said Ali Said Ali', 'Mohamed  Abdelsalam Abdelsalam Elgamal', 'Fatima

### Line 63: SULTAN ABU DOGHMEH - Kimpton Vividora Barcelona - 1 NTS. (26
- **Employee:** Sultan Mohammad Abu Doghmeh (1000995)
- **Amount:** SAR 2,650.00
- **Ticket:** N/A | .msg files: 0
- **Candidates:**
  - Mohamed Ahmed Diab Daloul (1000606) Agency: 10109
  - Waleed  Hassan A Alasiri (1001906) Agency: 10153
  - Jawdat  Ammar  Jawdat  Shorab (1002057) Agency: 10153
  - Said Ali Said Ali (1000414) Agency: 10153
  - Mohamed  Abdelsalam Abdelsalam Elgamal (1001256) Agency: 10155
- **Reasoning:** Multiple usable indirect subordinates: ['Mohamed Ahmed Diab Daloul', 'Waleed  Hassan A Alasiri', 'Jawdat  Ammar  Jawdat  Shorab', 'Said Ali Said Ali', 'Mohamed  Abdelsalam Abdelsalam Elgamal', 'Fatima

### Line 66: AYED ZEIADH - RUH JED RUH (CDF5FD)
- **Employee:** Ayed Ahmad Ayed Zeiadeh (1000320)
- **Amount:** SAR 1,025.00
- **Ticket:** N/A | .msg files: 0
- **Candidates:**
  - Mustafa Mahmoud Aljaroud (1000361) Agency: 10055
  - Ebaa Zakaria Al Hindi (1000411) Agency: 10055
  - Mohamma Sameer M. S. Al-Mohtasib (1000505) Agency: 10055
  - Omar  Abdullah M Alluwaimi (1000953) Agency: 10055
- **Reasoning:** Multiple usable subordinates with same Agency (10055): ['Mustafa Mahmoud Aljaroud', 'Ebaa Zakaria Al Hindi', 'Mohamma Sameer M. S. Al-Mohtasib', 'Omar  Abdullah M Alluwaimi']

### Line 94: WADI/MAHMOUD MR - JED GIZ JED (6905600592)
- **Employee:** Mahmoud  Ahmad  Wadi (1001011)
- **Amount:** SAR 1,685.00
- **Ticket:** 6905600592 | .msg files: 1
- **Candidates:**
  - Somar Ahmad Alaksah (1000404) Agency: 10005
  - Moayyad M R Shihab (1000502) Agency: 10005
  - Abdulrahman Aljawish (1001058) Agency: 10005
- **Reasoning:** Multiple usable subordinates with same Agency (10005): ['Somar Ahmad Alaksah', 'Moayyad M R Shihab', 'Abdulrahman Aljawish']

## Unresolved Lines (No Subordinates in Manpower)

### Line 11: BAHKALI/ARIEJ MS - JED DMM JED (6905478406)
- **Employee:** Ariej Ibrahim Bahkali (1002469)
- **Amount:** SAR 1,790.00
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Ariej Ibrahim Bahkali (1002469)

### Line 24: ISMAIEL/YASIN MR - RUH DMM RUH (6905478461)
- **Employee:** Yasin Salahaldeen Osman Ismaiel (1001406)
- **Amount:** SAR 1,640.00
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Yasin Salahaldeen Osman Ismaiel (1001406)

### Line 25: BABAKR/MOHAMMED MR - RUH DMM (6905478467)
- **Employee:** Ashraf Mohamed Abdelaaty Saad (1000030)
- **Amount:** SAR 510.00
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Ashraf Mohamed Abdelaaty Saad (1000030)

### Line 26: BABAKR/MOHAMMED MR - DMM RUH (6905478468)
- **Employee:** Ashraf Mohamed Abdelaaty Saad (1000030)
- **Amount:** SAR 440.00
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Ashraf Mohamed Abdelaaty Saad (1000030)

### Line 42: ISMAIEL/YASIN MR - RUH JED RUH (6905495656)
- **Employee:** Yasin Salahaldeen Osman Ismaiel (1001406)
- **Amount:** SAR 1,115.01
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Yasin Salahaldeen Osman Ismaiel (1001406)

### Line 48: AHMED/NAGMALDIN MR - RUH JED RUH (6905495693)
- **Employee:** Nagmaldin  Abdelhamid Ahmed (1002294)
- **Amount:** SAR 1,069.99
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Nagmaldin  Abdelhamid Ahmed (1002294)

### Line 50: ALASIRI/ABDULAZIZ MR - RUH AHB RUH (6905495711)
- **Employee:** Abdulaziz Mohammed Saad Alasiri (1000975)
- **Amount:** SAR 1,310.00
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Abdulaziz Mohammed Saad Alasiri (1000975)

### Line 57: KHADER/OMAR MR - RUH JED RUH (6905533338)
- **Employee:** Omar Mahmoud Khader (1000453)
- **Amount:** SAR 1,100.00
- **Direct subordinates:** 1 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Omar Mahmoud Khader (1000453)

### Line 67: BABAKR/MOHAMMED MR - RUH JED RUH (6905533352)
- **Employee:** Ashraf Mohamed Abdelaaty Saad (1000030)
- **Amount:** SAR 1,115.01
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Ashraf Mohamed Abdelaaty Saad (1000030)

### Line 90: BIN RAJAB/FERAS MR - JED RUH JED (6905569523)
- **Employee:** Feras Mohammed  Bin Rajab (1002217)
- **Amount:** SAR 1,050.00
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Feras Mohammed  Bin Rajab (1002217)

### Line 91: JAMAL/ABDULMALIK MR - JED RUH (6905569525)
- **Employee:** Abdulmalik  Yasir S Jamal (1001799)
- **Amount:** SAR 650.00
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Abdulmalik  Yasir S Jamal (1001799)

### Line 92: JAMAL/ABDULMALIK MR - RUH JED (6905569526)
- **Employee:** Abdulmalik  Yasir S Jamal (1001799)
- **Amount:** SAR 650.00
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Abdulmalik  Yasir S Jamal (1001799)

### Line 93: SAAD/ASHRAF MR - JED GIZ JED (6905600591)
- **Employee:** Ashraf Mohamed Abdelaaty Saad (1000030)
- **Amount:** SAR 1,685.00
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Ashraf Mohamed Abdelaaty Saad (1000030)

### Line 96: RATL/CHARLES MR - RUH DMM RUH (6905600631)
- **Employee:** Charles  Salim  Ratl (1002405)
- **Amount:** SAR 1,510.00
- **Direct subordinates:** 0 (all NTA or none)
- **Reasoning:** No usable subordinates found for manager Charles  Salim  Ratl (1002405)
